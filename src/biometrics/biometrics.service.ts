import { Injectable } from '@nestjs/common';
import { BiometricsRow, DtrRow } from '../lib/data/biometrics.interface';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { EnrollBiometricDto } from './dto/enroll-biometric.dto';

export interface EnrolledBiometricRecord {
  id: string;
  biometrics_id: string | null;
  biometrics_fingerprint: string | null;
  authenticator_fingerprint: string | null;
  nfc_id: string | null;
  rfid: string | null;
  created_at: string;
  updated_at: string;
  professor_id: string | null;
  staff_id: string | null;
  user_type: 'professor' | 'staff' | 'unassigned';
  employee_id: string;
  name: string;
  email: string;
  department: string;
  position: string;
  avatar_url: string | null;
}

export type UserType = 'professor' | 'staff';
export type CredentialKind = 'biometric' | 'authenticator' | 'nfc' | 'rfid';
export type PunchAction =
  'time_in' | 'time_out' | 'duplicate' | 'already_completed';

export class BiometricsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Owner {
  biometricsRowId: string; // dtr_biometrics.id (UUID)
  slot: string | null; // dtr_biometrics.biometrics_id (fingerprint slot as text); this is what dtr.biometrics_id references
  professorId: string | null;
  staffId: string | null;
  viaAuthenticator: boolean;
}

export interface PunchResult {
  action: PunchAction;
  recordId: string;
  shiftDate: string;
  timeIn: string | null;
  timeOut: string | null;
  totalHours: string;
  onSite: boolean;
  session: number; // 1 = first time in of the day, 2 = second, ...
  professorId: string | null;
  staffId: string | null;
}

// Whitelisted columns (safe to interpolate).
const CREDENTIAL_COLUMN: Record<CredentialKind, string> = {
  biometric: 'biometrics_id',
  authenticator: 'authenticator_fingerprint',
  nfc: 'nfc_id',
  rfid: 'rfid',
};

const TZ = 'Asia/Manila';
const TODAY = `(NOW() AT TIME ZONE '${TZ}')::date`;
const NOW_TIME = `(NOW() AT TIME ZONE '${TZ}')::time(0)`;
const DEBOUNCE_SECONDS = 60; // ignore a second scan right after a punch
const MAX_SLOT = Number(process.env.BIOMETRIC_MAX_SLOT ?? 49); // highest template slot to hand out
// time in/out pairs allowed per day (2 = AM + PM). 1 = a single time in/out per day.
// const MAX_SESSIONS = Math.max(
//   1,
//   Number(process.env.BIOMETRIC_MAX_SESSIONS ?? 2),
// );
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class BiometricsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly loggerService: LoggerService,
  ) {}

  private get db() {
    return this.databaseService.getClient();
  }

  // ───────────────────────── Registration ─────────────────────────

  private userColumn(userType: UserType): 'professor_id' | 'staff_id' {
    if (userType === 'professor') return 'professor_id';
    if (userType === 'staff') return 'staff_id';
    throw new BiometricsError(
      'invalid_request',
      "'userType' must be 'professor' or 'staff'",
    );
  }

  private checkUser(userType: UserType, userId: string) {
    const col = this.userColumn(userType);
    if (typeof userId !== 'string' || !UUID_RE.test(userId)) {
      throw new BiometricsError('invalid_request', "'userId' must be a UUID");
    }
    return col;
  }

  /** Throws registration_closed if this user already holds a fingerprint slot. */
  async assertCanRegister(userType: UserType, userId: string): Promise<void> {
    const col = this.checkUser(userType, userId);
    const { rows } = await this.db.query<BiometricsRow>(
      `SELECT biometrics_id FROM dtr_biometrics WHERE ${col} = $1 LIMIT 1`,
      [userId],
    );
    if (rows[0]?.biometrics_id != null) {
      throw new BiometricsError(
        'registration_closed',
        'This user is already registered. An admin must reset registrations first.',
      );
    }
  }
  async nextFreeSlot(): Promise<number> {
    const { rows } = await this.db.query<{ s: number | string }>(
      `SELECT s FROM generate_series(1, $1::int) s
     WHERE NOT EXISTS (
       SELECT 1 FROM dtr_biometrics
       WHERE biometrics_id = s::text
     )
     ORDER BY s
     LIMIT 1`,
      [MAX_SLOT],
    );

    if (!rows[0]) {
      throw new BiometricsError(
        'no_free_slot',
        'No free fingerprint slots left',
      );
    }

    return Number(rows[0].s);
  }

  /** Call only after the device confirmed the template was stored. */
  async saveRegistration(
    userType: UserType,
    userId: string,
    slot: number,
  ): Promise<void> {
    const col = this.checkUser(userType, userId);
    const existing = await this.db.query<BiometricsRow>(
      `SELECT id FROM dtr_biometrics WHERE ${col} = $1 LIMIT 1`,
      [userId],
    );
    if (existing.rows[0]) {
      await this.db.query(
        `UPDATE dtr_biometrics SET biometrics_id = $1, updated_at = NOW() WHERE id = $2`,
        [String(slot), existing.rows[0].id],
      );
    } else {
      await this.db.query(
        `INSERT INTO dtr_biometrics (${col}, biometrics_id) VALUES ($1, $2)`,
        [userId, String(slot)],
      );
    }
  }

  /**
   * Admin reset: every biometrics_id becomes NULL (registration reopens). Returns rows cleared.
   * dtr.biometrics_id references dtr_biometrics.biometrics_id, so the references are nulled in the
   * same statement (a plain UPDATE would hit the foreign key once any dtr row exists).
   */
  async resetRegistrations(): Promise<number> {
    const res = await this.db.query(
      `WITH unlink AS (
         UPDATE dtr SET biometrics_id = NULL WHERE biometrics_id IS NOT NULL
       )
       UPDATE dtr_biometrics SET biometrics_id = NULL, updated_at = NOW()
       WHERE biometrics_id IS NOT NULL`,
    );
    return res.rowCount ?? 0;
  }

  async getRegistrationStatus(): Promise<{
    registered: number;
    nextFreeSlot: number | null;
  }> {
    const { rows } = await this.db.query(
      `SELECT COUNT(*)::int AS registered FROM dtr_biometrics WHERE biometrics_id IS NOT NULL`,
    );
    let next: number | null = null;
    try {
      next = await this.nextFreeSlot();
    } catch {
      /* full */
    }

    const registered_row = rows[0] as { registered: number };

    return { registered: registered_row.registered, nextFreeSlot: next };
  }

  // ───────────────────────── Lookup ─────────────────────────

  async findOwner(kind: CredentialKind, value: string): Promise<Owner | null> {
    const col = CREDENTIAL_COLUMN[kind];
    if (!col)
      throw new BiometricsError('invalid_request', 'Unknown credential kind');
    if (typeof value !== 'string' || !value) {
      throw new BiometricsError('invalid_request', "'value' is required");
    }

    const where =
      kind === 'biometric'
        ? `(biometrics_id = $1 OR authenticator_fingerprint = $1)`
        : `${col} = $1`;

    const { rows } = await this.db.query<
      BiometricsRow & { via_authenticator: boolean }
    >(
      `SELECT id, biometrics_id, professor_id, staff_id,
            COALESCE(authenticator_fingerprint = $1 AND biometrics_id IS DISTINCT FROM $1, false) AS via_authenticator
     FROM dtr_biometrics
     WHERE ${where}
     ORDER BY (biometrics_id = $1) DESC NULLS LAST
     LIMIT 1`,
      [value],
    );
    if (!rows[0]) return null;
    return {
      biometricsRowId: rows[0].id,
      slot: rows[0].biometrics_id ?? null,
      professorId: rows[0].professor_id,
      staffId: rows[0].staff_id,
      viaAuthenticator: rows[0].via_authenticator,
    };
  }

  // ───────────────────────── Attendance ─────────────────────────

  /**
   * Resolve a credential to its owner and punch.
   * on_site = true for biometric/NFC/RFID devices, false for the authenticator (app).
   */
  async punchByCredential(
    kind: CredentialKind,
    value: string,
  ): Promise<PunchResult> {
    const owner = await this.findOwner(kind, value);
    if (!owner)
      throw new BiometricsError(
        'unknown_credential',
        'No user is registered for this credential',
      );
    return this.punch(owner, !owner.viaAuthenticator);
  }

  /**
   * A day holds up to MAX_SESSIONS sessions, one dtr row each:
   *   no open row  -> new row with time_in (until MAX_SESSIONS rows exist for today)
   *   open row     -> time_out + total_hours for that session
   * Set BIOMETRIC_MAX_SESSIONS=1 for a single time in/out per day.
   * Only TODAY's rows are touched, so a missed time-out from a previous day stays
   * time_out NULL / total_hours 0 (absent) and never blocks today's time in.
   * on_site is set on time in and kept on time out.
   * A scan within DEBOUNCE_SECONDS of the last punch is ignored ('duplicate').
   */
  async punch(owner: Owner, onSite: boolean): Promise<PunchResult> {
    const { rows } = await this.db.query<
      DtrRow & { too_soon: boolean; within_window: boolean }
    >(
      `SELECT id, time_in::text, time_out::text, total_hours::text, on_site, shift_date::text,
            (updated_at > NOW() - INTERVAL '${DEBOUNCE_SECONDS} seconds') AS too_soon,
            (created_at > NOW() - INTERVAL '24 hours') AS within_window
     FROM dtr
     WHERE professor_id IS NOT DISTINCT FROM $1::uuid
       AND staff_id IS NOT DISTINCT FROM $2::uuid
     ORDER BY created_at DESC LIMIT 1`,
      [owner.professorId, owner.staffId],
    );
    const row = rows[0];
    const who = { professorId: owner.professorId, staffId: owner.staffId };

    if (row?.too_soon) return this.toResult('duplicate', row, who, 1);

    // open row, started within 24h -> time out
    if (row && row.time_in && !row.time_out && row.within_window) {
      const upd = await this.db.query<DtrRow>(
        `UPDATE dtr
       SET time_out = ${NOW_TIME},
           total_hours = ROUND(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0, 2),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, time_in::text, time_out::text, total_hours::text, on_site, shift_date::text`,
        [row.id],
      );
      return this.toResult('time_out', upd.rows[0], who, 1);
    }

    // no row, last one closed, or open one older than 24h (stays absent) -> new time in
    return this.insertSession(owner, onSite, 1, who);
  }

  private async insertSession(
    owner: Owner,
    onSite: boolean,
    session: number,
    who: { professorId: string | null; staffId: string | null },
  ): Promise<PunchResult> {
    const ins = await this.db.query<DtrRow>(
      `INSERT INTO dtr (professor_id, staff_id, biometrics_id, time_in, shift_date, on_site)
       VALUES ($1, $2, $3, ${NOW_TIME}, ${TODAY}, $4)
       RETURNING id, time_in::text, time_out::text, total_hours::text, on_site, shift_date::text`,
      [owner.professorId, owner.staffId, owner.slot, onSite],
    );
    return this.toResult('time_in', ins.rows[0], who, session);
  }

  /** Latest dtr row for today (or null). */
  async getTodayRecord(userType: UserType, userId: string) {
    const col = this.checkUser(userType, userId);
    const { rows } = await this.db.query<DtrRow>(
      `SELECT id, time_in::text, time_out::text, total_hours::text, on_site, shift_date::text
       FROM dtr WHERE ${col} = $1 AND shift_date = ${TODAY}
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    return rows[0] ?? null;
  }

  /** Every session for today plus the day's total hours. */
  async getTodayRecords(userType: UserType, userId: string) {
    const col = this.checkUser(userType, userId);
    const { rows } = await this.db.query<DtrRow>(
      `SELECT id, time_in::text, time_out::text, total_hours::text, on_site, shift_date::text
       FROM dtr WHERE ${col} = $1 AND shift_date = ${TODAY}
       ORDER BY created_at ASC`,
      [userId],
    );
    const total = rows.reduce((sum, r) => sum + Number(r.total_hours ?? 0), 0);
    return { sessions: rows, totalHours: Math.round(total * 100) / 100 };
  }

  private toResult(
    action: PunchAction,
    r: DtrRow,
    who: { professorId: string | null; staffId: string | null },
    session: number,
  ): PunchResult {
    return {
      action,
      recordId: r.id,
      shiftDate: r.shift_date,
      timeIn: r.time_in,
      timeOut: r.time_out,
      totalHours: r.total_hours,
      onSite: r.on_site,
      session,
      ...who,
    };
  }

  async getEnrolledBiometrics() {
    try {
      const result = await this.db.query(`
        SELECT 
          b.id,
          b.biometrics_id,
          b.biometrics_fingerprint,
          b.authenticator_fingerprint,
          b.nfc_id,
          b.rfid,
          b.created_at,
          b.updated_at,
          b.professor_id,
          b.staff_id,
          p.employee_id AS prof_employee_id,
          p.firstname AS prof_firstname,
          p.lastname AS prof_lastname,
          p.email AS prof_email,
          p.department AS prof_department,
          p.position AS prof_position,
          p.avatar_url AS prof_avatar_url,
          s.employee_id AS staff_employee_id,
          s.firstname AS staff_firstname,
          s.lastname AS staff_lastname,
          s.email AS staff_email,
          s.department AS staff_department,
          s.position AS staff_position,
          s.avatar_url AS staff_avatar_url
        FROM dtr_biometrics b
        LEFT JOIN user_professors p ON b.professor_id = p.id
        LEFT JOIN user_staffs s ON b.staff_id = s.id
        ORDER BY b.created_at DESC
      `);

      const formatted: EnrolledBiometricRecord[] = result.rows.map((row) => {
        const isProf = Boolean(row.professor_id);
        const isStaff = Boolean(row.staff_id);

        const employee_id = isProf
          ? row.prof_employee_id || ''
          : isStaff
            ? row.staff_employee_id || ''
            : '';

        const name = isProf
          ? `${row.prof_firstname || ''} ${row.prof_lastname || ''}`.trim()
          : isStaff
            ? `${row.staff_firstname || ''} ${row.staff_lastname || ''}`.trim()
            : 'Unassigned Personnel';

        const email = isProf
          ? row.prof_email || ''
          : isStaff
            ? row.staff_email || ''
            : '';

        const department = isProf
          ? row.prof_department || 'Academic'
          : isStaff
            ? row.staff_department || 'Operations'
            : 'General';

        const position = isProf
          ? row.prof_position || 'Faculty'
          : isStaff
            ? row.staff_position || 'Staff'
            : '';

        const avatar_url = isProf ? row.prof_avatar_url : row.staff_avatar_url;

        return {
          id: row.id,
          biometrics_id: row.biometrics_id,
          biometrics_fingerprint: row.biometrics_fingerprint,
          authenticator_fingerprint: row.authenticator_fingerprint,
          nfc_id: row.nfc_id,
          rfid: row.rfid,
          created_at: row.created_at,
          updated_at: row.updated_at,
          professor_id: row.professor_id,
          staff_id: row.staff_id,
          user_type: isProf ? 'professor' : isStaff ? 'staff' : 'unassigned',
          employee_id,
          name,
          email,
          department,
          position,
          avatar_url,
        };
      });

      return SuccessHandler('Successfully fetched biometrics', 200, formatted);
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500, error.name)
        : ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async getSlotsSummary() {
    try {
      const result = await this.db.query(`
        SELECT biometrics_id
        FROM dtr_biometrics
        WHERE biometrics_id IS NOT NULL
      `);

      const occupiedSlots = new Set<number>();
      for (const row of result.rows) {
        const slotNum = parseInt(row.biometrics_id, 10);
        if (!isNaN(slotNum)) {
          occupiedSlots.add(slotNum);
        }
      }

      // AS608 max capacity: 0 to 127 (128 slots)
      let nextAvailableSlot = -1;
      for (let i = 0; i <= 127; i++) {
        if (!occupiedSlots.has(i)) {
          nextAvailableSlot = i;
          break;
        }
      }

      return SuccessHandler('Successfully fetched slot summary', 200, {
        totalCapacity: 128,
        occupiedCount: occupiedSlots.size,
        availableCount: Math.max(0, 128 - occupiedSlots.size),
        occupiedSlots: Array.from(occupiedSlots).sort((a, b) => a - b),
        nextAvailableSlot,
      });
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500, error.name)
        : ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async enrollFingerprint(data: EnrollBiometricDto) {
    try {
      if (!data.professor_id && !data.staff_id) {
        return ErrorHandler(
          'Either professor_id or staff_id must be provided',
          400,
        );
      }
      if (!data.biometrics_id) {
        return ErrorHandler('biometrics_id (slot ID) is required', 400);
      }

      // Check if slot is already occupied by someone else
      const conflictCheck = await this.db.query(
        `
        SELECT id, professor_id, staff_id 
        FROM dtr_biometrics 
        WHERE biometrics_id = $1
      `,
        [data.biometrics_id.trim()],
      );

      if (conflictCheck.rows.length > 0) {
        const existing = conflictCheck.rows[0];
        const isSame =
          (data.professor_id && existing.professor_id === data.professor_id) ||
          (data.staff_id && existing.staff_id === data.staff_id);

        if (!isSame) {
          return ErrorHandler(
            `Fingerprint slot ID ${data.biometrics_id} is already assigned to another personnel.`,
            409,
          );
        }
      }

      // Check if this person already has a biometric record
      let existingRecord: { id: string } | null = null;
      if (data.professor_id) {
        const r = await this.db.query(
          `SELECT id FROM dtr_biometrics WHERE professor_id = $1`,
          [data.professor_id],
        );
        if (r.rows.length > 0) existingRecord = r.rows[0];
      } else if (data.staff_id) {
        const r = await this.db.query(
          `SELECT id FROM dtr_biometrics WHERE staff_id = $1`,
          [data.staff_id],
        );
        if (r.rows.length > 0) existingRecord = r.rows[0];
      }

      let enrolledId: string;

      if (existingRecord) {
        // Update
        const updateRes = await this.db.query(
          `
          UPDATE dtr_biometrics
          SET biometrics_id = $1,
              biometrics_fingerprint = COALESCE($2, biometrics_fingerprint),
              authenticator_fingerprint = COALESCE($3, authenticator_fingerprint),
              nfc_id = COALESCE($4, nfc_id),
              rfid = COALESCE($5, rfid),
              updated_at = NOW()
          WHERE id = $6
          RETURNING id
        `,
          [
            data.biometrics_id.trim(),
            data.biometrics_fingerprint ?? null,
            data.authenticator_fingerprint ?? null,
            data.nfc_id ?? null,
            data.rfid ?? null,
            existingRecord.id,
          ],
        );
        enrolledId = updateRes.rows[0].id;
      } else {
        // Insert
        const insertRes = await this.db.query(
          `
          INSERT INTO dtr_biometrics (
            professor_id,
            staff_id,
            biometrics_id,
            biometrics_fingerprint,
            authenticator_fingerprint,
            nfc_id,
            rfid
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id
        `,
          [
            data.professor_id ?? null,
            data.staff_id ?? null,
            data.biometrics_id.trim(),
            data.biometrics_fingerprint ?? null,
            data.authenticator_fingerprint ?? null,
            data.nfc_id ?? null,
            data.rfid ?? null,
          ],
        );
        enrolledId = insertRes.rows[0].id;
      }

      // Log to hardware_events
      const deviceName = data.device_name || 'fingerprint-reader-01';
      await this.db.query(
        `
        INSERT INTO hardware_events (device_name, event, status, details, occurred_at)
        VALUES ($1, $2, $3, $4, NOW())
      `,
        [
          deviceName,
          'Fingerprint Enrolled',
          'Success',
          `Biometric slot ID: ${data.biometrics_id} registered into database.`,
        ],
      );

      // Log to system_logs
      void this.loggerService.logSystemEvent({
        actor_label: 'Administrator',
        kind: 'security',
        event: 'Biometric Fingerprint Enrolled',
        detail: `Fingerprint ID ${data.biometrics_id} linked to database ID: ${enrolledId}`,
      });

      return SuccessHandler(
        'Fingerprint successfully enrolled to database',
        201,
        {
          id: enrolledId,
          biometrics_id: data.biometrics_id,
        },
      );
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500, error.name)
        : ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async deleteBiometric(id: string) {
    try {
      const existing = await this.db.query(
        `SELECT id, biometrics_id FROM dtr_biometrics WHERE id = $1`,
        [id],
      );

      if (existing.rows.length === 0) {
        return ErrorHandler('Biometric record not found', 404);
      }

      const slotId = existing.rows[0].biometrics_id;

      await this.db.query(`DELETE FROM dtr_biometrics WHERE id = $1`, [id]);

      // Log to hardware_events
      await this.db.query(
        `
        INSERT INTO hardware_events (device_name, event, status, details, occurred_at)
        VALUES ($1, $2, $3, $4, NOW())
      `,
        [
          'fingerprint-reader-01',
          'Fingerprint Removed',
          'Success',
          `Biometric slot ID: ${slotId} removed from database.`,
        ],
      );

      return SuccessHandler('Biometric record deleted successfully', 200, {
        id,
      });
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500, error.name)
        : ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
}

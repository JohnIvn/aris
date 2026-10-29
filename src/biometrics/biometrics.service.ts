import { Injectable } from '@nestjs/common';
import { BiometricsRow, DtrRow } from '../lib/data/biometrics.interface';
import { DatabaseService } from '../database/database.service';

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
const MAX_SESSIONS = Math.max(
  1,
  Number(process.env.BIOMETRIC_MAX_SESSIONS ?? 2),
);
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class BiometricsService {
  constructor(private readonly databaseService: DatabaseService) {}

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
    const { rows } = await this.db.query<BiometricsRow>(
      `SELECT id, biometrics_id, professor_id, staff_id FROM dtr_biometrics WHERE ${col} = $1 LIMIT 1`,
      [value],
    );
    if (!rows[0]) return null;
    return {
      biometricsRowId: rows[0].id,
      slot: rows[0].biometrics_id ?? null,
      professorId: rows[0].professor_id,
      staffId: rows[0].staff_id,
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
    return this.punch(owner, kind !== 'authenticator');
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
    const { rows } = await this.db.query<DtrRow & { sessions: number }>(
      `SELECT id, time_in::text, time_out::text, total_hours::text, on_site, shift_date::text,
              (updated_at > NOW() - INTERVAL '${DEBOUNCE_SECONDS} seconds') AS too_soon,
              COUNT(*) OVER ()::int AS sessions
       FROM dtr
       WHERE shift_date = ${TODAY}
         AND professor_id IS NOT DISTINCT FROM $1::uuid
         AND staff_id IS NOT DISTINCT FROM $2::uuid
       ORDER BY created_at DESC LIMIT 1`,
      [owner.professorId, owner.staffId],
    );
    const row = rows[0];
    const sessions = row?.sessions ?? 0;
    const who = { professorId: owner.professorId, staffId: owner.staffId };

    if (!row) return this.insertSession(owner, onSite, 1, who);
    if (row.too_soon) return this.toResult('duplicate', row, who, sessions);

    if (!row.time_in) {
      // row created elsewhere without a time in
      const upd = await this.db.query<DtrRow>(
        `UPDATE dtr SET time_in = ${NOW_TIME}, on_site = $2, biometrics_id = $3, updated_at = NOW()
         WHERE id = $1
         RETURNING id, time_in::text, time_out::text, total_hours::text, on_site, shift_date::text`,
        [row.id, onSite, owner.slot],
      );
      return this.toResult('time_in', upd.rows[0], who, sessions);
    }

    if (!row.time_out) {
      const upd = await this.db.query<DtrRow>(
        `UPDATE dtr
         SET time_out = ${NOW_TIME},
             total_hours = ROUND(GREATEST(EXTRACT(EPOCH FROM (${NOW_TIME} - time_in)), 0) / 3600.0, 2),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, time_in::text, time_out::text, total_hours::text, on_site, shift_date::text`,
        [row.id],
      );
      return this.toResult('time_out', upd.rows[0], who, sessions);
    }

    // latest session is complete: start another one if the day allows it
    if (sessions < MAX_SESSIONS) {
      return this.insertSession(owner, onSite, sessions + 1, who);
    }
    return this.toResult('already_completed', row, who, sessions);
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
}

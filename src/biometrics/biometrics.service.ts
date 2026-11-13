import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DtrRow } from '../lib/data/biometrics.interface';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import {
  ClearAuthenticatorDto,
  EnrollBiometricDto,
} from './dto/enroll-biometric.dto';
import { UserRoles } from '../lib/data/types';
import { TransactionsDto } from './dto/biometrics-transactions.dto';

export interface EnrolledBiometricRecord {
  id: string;
  authenticator_tag: string | null;
  authenticator_fingerprint: string | null;
  biometrics_id: string | null;
  biometrics_fingerprint: string | null;
  nfc_id: string | null;
  rfid: string | null;
  created_at: string;
  updated_at: string;
  professor_id: string | null;
  staff_id: string | null;
  admin_id: string | null;
  user_type: UserRoles;
  employee_id: string;
  name: string;
  email: string;
  department: string;
  position: string;
  avatar_url: string | null;
}

export type PunchAction = 'time_in' | 'time_out' | 'duplicate';

export class BiometricsError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface Owner {
  biometricsRowId: string;
  professorId: string | null;
  staffId: string | null;
  adminId: string | null;
}

export interface PunchResult {
  action: PunchAction;
  recordId: string;
  shiftDate: string;
  timeIn: string | null;
  timeOut: string | null;
  totalHours: string;
  onSite: boolean;
  professorId: string | null;
  staffId: string | null;
  adminId: string | null;
}

export interface DtrUser {
  id: string;
  role: string;
}

const TZ = 'Asia/Manila';
const TODAY = `(NOW() AT TIME ZONE '${TZ}')::date`;
const NOW_TIME = `(NOW() AT TIME ZONE '${TZ}')::time(0)`;
const DEBOUNCE_SECONDS = 60; // ignore a second scan right after a punch
const TAG_RE = /^auth-\d{5,}$/; // matches the authenticators.tag default, e.g. auth-00001
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class BiometricsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly loggerService: LoggerService,
  ) {}

  private get db(): Pool {
    return this.databaseService.getClient();
  }

  private toError(error: unknown) {
    if (error instanceof BiometricsError) {
      const status =
        error.code === 'user_not_found' ||
        error.code === 'authenticator_not_found'
          ? 404
          : error.code === 'authenticator_in_use'
            ? 409
            : 400;
      return ErrorHandler(error.message, status, error.code);
    }
    if ((error as { code?: string })?.code === '23505') {
      return ErrorHandler(
        'This fingerprint is already enrolled on this authenticator',
        409,
      );
    }
    return error instanceof Error
      ? ErrorHandler(error.message, 500, error.name)
      : ErrorHandler('Server Error', 500, 'Unknown Error');
  }

  private async resolveUserColumn(
    userId: string,
    db: Pick<Pool, 'query'> = this.db,
  ): Promise<'professor_id' | 'staff_id'> {
    if (typeof userId !== 'string' || !UUID_RE.test(userId)) {
      throw new BiometricsError('invalid_request', "'user_id' must be a UUID");
    }
    const prof = await db.query(`SELECT 1 FROM user_professors WHERE id = $1`, [
      userId,
    ]);
    if (prof.rows.length) return 'professor_id';
    const staff = await db.query(`SELECT 1 FROM user_staffs WHERE id = $1`, [
      userId,
    ]);
    if (staff.rows.length) return 'staff_id';
    throw new BiometricsError(
      'user_not_found',
      'No professor or staff found for this user',
    );
  }

  // ───────────────────────── Enrollment ─────────────────────────

  /**
   * Upserts the authenticator (is_registered = true) and saves the sensor's fingerprintId on the
   * user's dtr_biometrics row as authenticator_fingerprint. The firmware only enrolls on an empty
   * sensor, so one authenticator belongs to one user.
   */
  async enrollAuthenticatorFingerprint(data: EnrollBiometricDto) {
    const tag = data.authenticator_tag?.trim();
    const slot = data.biometrics_fingerprint?.trim();
    const client = await this.db.connect();

    try {
      if (!tag || !TAG_RE.test(tag)) {
        throw new BiometricsError(
          'invalid_request',
          'Authenticator tag is invalid',
        );
      }
      if (!slot || !/^\d+$/.test(slot)) {
        throw new BiometricsError(
          'invalid_request',
          'Fingerprint id must be a non-negative integer',
        );
      }

      await client.query('BEGIN');
      const col = await this.resolveUserColumn(data.user_id, client);

      const inUse = await client.query(
        `SELECT 1 FROM dtr_biometrics
         WHERE authenticator_tag = $1 AND ${col} IS DISTINCT FROM $2::uuid
         LIMIT 1`,
        [tag, data.user_id],
      );
      if (inUse.rows.length) {
        throw new BiometricsError(
          'authenticator_in_use',
          'This authenticator is already registered to another user',
        );
      }

      await client.query(
        `INSERT INTO authenticators (tag, is_registered)
         VALUES ($1, TRUE)
         ON CONFLICT (tag) DO UPDATE SET is_registered = TRUE, updated_at = NOW()`,
        [tag],
      );

      const existing = await client.query<{ id: string }>(
        `SELECT id FROM dtr_biometrics WHERE ${col} = $1 LIMIT 1`,
        [data.user_id],
      );

      let enrolledId: string;
      if (existing.rows[0]) {
        const upd = await client.query<{ id: string }>(
          `UPDATE dtr_biometrics
           SET authenticator_tag = $1, authenticator_fingerprint = $2, updated_at = NOW()
           WHERE id = $3
           RETURNING id`,
          [tag, slot, existing.rows[0].id],
        );
        enrolledId = upd.rows[0].id;
      } else {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO dtr_biometrics (${col}, authenticator_tag, authenticator_fingerprint)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [data.user_id, tag, slot],
        );
        enrolledId = ins.rows[0].id;
      }

      await client.query('COMMIT');

      await this.db.query(
        `INSERT INTO hardware_events (device_name, event, status, details, occurred_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
          tag,
          'Fingerprint Enrolled',
          'Success',
          `Fingerprint ${slot} registered for ${col} ${data.user_id}.`,
        ],
      );

      void this.loggerService.logSystemEvent({
        actor_label: 'Authenticator',
        kind: 'security',
        event: 'Biometric Fingerprint Enrolled',
        detail: `Fingerprint ${slot} on ${tag} linked to dtr_biometrics ${enrolledId}`,
      });

      return SuccessHandler('Fingerprint successfully enrolled', 201, {
        id: enrolledId,
        authenticator_tag: tag,
        authenticator_fingerprint: slot,
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      return this.toError(error);
    } finally {
      client.release();
    }
  }

  /**
   * Admin: authenticators.is_registered -> false, and every dtr_biometrics row bound to
   * this tag loses its tag + fingerprint. DTR history is untouched.
   * The sensor itself is emptied separately by the app (device command `clear_templates`).
   */
  async clearAuthenticator(data: ClearAuthenticatorDto) {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const auth = await client.query(
        `UPDATE authenticators SET is_registered = FALSE, updated_at = NOW()
         WHERE tag = $1 RETURNING id`,
        [data.authenticator_tag],
      );
      if (!auth.rows[0]) {
        throw new BiometricsError(
          'authenticator_not_found',
          'Authenticator not found',
        );
      }

      const cleared = await client.query(
        `UPDATE dtr_biometrics
         SET authenticator_tag = NULL, authenticator_fingerprint = NULL, updated_at = NOW()
         WHERE authenticator_tag = $1`,
        [data.authenticator_tag],
      );

      await client.query('COMMIT');

      await this.db.query(
        `INSERT INTO hardware_events (device_name, event, status, details, occurred_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
          data.authenticator_tag,
          'Fingerprints Cleared',
          'Success',
          `${cleared.rowCount ?? 0} user enrollment(s) cleared.`,
        ],
      );

      return SuccessHandler('Authenticator fingerprints cleared', 200, {
        authenticator_tag: data.authenticator_tag,
        cleared: cleared.rowCount ?? 0,
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      return this.toError(error);
    } finally {
      client.release();
    }
  }

  // ───────────────────────── Attendance ─────────────────────────

  /**
   * Multiple dtr rows per day are allowed (one row per time_in/time_out pair, hours computed per row).
   * Based on the user's latest row:
   *   scan within DEBOUNCE_SECONDS of the last write -> duplicate
   *   open row (time_in, no time_out) from today -> time out
   *   otherwise -> time in (new row)
   * No night shifts: an open row from a previous day is a missed time out. It stays time_out NULL
   * (flagged by getDtrRecords) and never blocks or gets closed by a later scan.
   */
  async punch(userId: string, authenticatorTag: string): Promise<PunchResult> {
    if (typeof userId !== 'string' || !UUID_RE.test(userId)) {
      throw new BiometricsError('invalid_request', "'user_id' must be a UUID");
    }
    if (!authenticatorTag) {
      throw new BiometricsError(
        'invalid_request',
        "'authenticator_tag' is required",
      );
    }

    const ownerRes = await this.db.query<{
      id: string;
      professor_id: string | null;
      staff_id: string | null;
      admin_id: string | null;
    }>(
      `SELECT id, professor_id, staff_id, admin_id FROM dtr_biometrics
       WHERE authenticator_tag = $2
         AND authenticator_fingerprint IS NOT NULL
         AND (professor_id = $1 OR staff_id = $1)
       LIMIT 1`,
      [userId, authenticatorTag],
    );
    if (!ownerRes.rows[0]) {
      throw new BiometricsError(
        'unknown_credential',
        'User has no fingerprint enrolled on this authenticator',
      );
    }
    const owner: Owner = {
      biometricsRowId: ownerRes.rows[0].id,
      professorId: ownerRes.rows[0].professor_id,
      staffId: ownerRes.rows[0].staff_id,
      adminId: ownerRes.rows[0].admin_id,
    };

    const { rows } = await this.db.query<
      DtrRow & {
        admin_id: string | null;
        too_soon: boolean;
        is_today: boolean;
      }
    >(
      `SELECT id, admin_id, time_in::text, time_out::text, total_hours::text, on_site, shift_date::text,
              (updated_at > NOW() - INTERVAL '${DEBOUNCE_SECONDS} seconds') AS too_soon,
              (shift_date = ${TODAY}) AS is_today
       FROM dtr
       WHERE professor_id IS NOT DISTINCT FROM $1::uuid
         AND staff_id IS NOT DISTINCT FROM $2::uuid
       ORDER BY created_at DESC LIMIT 1`,
      [owner.professorId, owner.staffId],
    );
    const row = rows[0];

    if (row?.too_soon) return this.toResult('duplicate', row, owner);
    if (row?.time_in && !row.time_out && row.is_today) {
      return this.timeOut(row.id, owner);
    }
    return this.timeIn(owner, authenticatorTag);
  }

  private async timeIn(
    owner: Owner,
    authenticatorTag: string,
  ): Promise<PunchResult> {
    const ins = await this.db.query<DtrRow>(
      `INSERT INTO dtr (professor_id, staff_id, authenticator_tag, time_in, shift_date, on_site)
       VALUES ($1, $2, $3, ${NOW_TIME}, ${TODAY}, FALSE)
       RETURNING id, time_in::text, time_out::text, total_hours::text, on_site, shift_date::text`,
      [owner.professorId, owner.staffId, authenticatorTag],
    );
    return this.toResult('time_in', ins.rows[0], owner);
  }

  private async timeOut(recordId: string, owner: Owner): Promise<PunchResult> {
    const upd = await this.db.query<DtrRow>(
      `UPDATE dtr
       SET time_out = ${NOW_TIME},
           total_hours = ROUND(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0, 2),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, time_in::text, time_out::text, total_hours::text, on_site, shift_date::text`,
      [recordId],
    );
    return this.toResult('time_out', upd.rows[0], owner);
  }

  private toResult(action: PunchAction, r: DtrRow, owner: Owner): PunchResult {
    return {
      action,
      recordId: r.id,
      shiftDate: r.shift_date,
      timeIn: r.time_in,
      timeOut: r.time_out,
      totalHours: r.total_hours,
      onSite: r.on_site,
      professorId: owner.professorId,
      staffId: owner.staffId,
      adminId: owner.adminId,
    };
  }

  /** Admin: every record. Professor/staff: only their own. */
  async getDtrRecords(
    user: DtrUser,
    page: number,
    limit: number,
    missedOnly = false,
  ) {
    try {
      const isAdmin = user.role === 'administrator';
      const conds: string[] = [];
      const params: unknown[] = [];

      if (!isAdmin) {
        params.push(user.id);
        conds.push(`(d.professor_id = $1 OR d.staff_id = $1)`);
      }
      if (missedOnly) {
        conds.push(
          `(d.time_in IS NULL OR (d.time_out IS NULL AND d.shift_date < ${TODAY}))`,
        );
      }
      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

      const {
        rows: [{ total }],
      } = await this.db.query(
        `SELECT COUNT(*)::int AS total FROM dtr d ${where}`,
        params,
      );

      const limitIdx = params.length + 1;
      const offsetIdx = params.length + 2;
      const { rows } = await this.db.query(
        `SELECT d.id, d.professor_id, d.staff_id, d.admin_id, d.authenticator_tag,
              d.time_in::text, d.time_out::text, d.total_hours::text,
              d.shift_date::text, d.on_site, d.created_at, d.updated_at,
              COALESCE(p.employee_id, s.employee_id) AS employee_id,
              TRIM(CONCAT(COALESCE(p.firstname, s.firstname), ' ', COALESCE(p.lastname, s.lastname))) AS name,
              (d.time_in IS NULL) AS missed_time_in,
              (d.time_out IS NULL AND d.shift_date < ${TODAY}) AS missed_time_out,
              (SELECT COALESCE(SUM(x.total_hours), 0)::text
                 FROM dtr x
                WHERE x.shift_date = d.shift_date
                  AND x.professor_id IS NOT DISTINCT FROM d.professor_id
                  AND x.staff_id IS NOT DISTINCT FROM d.staff_id
                  AND x.time_in IS NOT NULL AND x.time_out IS NOT NULL) AS daily_hours
       FROM dtr d
       LEFT JOIN user_professors p ON d.professor_id = p.id
       LEFT JOIN user_staffs s ON d.staff_id = s.id
       ${where}
       ORDER BY d.shift_date DESC, d.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        [...params, limit, (page - 1) * limit],
      );

      return {
        ...SuccessHandler('Successfully fetched DTR records', 200, rows),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(total / limit)),
        },
      };
    } catch (error) {
      return this.toError(error);
    }
  }

  // ───────────────────────── Listing ─────────────────────────

  async getSlotSummary() {
    try {
      const result = await this.db.query<{
        biometrics_id: string | null;
        authenticator_fingerprint: string | null;
      }>(
        `SELECT biometrics_id, authenticator_fingerprint
         FROM dtr_biometrics`,
      );

      const occupiedSet = new Set<number>();
      for (const row of result.rows) {
        const val = row.biometrics_id ?? row.authenticator_fingerprint;
        if (!val) continue;
        const n = parseInt(String(val).trim(), 10);
        if (!isNaN(n) && n >= 0 && n < 128) {
          occupiedSet.add(n);
        }
      }

      const occupiedSlots = Array.from(occupiedSet).sort((a, b) => a - b);
      let nextAvailableSlot = 0;
      for (let i = 0; i < 128; i++) {
        if (!occupiedSet.has(i)) {
          nextAvailableSlot = i;
          break;
        }
      }

      return SuccessHandler('Successfully fetched slot summary', 200, {
        totalCapacity: 128,
        occupiedCount: occupiedSlots.length,
        availableCount: Math.max(0, 128 - occupiedSlots.length),
        occupiedSlots,
        nextAvailableSlot,
      });
    } catch (error) {
      return this.toError(error);
    }
  }

  async getEnrolledBiometrics() {
    try {
      const result = await this.db.query(`
        SELECT
          b.id,
          b.authenticator_tag,
          b.authenticator_fingerprint,
          b.biometrics_id,
          b.biometrics_fingerprint,
          b.nfc_id,
          b.rfid,
          b.created_at,
          b.updated_at,
          b.professor_id,
          b.staff_id,
          b.admin_id,
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

        return {
          id: row.id,
          authenticator_tag: row.authenticator_tag,
          authenticator_fingerprint: row.authenticator_fingerprint,
          biometrics_id: row.biometrics_id,
          biometrics_fingerprint: row.biometrics_fingerprint,
          nfc_id: row.nfc_id,
          rfid: row.rfid,
          created_at: row.created_at,
          updated_at: row.updated_at,
          professor_id: row.professor_id,
          staff_id: row.staff_id,
          admin_id: row.admin_id,
          user_type: isProf ? 'professor' : 'staff',
          employee_id: isProf
            ? row.prof_employee_id || ''
            : isStaff
              ? row.staff_employee_id || ''
              : '',
          name: isProf
            ? `${row.prof_firstname || ''} ${row.prof_lastname || ''}`.trim()
            : isStaff
              ? `${row.staff_firstname || ''} ${row.staff_lastname || ''}`.trim()
              : 'Unassigned Personnel',
          email: isProf
            ? row.prof_email || ''
            : isStaff
              ? row.staff_email || ''
              : '',
          department: isProf
            ? row.prof_department || 'Academic'
            : isStaff
              ? row.staff_department || 'Operations'
              : 'General',
          position: isProf
            ? row.prof_position || 'Faculty'
            : isStaff
              ? row.staff_position || 'Staff'
              : '',
          avatar_url: isProf ? row.prof_avatar_url : row.staff_avatar_url,
        };
      });

      return SuccessHandler('Successfully fetched biometrics', 200, formatted);
    } catch (error) {
      return this.toError(error);
    }
  }

  async deleteBiometric(id: string) {
    try {
      const existing = await this.db.query(
        `SELECT id, admin_id, authenticator_tag, authenticator_fingerprint FROM dtr_biometrics WHERE id = $1`,
        [id],
      );
      if (existing.rows.length === 0) {
        return ErrorHandler('Biometric record not found', 404);
      }
      const { authenticator_tag, authenticator_fingerprint } = existing.rows[0];

      await this.db.query(`DELETE FROM dtr_biometrics WHERE id = $1`, [id]);

      await this.db.query(
        `INSERT INTO hardware_events (device_name, event, status, details, occurred_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
          authenticator_tag ?? 'unknown',
          'Fingerprint Removed',
          'Success',
          `Fingerprint ${authenticator_fingerprint} removed from database.`,
        ],
      );

      return SuccessHandler('Biometric record deleted successfully', 200, {
        id,
      });
    } catch (error) {
      return this.toError(error);
    }
  }

  // ZKTeco Transactions
  async getBiometricsTransactions(
    page = 1,
    limit = 50,
    empCode?: string,
    startDate?: string,
    endDate?: string,
  ) {
    try {
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const values: any[] = [];

      if (empCode) {
        values.push(empCode);
        conditions.push(`emp_code = $${values.length}`);
      }

      if (startDate) {
        values.push(startDate);
        conditions.push(`punch_time >= $${values.length}`);
      }

      if (endDate) {
        values.push(endDate);
        conditions.push(`punch_time <= $${values.length}`);
      }

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      const countResult = await this.db.query(
        `
      SELECT COUNT(*)::INTEGER AS total
      FROM attendance_transactions
      ${whereClause}
      `,
        values,
      );

      values.push(limit);
      values.push(offset);

      const result = await this.db.query(
        `
      SELECT *
      FROM attendance_transactions
      ${whereClause}
      ORDER BY punch_time DESC
      LIMIT $${values.length - 1}
      OFFSET $${values.length}
      `,
        values,
      );

      const total = countResult.rows[0].total;

      return {
        success: true,
        message: 'Biometric transactions retrieved successfully.',
        data: result.rows,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      return this.toError(error);
    }
  }
  async recordTransactions(transactionDto: TransactionsDto) {
    try {
      const result = await this.db.query(
        `
      INSERT INTO attendance_transactions (
        id,
        emp,
        emp_code,
        first_name,
        last_name,
        department,
        position,
        punch_time,
        punch_state,
        punch_state_display,
        verify_type,
        verify_type_display,
        work_code,
        gps_location,
        area_alias,
        terminal_sn,
        temperature,
        is_mask,
        terminal_alias,
        upload_time,
        longitude,
        latitude
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING *
      `,
        [
          transactionDto.id,
          transactionDto.emp,
          transactionDto.emp_code,
          transactionDto.first_name,
          transactionDto.last_name,
          transactionDto.department,
          transactionDto.position,
          transactionDto.punch_time,
          transactionDto.punch_state,
          transactionDto.punch_state_display,
          transactionDto.verify_type,
          transactionDto.verify_type_display,
          transactionDto.work_code,
          transactionDto.gps_location,
          transactionDto.area_alias,
          transactionDto.terminal_sn,
          transactionDto.temperature,
          transactionDto.is_mask,
          transactionDto.terminal_alias,
          transactionDto.upload_time,
          transactionDto.longitude,
          transactionDto.latitude,
        ],
      );

      return {
        success: true,
        message: result.rowCount
          ? 'Transaction recorded successfully.'
          : 'Transaction already exists.',
        data: result.rows[0] ?? null,
      };
    } catch (error) {
      return this.toError(error);
    }
  }
}

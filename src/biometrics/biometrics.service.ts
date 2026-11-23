import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import {
  ClearAuthenticatorDto,
  EnrollBiometricDto,
} from './dto/enroll-biometric.dto';
import { AssignBiometricsDto } from './dto/assign-biometrics.dto';
import { UserRoles } from '../lib/data/types';
import { TransactionsDto } from './dto/biometrics-transactions.dto';
import { UserSession } from '../lib/data/interfaces';

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

const TAG_RE = /^(auth-\d{5,}|[A-Za-z0-9_-]{3,32})$/;
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
        error.code === 'authenticator_not_found' ||
        error.code === 'biometrics_not_found'
          ? 404
          : error.code === 'authenticator_in_use' ||
              error.code === 'biometrics_already_assigned' ||
              error.code === 'user_already_linked'
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
           SET authenticator_tag = $1, authenticator_fingerprint = $2, biometrics_id = $2, updated_at = NOW()
           WHERE id = $3
           RETURNING id`,
          [tag, slot, existing.rows[0].id],
        );
        enrolledId = upd.rows[0].id;
      } else {
        const ins = await client.query<{ id: string }>(
          `INSERT INTO dtr_biometrics (${col}, authenticator_tag, authenticator_fingerprint, biometrics_id)
           VALUES ($1, $2, $3, $2)
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
  async getBiometricsTransactionPerUser(user: UserSession) {
    try {
      const biometrics_exists = await this.db.query(
        `SELECT * FROM user_biometrics_id
        WHERE professor_id = $1 OR staff_id = $2
        LIMIT 1`,
        [user.id, user.id],
      );

      if (!biometrics_exists)
        return ErrorHandler('User not found', 404, {
          message:
            'If you are registered to any biometrics, please notify admin support',
        });
    } catch (error) {
      return this.toError(error);
    }
  }

  /**
   * Biometrics ids (from ZKTeco transactions) that are not linked to a professor/staff yet.
   * Name/department/position come from the latest transaction of that id.
   */
  async getUnassignedBiometrics() {
    try {
      const result = await this.db.query(
        `SELECT ub.biometrics_emp_id,
                t.emp_code,
                t.first_name,
                t.last_name,
                t.department,
                t.position,
                t.punch_time AS last_punch_time
         FROM user_id_biometrics ub
         LEFT JOIN LATERAL (
           SELECT emp_code, first_name, last_name, department, position, punch_time
           FROM attendance_transactions
           WHERE emp = ub.biometrics_emp_id
           ORDER BY punch_time DESC
           LIMIT 1
         ) t ON TRUE
         WHERE ub.biometrics_emp_id IS NOT NULL
           AND ub.professor_id IS NULL
           AND ub.staff_id IS NULL
         ORDER BY t.last_name, t.first_name`,
      );

      return SuccessHandler(
        'Successfully fetched unassigned biometrics',
        200,
        result.rows,
      );
    } catch (error) {
      return this.toError(error);
    }
  }

  /**
   * Admin: links an existing, unassigned biometrics_emp_id to a professor or staff.
   * A user can only be linked to one biometrics id, and an id can only be linked once.
   */
  async assignBiometricsToUser(data: AssignBiometricsDto) {
    const empId = String(data.biometrics_emp_id ?? '').trim();
    const client = await this.db.connect();

    try {
      // user_id_biometrics.biometrics_emp_id is INT
      if (!/^\d+$/.test(empId)) {
        throw new BiometricsError(
          'invalid_request',
          "'biometrics_emp_id' must be a non-negative integer",
        );
      }

      await client.query('BEGIN');
      const col = await this.resolveUserColumn(data.user_id, client);

      const target = await client.query<{
        professor_id: string | null;
        staff_id: string | null;
      }>(
        `SELECT professor_id, staff_id FROM user_id_biometrics
         WHERE biometrics_emp_id = $1
         FOR UPDATE`,
        [empId],
      );
      if (!target.rows[0]) {
        throw new BiometricsError(
          'biometrics_not_found',
          'Biometrics ID not found',
        );
      }
      if (target.rows[0].professor_id || target.rows[0].staff_id) {
        throw new BiometricsError(
          'biometrics_already_assigned',
          'This biometrics ID is already assigned to a user',
        );
      }

      const linked = await client.query(
        `SELECT 1 FROM user_id_biometrics WHERE ${col} = $1 LIMIT 1`,
        [data.user_id],
      );
      if (linked.rows.length) {
        throw new BiometricsError(
          'user_already_linked',
          'This user is already linked to a biometrics ID',
        );
      }

      await client.query(
        `UPDATE user_id_biometrics SET ${col} = $2 WHERE biometrics_emp_id = $1`,
        [empId, data.user_id],
      );

      await client.query('COMMIT');

      void this.loggerService.logSystemEvent({
        actor_label: 'Admin',
        kind: 'security',
        event: 'Biometrics ID Assigned',
        detail: `Biometrics ID ${empId} assigned to ${col} ${data.user_id}`,
      });

      return SuccessHandler('Biometrics ID assigned successfully', 200, {
        biometrics_emp_id: empId,
        [col]: data.user_id,
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      return this.toError(error);
    } finally {
      client.release();
    }
  }

  /**
   * Admin: all transactions. Professor/staff: only transactions of the biometrics id assigned to them.
   * Each row carries the assigned user's data (null while the id is unassigned).
   */
  async getBiometricsTransactions(
    user: UserSession,
    page = 1,
    limit = 50,
    empCode?: string,
    startDate?: string,
    endDate?: string,
  ) {
    try {
      const isAdmin = user.role === 'admin';
      const offset = (page - 1) * limit;

      const conditions: string[] = [];
      const values: any[] = [];

      // Restrict non-admin users to their own assigned biometrics ID.
      if (!isAdmin) {
        const userEmpResult = await this.db.query(
          `
        SELECT biometrics_emp_id
        FROM user_id_biometrics
        WHERE professor_id = $1 OR staff_id = $1
        LIMIT 1
        `,
          [user.id],
        );

        const userEmpId = userEmpResult.rows[0]?.biometrics_emp_id;

        // Do not expose transactions if no biometric ID is linked.
        if (!userEmpId) {
          return {
            success: true,
            message: 'No biometric employee ID is linked to this account.',
            data: [],
            pagination: {
              total: 0,
              page,
              limit,
              totalPages: 0,
            },
          };
        }

        values.push(userEmpId);
        conditions.push(`t.emp = $${values.length}`);
      }

      // Optional filters
      if (empCode) {
        values.push(empCode);
        conditions.push(
          `t.emp_code = $${values.length} OR t.emp = $${values.length}`,
        );
      }

      if (startDate) {
        values.push(startDate);
        conditions.push(`t.punch_time >= $${values.length}`);
      }

      if (endDate) {
        values.push(endDate);
        conditions.push(`t.punch_time <= $${values.length}`);
      }

      const whereClause = conditions.length
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      // Count matching transactions
      const countResult = await this.db.query(
        `
      SELECT COUNT(*)::INTEGER AS total
      FROM attendance_transactions t
      ${whereClause}
      `,
        values,
      );

      const total = countResult.rows[0].total;

      // Pagination
      const queryValues = [...values, limit, offset];

      const result = await this.db.query(
        `
      SELECT t.*,
             (ub.professor_id IS NOT NULL OR ub.staff_id IS NOT NULL) AS is_assigned,
             COALESCE(ub.professor_id, ub.staff_id) AS user_id,
             CASE WHEN ub.professor_id IS NOT NULL THEN 'professor'
                  WHEN ub.staff_id IS NOT NULL THEN 'staff' END AS user_type,
             COALESCE(p.employee_id, s.employee_id) AS user_employee_id,
             TRIM(CONCAT(COALESCE(p.firstname, s.firstname), ' ', COALESCE(p.lastname, s.lastname))) AS user_name,
             COALESCE(p.email, s.email) AS user_email,
             COALESCE(p.department, s.department) AS user_department,
             COALESCE(p.position, s.position) AS user_position,
             COALESCE(p.avatar_url, s.avatar_url) AS user_avatar_url
      FROM attendance_transactions t
      LEFT JOIN user_id_biometrics ub ON ub.biometrics_emp_id = t.emp
      LEFT JOIN user_professors p ON ub.professor_id = p.id
      LEFT JOIN user_staffs s ON ub.staff_id = s.id
      ${whereClause}
      ORDER BY t.punch_time DESC
      LIMIT $${queryValues.length - 1}
      OFFSET $${queryValues.length}
      `,
        queryValues,
      );

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
      // Unknown biometrics ID: register it with no professor_id/staff_id.
      // The admin links it to a user later through assignBiometricsToUser.
      await this.db.query(
        `INSERT INTO user_id_biometrics (
          biometrics_emp_id
        )
        VALUES ($1)
        ON CONFLICT (biometrics_emp_id)
        DO NOTHING`,
        [transactionDto.emp],
      );

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

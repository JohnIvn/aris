import { Injectable } from '@nestjs/common';
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

@Injectable()
export class BiometricsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly loggerService: LoggerService,
  ) {}

  private get db() {
    return this.databaseService.getClient();
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
        return ErrorHandler('Either professor_id or staff_id must be provided', 400);
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

      return SuccessHandler('Fingerprint successfully enrolled to database', 201, {
        id: enrolledId,
        biometrics_id: data.biometrics_id,
      });
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

      return SuccessHandler('Biometric record deleted successfully', 200, { id });
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500, error.name)
        : ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
}

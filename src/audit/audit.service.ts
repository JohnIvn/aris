import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { ListAuditDto } from './dto/audit.dto';

interface AuditRow {
  id: string;
  actor: string;
  initials: string;
  record_type: string | null;
  action: string;
  target: string;
  occurred_at: Date;
  result: string;
  period: string;
  reference: string;
  faculty_name: string;
  faculty_number: string;
  department: string;
  reviewer: string;
  remark: string;
}

const resultMap: Record<string, string> = {
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
  disapproved: 'Disapproved',
  flagged: 'Flagged',
  pending: 'Pending',
  missing: 'Missing',
};

@Injectable()
export class AuditService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.getClient();
  }

  async list(filters: ListAuditDto) {
    try {
      const values: string[] = [];
      const conditions: string[] = [];

      if (filters.result && filters.result !== 'All') {
        values.push(filters.result.toLowerCase());
        conditions.push(`to_status::text = $${values.length}`);
      }

      if (filters.search?.trim()) {
        values.push(`%${filters.search.trim()}%`);
        conditions.push(
          `(COALESCE(u.firstname || ' ' || u.lastname, '') ILIKE $${values.length}
            OR COALESCE(s.reference, r.employee_id, '') ILIKE $${values.length}
            OR COALESCE(h.note, '') ILIKE $${values.length})`,
        );
      }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const result = await this.db.query<AuditRow>(
        `SELECT
           h.id,
           COALESCE(u.firstname || ' ' || u.lastname, h.changed_by_label, 'System') AS actor,
           UPPER(LEFT(COALESCE(u.firstname, h.changed_by_label, 'SY'), 1) ||
                 LEFT(COALESCE(u.lastname, ''), 1)) AS initials,
           s.record_type,
           CASE
             WHEN h.to_status = 'submitted' THEN 'Submission submitted'
             ELSE INITCAP(h.to_status::text)
           END AS action,
           COALESCE(h.note, s.reference, 'Submission status changed') AS target,
           h.changed_at AS occurred_at,
           h.to_status::text AS result,
           TO_CHAR(r.period_start, 'Mon DD, YYYY') || ' - ' ||
             TO_CHAR(r.period_end, 'Mon DD, YYYY') AS period,
           COALESCE(s.reference, r.employee_id) AS reference,
           COALESCE(u.firstname || ' ' || u.lastname, 'Unknown user') AS faculty_name,
           r.faculty_no AS faculty_number,
           COALESCE(u.department, 'Unknown department') AS department,
           COALESCE(h.changed_by_label, 'System') AS reviewer,
           COALESCE(h.note, '') AS remark
         FROM submission_status_history h
         JOIN submissions s ON s.id = h.submission_id
         JOIN accomplishment_reports r ON r.id = s.report_id
         LEFT JOIN LATERAL (
           SELECT firstname, lastname, department
           FROM user_professors
           WHERE id = s.user_id
           UNION ALL
           SELECT firstname, lastname, department
           FROM user_staffs
           WHERE id = s.user_id
         ) u ON TRUE
         ${where}
         ORDER BY h.changed_at DESC
         LIMIT 200`,
        values,
      );

      return SuccessHandler(
        'Successfully fetched audit logs',
        200,
        result.rows.map((row) => this.toResponse(row)),
      );
    } catch (error) {
      return ErrorHandler(
        error instanceof Error ? error.message : 'Failed to fetch audit logs',
        500,
      );
    }
  }

  private toResponse(row: AuditRow) {
    const result = resultMap[row.result] ?? 'Pending';
    return {
      id: row.id,
      actor: row.actor,
      init: row.initials || 'SY',
      type: row.record_type === 'dtr' ? 'DTR' : 'AR',
      action: row.action,
      target: row.target,
      time: row.occurred_at,
      result,
      record: {
        period: row.period,
        reference: row.reference,
        facultyName: row.faculty_name,
        facultyNumber: row.faculty_number,
        college: row.department,
        tables: [],
        reviewer: row.reviewer,
        reviewedAt: row.occurred_at,
        remark: row.remark,
      },
    };
  }
}

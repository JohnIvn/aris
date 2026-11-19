import { ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import type { UserSession } from '../lib/data/interfaces';
import { AuditService } from '../audit/audit.service';

export interface HistoryRecord {
  id: string;
  type: 'AR' | 'DTR';
  period: string;
  units: string;
  submitted: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Disapproved';
  stage?: string;
  currentStage?: string;
  event: string;
  record: any;
}

export interface LatestSubmission {
  type: 'AR' | 'DTR';
  period: string;
  units: string;
  reference: string;
  filed: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Disapproved';
  currentStage: string;
  currentSince: string;
}

function formatDisplayDate(d: Date | string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getHalfMonthRange(periodText: string): {
  periodStart: string;
  periodEnd: string;
} | null {
  const match = periodText.match(
    /^([A-Za-z]+)\s+(\d{4})\s+(I|II)$/i,
  );
  if (!match) return null;

  const months = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const monthIndex = months.indexOf(match[1].toLowerCase());
  if (monthIndex < 0) return null;

  const year = Number(match[2]);
  const half = match[3].toUpperCase();
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const month = String(monthIndex + 1).padStart(2, '0');
  return {
    periodStart: `${year}-${month}-${half === 'I' ? '01' : '16'}`,
    periodEnd: `${year}-${month}-${half === 'I' ? '15' : String(lastDay).padStart(2, '0')}`,
  };
}

function parseCampus(
  c: string | undefined,
): 'south' | 'congress' | 'camarin' | 'bagong silang' {
  const lower = (c || '').toLowerCase();
  if (lower.includes('south')) return 'south';
  if (lower.includes('camarin')) return 'camarin';
  if (lower.includes('bagong') || lower.includes('silang'))
    return 'bagong silang';
  return 'congress';
}

function parseSection(sectionValue: string): {
  program: string;
  year: number;
  section: string;
} {
  const section = sectionValue.trim();
  const match = section.match(/^(.+?)(?:\s+)(\d+)(?:[-\s]?)([A-Za-z].*)$/);
  if (match) {
    return {
      program: match[1].trim(),
      year: Number(match[2]),
      section: section,
    };
  }
  return {
    program: 'BSIT',
    year: 2,
    section: section || 'N/A',
  };
}

function parseSqlTime(t: string | undefined, defaultVal: string): string {
  if (!t) return defaultVal;
  try {
    const clean = t.trim().toUpperCase();
    const isPM = clean.includes('PM');
    const isAM = clean.includes('AM');
    const numPart = clean.replace(/[APM\s]/g, '');
    const [hStr, mStr] = numPart.split(':');
    let h = parseInt(hStr, 10);
    const m = parseInt(mStr || '0', 10);
    if (isNaN(h)) return defaultVal;
    if (isPM && h < 12) h += 12;
    if (isAM && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
  } catch {
    return defaultVal;
  }
}

@Injectable()
export class ProfessorSubmissionsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly loggerService: LoggerService,
    private readonly auditService: AuditService,
  ) {}

  private get client() {
    return this.databaseService.getClient();
  }

  private async resolveProfessor(
    user?: UserSession,
    emailQuery?: string,
    nameQuery?: string,
    empIdQuery?: string,
  ) {
    const targetEmail = user?.email || emailQuery || null;
    const targetId = user?.id || null;

    if (targetId) {
      const res = await this.client.query(
        'SELECT * FROM user_professors WHERE id = $1 LIMIT 1',
        [targetId],
      );
      if (res.rows.length > 0) return res.rows[0];
    }

    if (targetEmail) {
      const res = await this.client.query(
        'SELECT * FROM user_professors WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [targetEmail],
      );
      if (res.rows.length > 0) return res.rows[0];
    }

    if (empIdQuery) {
      const res = await this.client.query(
        'SELECT * FROM user_professors WHERE employee_id = $1 OR employee_id = $2 LIMIT 1',
        [empIdQuery, `PROF-${empIdQuery}`],
      );
      if (res.rows.length > 0) return res.rows[0];
    }

    if (nameQuery && nameQuery.trim()) {
      const cleanName = nameQuery
        .replace(/^(Dr\.|Prof\.|Mr\.|Ms\.|Mrs\.)\s*/i, '')
        .trim();
      const res = await this.client.query(
        "SELECT * FROM user_professors WHERE LOWER(firstname || ' ' || lastname) LIKE LOWER($1) OR LOWER(lastname) LIKE LOWER($2) LIMIT 1",
        [`%${cleanName}%`, `%${cleanName}%`],
      );
      if (res.rows.length > 0) return res.rows[0];
    }

    // Default to first professor in database if no user specified
    const fallback = await this.client.query(
      'SELECT * FROM user_professors ORDER BY created_at ASC LIMIT 1',
    );
    return fallback.rows[0] || null;
  }

  async createAccomplishmentReport(user: UserSession | undefined, data: any) {
    try {
      const type: 'AR' | 'DTR' =
        data.type === 'DTR' || data.recordType?.includes('DTR') ? 'DTR' : 'AR';
      const periodText = String(data.period || data.record?.period || '');
      const recordPayload = data.record || data;
      const rawReference: string =
        data.reference ||
        recordPayload.reference ||
        (data.id && typeof data.id === 'string' && !data.id.includes('-')
          ? data.id
          : '') ||
        '';
      const reference: string = rawReference || `${type}-${Date.now()}`;
      const period: string = data.period || 'Current Cycle';
      const units: string =
        data.units || (type === 'AR' ? '3 courses' : '22 days');
      const event: string = data.event || `${type} submitted · ${period}`;
      const userEmail =
        user?.email ||
        data.email ||
        data.facultyEmail ||
        recordPayload.email ||
        recordPayload.facultyEmail ||
        null;
      const userName =
        (user as any)?.name ||
        data.facultyName ||
        data.name ||
        recordPayload.facultyName ||
        null;
      const userEmpId =
        data.facultyNumber ||
        data.employee_id ||
        recordPayload.facultyNumber ||
        recordPayload.employee_id ||
        null;
      const topics = recordPayload.topics || null;
      const notes = recordPayload.notes || null;

      const prof = await this.resolveProfessor(
        user,
        userEmail,
        userName,
        userEmpId,
      );
      const profId = prof?.id || '00000000-0000-0000-0000-000000000001';
      const employeeId = prof?.employee_id || userEmpId || 'P00001';
      const facultyNo =
        recordPayload.facultyNumber || prof?.employee_id || employeeId;

      let reportId: string | null = null;

      // 1. Primary insert or update directly into accomplishment_reports & report_entries
      if (type === 'AR') {
        const arRange = getHalfMonthRange(periodText);
        if (!arRange) {
          return ErrorHandler(
            'AR period must use Month YYYY I or Month YYYY II',
            400,
          );
        }

        let existingReportId: string | null =
          (data.report_id &&
          typeof data.report_id === 'string' &&
          data.report_id.includes('-') &&
          data.report_id.length === 36
            ? data.report_id
            : null) ||
          (data.id &&
          typeof data.id === 'string' &&
          data.id.includes('-') &&
          data.id.length === 36
            ? data.id
            : null) ||
          (recordPayload.id &&
          typeof recordPayload.id === 'string' &&
          recordPayload.id.includes('-') &&
          recordPayload.id.length === 36
            ? recordPayload.id
            : null) ||
          (recordPayload.report_id &&
          typeof recordPayload.report_id === 'string' &&
          recordPayload.report_id.includes('-') &&
          recordPayload.report_id.length === 36
            ? recordPayload.report_id
            : null);

        if (!existingReportId && reference) {
          const subCheck = await this.client.query(
            `SELECT id FROM accomplishment_reports
              WHERE submission_reference = $1
              LIMIT 1`,
            [reference],
          );
          if (subCheck.rows.length > 0 && subCheck.rows[0].id) {
            existingReportId = subCheck.rows[0].id;
          }
        }

        if (!existingReportId && reference && reference.startsWith('AR-')) {
          const parts = reference.split('-');
          const shortId = parts[parts.length - 1];
          if (shortId && shortId.length >= 6) {
            const arCheck = await this.client.query(
              `SELECT id FROM accomplishment_reports WHERE id::text ILIKE $1 || '%' LIMIT 1`,
              [shortId],
            );
            if (arCheck.rows.length > 0) {
              existingReportId = arCheck.rows[0].id;
            }
          }
        }

        if (
          !existingReportId &&
          (data.is_revision || data.isRevision)
        ) {
          const revCheck = await this.client.query(
            `SELECT id FROM accomplishment_reports 
              WHERE (user_id = $1 OR employee_id = $2 OR faculty_no = $3)
                AND (
                  submission_status IN ('disapproved', 'rejected')
                  OR remarks ILIKE '%disapprov%'
                  OR remarks ILIKE '%reject%'
                  OR remarks ILIKE '%correction%'
                )
              ORDER BY updated_at DESC LIMIT 1`,
            [profId, employeeId, facultyNo],
          );
          if (revCheck.rows.length > 0) {
            existingReportId = revCheck.rows[0].id;
          }
        }

        const revisionReportId = [
          data.report_id,
          data.id,
          recordPayload.id,
          recordPayload.report_id,
        ].find(
          (value): value is string =>
            typeof value === 'string' &&
            value.includes('-') &&
            value.length === 36,
        );
        const isRevision = data.is_revision === true || data.isRevision === true;
        const activePeriodReport = await this.client.query(
          `SELECT id
             FROM accomplishment_reports
            WHERE user_id = $1
              AND period_start = $2::date
              AND period_end = $3::date
              AND LOWER(submission_status) NOT IN ('rejected', 'disapproved', 'returned')
            ORDER BY updated_at DESC
            LIMIT 1`,
          [profId, arRange.periodStart, arRange.periodEnd],
        );
        const duplicateReportId = activePeriodReport.rows[0]?.id;
        if (
          duplicateReportId &&
          !(isRevision && revisionReportId === duplicateReportId)
        ) {
          throw new ConflictException(
            'An AR for this period was already submitted.',
          );
        }

        let repRes;
        if (existingReportId) {
          const resubmitRemark =
            notes && !/disapprov|reject|return/i.test(notes)
              ? notes
              : 'Resubmitted with corrections. Pending review.';

          repRes = await this.client.query(
            `
            UPDATE accomplishment_reports
               SET approval_stage = 'AR-AP-STG-1',
                   submission_status = 'pending',
                   submission_reference = $2,
                   submission_event = $3,
                   submission_units = $4,
                   submission_topics = $5,
                   submission_notes = $6,
                   submission_payload = $7::jsonb,
                   period_start = $9::date,
                   period_end = $10::date,
                   submitted_at = NOW(),
                   reviewed_by = NULL,
                   reviewed_at = NULL,
                   current_stage = 'Checker',
                   current_since = NOW(),
                   remarks = $1,
                   payroll_availability = FALSE,
                   payroll_received = FALSE,
                   payroll_received_date = NULL,
                   updated_at = NOW()
             WHERE id = $8
             RETURNING id;
            `,
            [
              resubmitRemark,
              reference,
              event,
              units,
              topics,
              notes,
              JSON.stringify(recordPayload),
              existingReportId,
              arRange.periodStart,
              arRange.periodEnd,
            ],
          );
          if (repRes.rows.length > 0) {
            reportId = repRes.rows[0].id;
            await this.client.query(
              `DELETE FROM report_entries WHERE report_id = $1`,
              [reportId],
            );
          }
        }

        if (!reportId) {
          repRes = await this.client.query(
            `
            INSERT INTO accomplishment_reports (
              user_id, employee_id, faculty_no, period_start, period_end, approval_stage, remarks, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $5::date, $6::date, 'AR-AP-STG-1', $4, NOW(), NOW()
            )
            RETURNING id;
            `,
            [
              profId,
              employeeId,
              facultyNo,
              notes || 'Submitted from ARIS Desktop',
              arRange.periodStart,
              arRange.periodEnd,
            ],
          );
          reportId = repRes.rows[0]?.id || null;
          if (reportId) {
            await this.client.query(
              `UPDATE accomplishment_reports
                  SET submission_status = 'pending',
                      submission_reference = $1,
                      submission_event = $2,
                      submission_units = $3,
                      submission_topics = $4,
                      submission_notes = $5,
                      submission_payload = $6::jsonb,
                      submitted_at = NOW(),
                      current_stage = 'Checker',
                      current_since = NOW()
                WHERE id = $7`,
              [
                reference,
                event,
                units,
                topics,
                notes,
                JSON.stringify(recordPayload),
                reportId,
              ],
            );
          }
        }

        if (reportId && Array.isArray(recordPayload.tables)) {
          for (const tbl of recordPayload.tables) {
            const courseTitle = tbl.title || 'General Course';
            const courseTopics =
              tbl.topics || recordPayload.topics || 'Course syllabus alignment';
            const courseTasks =
              tbl.tasks ||
              recordPayload.tasks ||
              'Lecture and Discussion, Activity';
            if (Array.isArray(tbl.rows)) {
              for (const row of tbl.rows) {
                const code = String(row[0] || 'CC 105');
                const section = String(row[1] || 'BSIT 2A');
                const sectionInfo = parseSection(section);
                const unitVal = parseInt(row[2], 10) || 3;
                const day = String(row[3] || 'Monday');
                const timeStr = String(row[4] || '08:00AM–11:00AM');
                const campusVal = parseCampus(String(row[5] || 'congress'));

                const [startRaw, endRaw] = timeStr.includes('–')
                  ? timeStr.split('–')
                  : timeStr.includes('-')
                    ? timeStr.split('-')
                    : [timeStr, '11:00AM'];

                const shiftStart = parseSqlTime(startRaw, '08:00:00');
                const shiftEnd = parseSqlTime(endRaw, '11:00:00');

                await this.client.query(
                  `
                  INSERT INTO report_entries (
                    report_id, course, code, program, year, section, units, day,
                    shift_hours, shift_start, shift_end, campus, class_date, topics, description
                  ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, 3.0, $9, $10,
                    $11, CURRENT_DATE, $12, $13
                  )
                  `,
                  [
                    reportId,
                    courseTitle,
                    code,
                    sectionInfo.program,
                    sectionInfo.year,
                    sectionInfo.section,
                    unitVal,
                    day,
                    shiftStart,
                    shiftEnd,
                    campusVal,
                    courseTopics,
                    courseTasks,
                  ],
                );
              }
            }
          }
        }
      }

      return SuccessHandler(
        'Accomplishment report submitted successfully',
        201,
        {
          id: reportId || reference,
          reference,
          type,
          period,
          units,
          status: 'Pending',
          stage: 'Checker',
          stage_role: 'Checker',
          stage_key: 'AR-AP-STG-1',
          approval_stage: 'AR-AP-STG-1',
          stage_order: 1,
          currentStage: 'Checker',
          submitted: formatDisplayDate(new Date()),
          event,
          record: recordPayload,
        },
      );
    } catch (error) {
      console.error(
        '[ProfessorSubmissionsService] Error recording accomplishment report:',
        error,
      );
      if (error instanceof ConflictException) {
        throw error;
      }
      if (
        (error as any)?.code === '23505' &&
        (error as any)?.constraint ===
          'idx_accomplishment_reports_active_half_period'
      ) {
        throw new ConflictException(
          'An AR for this period was already submitted.',
        );
      }
      return ErrorHandler(
        error instanceof Error
          ? error.message
          : 'Failed to record accomplishment report',
        500,
      );
    }
  }

  async createSubmission(user: UserSession | undefined, data: any) {
    return this.createAccomplishmentReport(user, data);
  }

  async createDtrSubmission(user: UserSession | undefined, data: any) {
    if (!user?.id) {
      return ErrorHandler('Authenticated professor is required', 401);
    }

    const periodStart = String(data.periodStart || '');
    const periodEnd = String(data.periodEnd || '');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)
    ) {
      return ErrorHandler('DTR period must use YYYY-MM-DD dates', 400);
    }

    const start = new Date(`${periodStart}T00:00:00Z`);
    const end = new Date(`${periodEnd}T00:00:00Z`);
    if (
      isNaN(start.getTime()) ||
      isNaN(end.getTime()) ||
      start.getUTCMonth() !== end.getUTCMonth() ||
      start.getUTCFullYear() !== end.getUTCFullYear() ||
      !(
        (start.getUTCDate() === 1 && end.getUTCDate() === 15) ||
        (
          start.getUTCDate() === 16 &&
          end.getUTCDate() === new Date(
            Date.UTC(
              end.getUTCFullYear(),
              end.getUTCMonth() + 1,
              0,
            ),
          ).getUTCDate()
        )
      )
    ) {
      return ErrorHandler(
        'DTR submissions must use the first or second half of the month',
        400,
      );
    }

    const professor = await this.client.query(
      'SELECT id, firstname, lastname FROM user_professors WHERE id = $1 LIMIT 1',
      [user.id],
    );
    if (professor.rows.length === 0) {
      return ErrorHandler('Professor account was not found', 404);
    }

    const dtr = await this.client.query(
      `SELECT id
         FROM dtr
        WHERE professor_id = $1
          AND shift_date BETWEEN $2::date AND $3::date
        ORDER BY shift_date ASC, time_in ASC`,
      [user.id, periodStart, periodEnd],
    );
    if (dtr.rows.length === 0) {
      return ErrorHandler('No DTR records exist for this period', 400);
    }

    const name =
      `${professor.rows[0].firstname || ''}${professor.rows[0].lastname || ''}`.replace(
        /\s+/g,
        '',
      );
    const attachmentName = `DTR_${name || 'Faculty'}_Logged.xlsx`;
    const result = await this.client.query(
      `INSERT INTO dtr_submissions (
         professor_id, period_start, period_end, approval_stage, status,
         remarks, attachment_name, submitted_at, updated_at
       ) VALUES ($1, $2::date, $3::date, 'DTR-AP-STG-1', 'pending',
         'Submitted for Faculty Checker review.', $4, NOW(), NOW())
       ON CONFLICT (professor_id, period_start, period_end)
       DO UPDATE SET
         approval_stage = 'DTR-AP-STG-1',
         status = 'pending',
         remarks = 'Submitted for Faculty Checker review.',
         attachment_name = EXCLUDED.attachment_name,
         submitted_at = NOW(),
         updated_at = NOW()
       RETURNING id, period_start, period_end, approval_stage, status,
                 remarks, attachment_name, submitted_at`,
      [user.id, periodStart, periodEnd, attachmentName],
    );
    const submission = result.rows[0];

    await this.client.query(
      'DELETE FROM dtr_submission_entries WHERE submission_id = $1',
      [submission.id],
    );
    for (const row of dtr.rows) {
      await this.client.query(
        `INSERT INTO dtr_submission_entries (submission_id, dtr_id)
         VALUES ($1, $2)`,
        [submission.id, row.id],
      );
    }

    return SuccessHandler('DTR submitted for review', 201, {
      ...submission,
      entryCount: dtr.rows.length,
      type: 'DTR',
    });
  }

  async getSubmissions(
    user?: UserSession,
    emailQuery?: string,
  ): Promise<HistoryRecord[]> {
    try {
      const prof = await this.resolveProfessor(user, emailQuery);

      // Fetch audit logs directly using AuditService (same source as aris-web audit logs)
      const auditResult = await this.auditService.list({
        type: 'All',
      });
      const allAuditLogs =
        (auditResult as any)?.data?.logs || (auditResult as any)?.logs || [];

      // Map audit logs to HistoryRecord shape
      const mappedAuditRecords: HistoryRecord[] = allAuditLogs.map(
        (log: any) => {
          const stage = log.stage || 'Checker';
          let status: 'Pending' | 'Approved' | 'Rejected' | 'Disapproved' =
            'Pending';
          if (log.result === 'Approved') status = 'Approved';
          else if (log.result === 'Rejected') status = 'Rejected';
          else if (log.result === 'Disapproved') status = 'Disapproved';

          const units = log.target?.includes('·')
            ? log.target.split('·')[1].trim()
            : log.record?.tables?.length
              ? `${log.record.tables.length} courses`
              : log.type === 'DTR'
                ? '22 days'
                : '3 courses';
          const period =
            log.record?.period ||
            (log.target?.includes('·')
              ? log.target.split('·')[0].trim()
              : 'Current Cycle');
          const submitted =
            log.record?.reviewedAt || log.time || formatDisplayDate(new Date());

          return {
            id: log.id || log.record?.reference,
            type: log.type,
            period,
            units,
            submitted,
            status,
            stage,
            currentStage: stage,
            event: log.action
              ? `${log.action} · ${log.target}`
              : log.target || `${log.type} submitted`,
            record: log.record,
          };
        },
      );

      // Scope to this professor if user/email is provided
      const profEmail = (prof?.email || emailQuery || user?.email || '')
        .toLowerCase()
        .trim();
      const profName = prof
        ? `${prof.firstname} ${prof.lastname}`.toLowerCase().trim()
        : ((user as any)?.name || '').toLowerCase().trim();
      const profEmpId = (prof?.employee_id || '').toLowerCase().trim();

      const scoped = mappedAuditRecords.filter((r) => {
        const rec = r.record;
        if (!rec) return false;
        const recEmail = (rec.email || '').toLowerCase().trim();
        const recEmpId = (rec.facultyNumber || '').toLowerCase().trim();
        const recName = (rec.facultyName || '').toLowerCase().trim();

        if (profEmail && recEmail && recEmail === profEmail) return true;
        if (profEmpId && recEmpId && recEmpId === profEmpId) return true;
        if (
          profName &&
          recName &&
          (recName.includes(profName) || profName.includes(recName))
        )
          return true;
        return false;
      });

      // If matched submissions exist for this professor, return them; otherwise return all audit logs
      return scoped.length > 0 ? scoped : mappedAuditRecords;
    } catch (error) {
      console.error(
        '[ProfessorSubmissionsService] getSubmissions error:',
        error,
      );
      return [];
    }
  }

  async getAccomplishmentReports(
    user?: UserSession,
    emailQuery?: string,
  ): Promise<any[]> {
    try {
      const prof = await this.resolveProfessor(user, emailQuery);
      const profId = prof?.id || user?.id || null;
      const employeeId = prof?.employee_id || null;
      const profEmail = (prof?.email || emailQuery || user?.email || '')
        .toLowerCase()
        .trim();

      // 1. Query accomplishment_reports table directly
      let dbReports: any[] = [];
      try {
        let query = `
          SELECT ar.*,
                 up.firstname,
                 up.lastname,
                 up.email AS professor_email
            FROM accomplishment_reports ar
            LEFT JOIN user_professors up ON ar.user_id = up.id
        `;
        const params: unknown[] = [];
        const conds: string[] = [];

        if (profId) {
          params.push(profId);
          conds.push(`ar.user_id = $${params.length}`);
        }
        if (employeeId) {
          params.push(employeeId);
          conds.push(
            `(ar.employee_id = $${params.length} OR ar.faculty_no = $${params.length})`,
          );
        }
        if (profEmail) {
          params.push(profEmail);
          conds.push(`LOWER(up.email) = LOWER($${params.length})`);
        }

        if (conds.length > 0) {
          query += ` WHERE (${conds.join(' OR ')}) `;
        }

        query += ` ORDER BY ar.submitted_at DESC NULLS LAST, ar.created_at DESC`;
        const res = await this.client.query(query, params);
        dbReports = res.rows.map((row: any) => {
          const payload = row.submission_payload || {};
          const period =
            payload.period ||
            row.remarks ||
            'Current Cycle';
          return {
            id: row.id,
            type: 'AR',
            period,
            units:
              row.submission_units ||
              `${payload.tables?.length || 1} courses`,
            submitted:
              row.submitted_at ||
              row.created_at ||
              formatDisplayDate(new Date()),
            created_at: row.created_at,
            submitted_at: row.submitted_at,
            status: row.submission_status
              ? row.submission_status.charAt(0).toUpperCase() +
                row.submission_status.slice(1).toLowerCase()
              : 'Pending',
            stage: row.current_stage || 'Checker',
            currentStage: row.current_stage || 'Checker',
            event:
              row.submission_event || `AR submitted · ${period}`,
            record: {
              ...payload,
              id: row.id,
              period,
              reference:
                row.submission_reference || payload.reference || row.id,
              created_at: row.created_at,
              submitted_at: row.submitted_at,
            },
          };
        });
      } catch (dbErr) {
        console.warn(
          '[ProfessorSubmissionsService] Error fetching accomplishment_reports table:',
          dbErr,
        );
      }

      // 2. Query audit logs for AR submissions
      const submissions = await this.getSubmissions(user, emailQuery);
      const arSubmissions = submissions.filter((s) => s.type === 'AR');

      // 3. Deduplicate and merge by reference or id
      const seen = new Set<string>();
      const combined: any[] = [];

      for (const item of dbReports) {
        const key = item.record?.reference || item.id;
        if (key && !seen.has(key)) {
          seen.add(key);
          combined.push(item);
        }
      }

      for (const item of arSubmissions) {
        const key = item.record?.reference || item.id;
        if (key && !seen.has(key)) {
          seen.add(key);
          combined.push(item);
        }
      }

      return combined.length > 0 ? combined : dbReports;
    } catch (error) {
      console.error(
        '[ProfessorSubmissionsService] getAccomplishmentReports error:',
        error,
      );
      return [];
    }
  }

  async getLatestSubmission(
    user?: UserSession,
    emailQuery?: string,
  ): Promise<LatestSubmission | null> {
    const list = await this.getSubmissions(user, emailQuery);
    if (list.length > 0) {
      const top = list[0];
      const stage =
        top.currentStage ||
        top.stage ||
        (top.status === 'Approved' ? 'Accounting' : 'Checker');
      return {
        type: top.type,
        period: top.period,
        units: top.units,
        reference: top.record?.reference || top.id,
        filed: top.submitted,
        status: top.status,
        currentStage: stage,
        currentSince: top.record?.reviewedAt || top.submitted,
      };
    }
    return null;
  }

  async getDashboardOverview(user?: UserSession, emailQuery?: string) {
    const list = await this.getSubmissions(user, emailQuery);
    const recent = list.slice(0, 4).map((r) => ({
      type: r.type,
      label: `${r.period} · ${r.units}`,
      time: r.submitted,
      status: r.status,
    }));

    return {
      trend: [
        { m: 'May', v: 4 },
        { m: 'Jun', v: 6 },
        { m: 'Jul', v: 5 },
        { m: 'Aug', v: 8 },
        { m: 'Sep', v: list.length },
      ],
      recent,
    };
  }

  async getProfessorCourses(user?: UserSession, emailQuery?: string) {
    try {
      const prof = await this.resolveProfessor(user, emailQuery);
      if (!prof) {
        const allRes = await this.client.query(
          `SELECT DISTINCT c.id, c.code, c.title, c.units, c.department_name, c.description, c.is_active
             FROM curriculum_courses c
            WHERE c.is_active = true
            ORDER BY c.code ASC`,
        );
        return SuccessHandler('Courses fetched', 200, allRes.rows);
      }

      const profDept = prof.department || '';
      const profId = prof.id;
      const profEmail = prof.email;
      const employeeId = prof.employee_id || '';

      const query = `
        SELECT DISTINCT c.id, c.code, c.title, c.units, c.department_name, c.description, c.is_active
          FROM curriculum_courses c
         WHERE c.is_active = true
           AND (
             c.assigned_professor_id = $1
             OR LOWER(COALESCE(c.assigned_professor_email, '')) = LOWER($2)
             OR (
               $3 <> '' AND (
                 LOWER(c.department_name) = LOWER($3)
                 OR c.department_name ILIKE '%' || $3 || '%'
                 OR $3 ILIKE '%' || c.department_name || '%'
                 OR (
                   ($3 ILIKE '%CSD%' OR $3 ILIKE '%Computer%') AND (c.department_name ILIKE '%Computer%' OR c.department_name ILIKE '%CSD%')
                 )
                 OR (
                   ($3 ILIKE '%Engineering%') AND (c.department_name ILIKE '%Engineering%')
                 )
                 OR (
                   ($3 ILIKE '%Education%') AND (c.department_name ILIKE '%Education%')
                 )
                 OR (
                   ($3 ILIKE '%Criminal%' OR $3 ILIKE '%Justice%') AND (c.department_name ILIKE '%Criminal%' OR c.department_name ILIKE '%Justice%')
                 )
               )
             )
             OR c.code IN (
               SELECT re.code
                 FROM report_entries re
                 JOIN accomplishment_reports ar ON ar.id = re.report_id
                WHERE ar.user_id = $1 OR ar.employee_id = $4
             )
           )
         ORDER BY c.code ASC
      `;

      const result = await this.client.query(query, [
        profId,
        profEmail,
        profDept,
        employeeId,
      ]);
      let rows = result.rows;

      if (rows.length === 0) {
        // If no department-specific course was found, return active courses
        const fallbackRes = await this.client.query(
          `SELECT DISTINCT c.id, c.code, c.title, c.units, c.department_name, c.description, c.is_active
             FROM curriculum_courses c
            WHERE c.is_active = true
            ORDER BY c.code ASC
            LIMIT 15`,
        );
        rows = fallbackRes.rows;
      }

      return SuccessHandler(
        'Professor courses fetched successfully',
        200,
        rows,
      );
    } catch (error) {
      console.error(
        '[ProfessorSubmissionsService] getProfessorCourses error:',
        error,
      );
      return ErrorHandler(
        error instanceof Error ? error.message : 'Failed to fetch courses',
        500,
      );
    }
  }
}

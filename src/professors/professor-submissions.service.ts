import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import type { UserSession } from '../lib/data/interfaces';

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

const STAGE_KEY_MAP: Record<string, string> = {
  'AR-AP-STG-1': 'Checker',
  'AR-AP-STG-2': 'Secretary',
  'AR-AP-STG-3': 'HR',
  'AR-AP-STG-4': 'Accounting',
};

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

function formatMonthDay(d: Date | string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date.getTime())) return String(d);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function toDbStatus(s: string | undefined): 'pending' | 'approved' | 'rejected' | 'disapproved' | 'submitted' {
  const lower = String(s || 'pending').toLowerCase();
  if (['pending', 'approved', 'rejected', 'disapproved', 'submitted', 'draft', 'flagged', 'missing'].includes(lower)) {
    return lower as any;
  }
  return 'pending';
}

function toTitleCaseStatus(s: string | null | undefined): 'Pending' | 'Approved' | 'Rejected' | 'Disapproved' {
  if (!s) return 'Pending';
  const lower = s.toLowerCase();
  if (lower === 'approved') return 'Approved';
  if (lower === 'rejected') return 'Rejected';
  if (lower === 'disapproved') return 'Disapproved';
  return 'Pending';
}

function parseCampus(c: string | undefined): 'south' | 'congress' | 'camarin' | 'bagong silang' {
  const lower = (c || '').toLowerCase();
  if (lower.includes('south')) return 'south';
  if (lower.includes('camarin')) return 'camarin';
  if (lower.includes('bagong') || lower.includes('silang')) return 'bagong silang';
  return 'congress';
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
  ) {}

  private get client() {
    return this.databaseService.getClient();
  }

  private async resolveProfessor(user?: UserSession, emailQuery?: string) {
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

    // Default to first professor in database if no user specified
    const fallback = await this.client.query(
      'SELECT * FROM user_professors ORDER BY created_at ASC LIMIT 1',
    );
    return fallback.rows[0] || null;
  }

  async createSubmission(user: UserSession | undefined, data: any) {
    try {
      const type: 'AR' | 'DTR' = (data.type === 'DTR' || data.recordType?.includes('DTR')) ? 'DTR' : 'AR';
      const reference: string = data.id || data.reference || `${type}-${Date.now()}`;
      const period: string = data.period || 'Current Cycle';
      const units: string = data.units || (type === 'AR' ? '3 courses' : '22 days');
      const dbStatus = toDbStatus(data.status);
      const titleStatus = toTitleCaseStatus(dbStatus);
      const event: string = data.event || `${type} submitted · ${period}`;
      const recordPayload = data.record || data;
      const userEmail = user?.email || recordPayload.facultyEmail || null;
      const topics = recordPayload.topics || null;
      const notes = recordPayload.notes || null;

      const prof = await this.resolveProfessor(user, userEmail);
      const profId = prof?.id || null;
      const employeeId = prof?.employee_id || recordPayload.facultyNumber || 'P00001';

      let reportId: string | null = null;

      // Bridge AR to accomplishment_reports & report_entries
      if (type === 'AR' && profId) {
        try {
          const facultyNo = recordPayload.facultyNumber || employeeId;
          const repRes = await this.client.query(
            `
            INSERT INTO accomplishment_reports (
              user_id, employee_id, faculty_no, period_start, period_end, approval_stage, remarks
            ) VALUES (
              $1, $2, $3, CURRENT_DATE - INTERVAL '14 days', CURRENT_DATE, 'AR-AP-STG-1', $4
            )
            RETURNING id;
            `,
            [profId, employeeId, facultyNo, notes || 'Submitted from ARIS Desktop'],
          );

          reportId = repRes.rows[0]?.id || null;

          if (reportId && Array.isArray(recordPayload.tables)) {
            for (const tbl of recordPayload.tables) {
              const courseTitle = tbl.title || 'General Course';
              if (Array.isArray(tbl.rows)) {
                for (const row of tbl.rows) {
                  const code = String(row[0] || 'CC 105');
                  const section = String(row[1] || 'BSIT 2A');
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
                      'BSIT',
                      2,
                      section,
                      unitVal,
                      day,
                      shiftStart,
                      shiftEnd,
                      campusVal,
                      topics || 'Course syllabus alignment',
                      recordPayload.tasks || 'Lecture and laboratory exercises',
                    ],
                  );
                }
              }
            }
          }
        } catch (bridgeErr) {
          console.warn('[ProfessorSubmissionsService] Bridge to reports warning:', bridgeErr);
        }
      }

      await this.client.query(
        `
        INSERT INTO submissions (
          report_id, user_id, professor_id, user_email, role, reference, record_type,
          period, units, status, event, payload, topics, notes, submitted_at, current_stage, current_since
        ) VALUES (
          $1, $2, $2, $3, 'professor', $4, $5,
          $6, $7, $8, $9, $10, $11, $12, NOW(), 'Checker', NOW()
        )
        ON CONFLICT (reference) DO UPDATE SET
          status = EXCLUDED.status,
          payload = EXCLUDED.payload,
          event = EXCLUDED.event,
          report_id = COALESCE(EXCLUDED.report_id, submissions.report_id),
          updated_at = NOW()
        RETURNING *;
        `,
        [
          reportId,
          profId,
          userEmail,
          reference,
          type,
          period,
          units,
          dbStatus,
          event,
          JSON.stringify(recordPayload),
          topics,
          notes,
        ],
      );

      return SuccessHandler('Submission recorded successfully', 201, {
        id: reference,
        type,
        period,
        units,
        status: titleStatus,
        event,
        record: recordPayload,
      });
    } catch (error) {
      console.error('[ProfessorSubmissionsService] Error recording submission:', error);
      return ErrorHandler(
        error instanceof Error ? error.message : 'Failed to record submission',
        500,
      );
    }
  }

  async getSubmissions(user?: UserSession, emailQuery?: string): Promise<HistoryRecord[]> {
    try {
      const prof = await this.resolveProfessor(user, emailQuery);
      const records: HistoryRecord[] = [];

      // 1. Fetch from submissions table for this professor
      if (prof?.id || prof?.email) {
        const subRes = await this.client.query(
          `
          SELECT * FROM submissions
           WHERE professor_id = $1 OR user_id = $1 OR LOWER(user_email) = LOWER($2)
           ORDER BY submitted_at DESC, created_at DESC
           LIMIT 100
          `,
          [prof.id, prof.email],
        );

        for (const row of subRes.rows) {
          let payload = row.payload;
          if (typeof payload === 'string') {
            try {
              payload = JSON.parse(payload);
            } catch {}
          }

          const titleStatus = toTitleCaseStatus(row.status);
          const currentStage = row.current_stage || 'Checker';

          records.push({
            id: row.reference || row.id,
            type: (row.record_type === 'DTR' ? 'DTR' : 'AR'),
            period: row.period || 'Current Cycle',
            units: row.units || (row.record_type === 'DTR' ? '22 days' : '3 courses'),
            submitted: formatDisplayDate(row.submitted_at || row.created_at),
            status: titleStatus,
            stage: currentStage,
            currentStage: currentStage,
            event: row.event || `${row.record_type} submitted · ${row.period || ''}`,
            record: payload || {
              period: row.period,
              reference: row.reference,
              facultyName: `${prof.firstname} ${prof.lastname}`,
              facultyNumber: prof.employee_id,
              college: prof.department || 'College of Liberal Arts and Sciences',
              tables: [],
              topics: row.topics,
              tasks: row.notes,
              reviewer: currentStage,
              reviewedAt: formatDisplayDate(row.submitted_at),
              remark: row.remark || 'Received and queued for review.',
            },
          });
        }
      }

      // 2. Fetch from accomplishment_reports table for this professor
      if (prof?.id) {
        const arRes = await this.client.query(
          `
          SELECT ar.*, ast.label as stage_label, ast.stage_order,
                 COALESCE(up.firstname || ' ' || up.lastname, 'Faculty') as faculty_name
            FROM accomplishment_reports ar
            LEFT JOIN approval_stages ast ON ast.stage_key = ar.approval_stage
            LEFT JOIN user_professors up ON up.id = ar.user_id OR up.employee_id = ar.employee_id
           WHERE ar.user_id = $1 OR ar.employee_id = $2 OR LOWER(up.email) = LOWER($3)
           ORDER BY ar.created_at DESC
           LIMIT 20
          `,
          [prof.id, prof.employee_id, prof.email],
        );

        for (const ar of arRes.rows) {
          const ref = `AR-${new Date(ar.created_at).toISOString().slice(0, 10).replace(/-/g, '')}-${ar.faculty_no || prof.employee_id || '001'}`;
          const isDup = records.some((r) => r.id === ref || r.record?.reference === ref);
          if (!isDup) {
            const startStr = formatMonthDay(ar.period_start);
            const endStr = formatMonthDay(ar.period_end);
            const periodStr = `${startStr} – ${endStr}`;
            
            // Determine accurate stage and status
            const stageName = STAGE_KEY_MAP[ar.approval_stage] || ar.stage_label || 'Checker';
            let statusStr: 'Pending' | 'Approved' | 'Rejected' = 'Pending';
            if (ar.remarks && /reject|disapprov|return|flag/i.test(ar.remarks)) {
              statusStr = 'Rejected';
            } else if (ar.payroll_received || ar.payroll_availability) {
              statusStr = 'Approved';
            } else if (ar.approval_stage === 'AR-AP-STG-4') {
              // At stage 4, in accounting processing
              statusStr = 'Pending';
            }

            const entriesRes = await this.client.query(
              `SELECT * FROM report_entries WHERE report_id = $1 ORDER BY class_date, shift_start`,
              [ar.id],
            );
            const entryRows = (entriesRes.rows || []).map((e) => [
              e.code || '',
              `${e.program || ''} ${e.year || ''}${e.section || ''}`.trim(),
              Number(e.units) || 3,
              e.day || '',
              `${e.shift_start ? String(e.shift_start).slice(0, 5) : '08:00'}–${e.shift_end ? String(e.shift_end).slice(0, 5) : '11:00'}`,
              (e.campus || '').toUpperCase(),
            ]);
            const unitLabel = entryRows.length > 0 ? `${entryRows.length} classes` : '1 report';

            records.push({
              id: ref,
              type: 'AR',
              period: periodStr,
              units: unitLabel,
              submitted: formatDisplayDate(ar.created_at),
              status: statusStr,
              stage: stageName,
              currentStage: stageName,
              event: `AR submitted · ${periodStr}`,
              record: {
                period: periodStr,
                reference: ref,
                facultyName: ar.faculty_name,
                facultyNumber: ar.faculty_no || prof.employee_id || '',
                college: prof.department || 'College of Computer Studies',
                stage: stageName,
                tables: entryRows.length > 0 ? [
                  {
                    title: `Report Entries — ${periodStr}`,
                    meta: `${startStr} – ${endStr}`,
                    columns: ['Code', 'Program, Year & Section', 'Units', 'Days', 'Time', 'Campus'],
                    rows: entryRows,
                  },
                ] : [],
                topics: ar.remarks || '',
                tasks: '',
                reviewer: stageName,
                reviewedAt: formatDisplayDate(ar.updated_at || ar.created_at),
                remark: ar.payroll_received
                  ? 'All outputs verified. Approved for payroll processing.'
                  : `Currently with the ${stageName} office for review.`,
              },
            });
          }
        }
      }

      return records;
    } catch (error) {
      console.error('[ProfessorSubmissionsService] getSubmissions error:', error);
      return [];
    }
  }

  async getLatestSubmission(user?: UserSession, emailQuery?: string): Promise<LatestSubmission | null> {
    const list = await this.getSubmissions(user, emailQuery);
    if (list.length > 0) {
      const top = list[0];
      const stage = top.currentStage || top.stage || (top.status === 'Approved' ? 'Accounting' : 'Checker');
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
}

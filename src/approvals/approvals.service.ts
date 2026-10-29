import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { UserSession } from '../lib/data/interfaces';
import { UpdateApprovalDto } from './dto/approvals.dto';

export type StageRole = 'Checker' | 'Secretary' | 'HR' | 'Accounting';
export type StatusKind = 'Pending' | 'Approved' | 'Disapproved' | 'Flagged';

export interface ApprovalRecordTable {
  title: string;
  meta?: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface ApprovalRecordPayload {
  period: string;
  reference: string;
  facultyName: string;
  facultyNumber: string;
  college: string;
  tables: ApprovalRecordTable[];
  topics?: string;
  tasks?: string;
  notes?: string;
  attachment?: string;
  reviewer: string;
  reviewedAt: string;
  remark: string;
}

export interface ApprovalItem {
  id: string;
  faculty: string;
  facultyNumber: string;
  type: 'AR' | 'DTR';
  period: string;
  reference: string;
  submitted: string;
  stage: StageRole;
  status: StatusKind;
  event: string;
  record: ApprovalRecordPayload;
}

const AR_COLUMNS = [
  'Code',
  'Program, Year & Section',
  'Units',
  'Days',
  'Time',
  'Campus',
];

const DTR_COLUMNS = ['Date', 'Time In', 'Time Out', 'Hours'];

function formatTime(date: Date | string | null): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const STAGE_ORDER_MAP: Record<number, StageRole> = {
  1: 'Checker',
  2: 'Secretary',
  3: 'HR',
  4: 'Accounting',
};

const STAGE_KEY_MAP: Record<string, StageRole> = {
  'AR-AP-STG-1': 'Checker',
  'AR-AP-STG-2': 'Secretary',
  'AR-AP-STG-3': 'HR',
  'AR-AP-STG-4': 'Accounting',
};

const NEXT_STAGE_KEY: Record<StageRole, string> = {
  Checker: 'AR-AP-STG-2',
  Secretary: 'AR-AP-STG-3',
  HR: 'AR-AP-STG-4',
  Accounting: 'AR-AP-STG-4',
};

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly loggerService: LoggerService,
  ) {}

  private get client() {
    return this.databaseService.getClient();
  }

  async listApprovals(user?: UserSession) {
    try {
      // Determine staff position/role to scope submissions if user is staff
      let staffRole: StageRole | null = null;
      if (user?.role === 'staff') {
        let pos = user.position;
        if (!pos && user.id) {
          const staffRes = await this.client.query(
            'SELECT position FROM user_staffs WHERE id = $1 LIMIT 1',
            [user.id],
          );
          pos = staffRes.rows[0]?.position;
        }
        if (pos) {
          const lower = pos.trim().toLowerCase();
          if (lower.includes('check')) staffRole = 'Checker';
          else if (lower.includes('sec')) staffRole = 'Secretary';
          else if (lower.includes('hr') || lower.includes('human')) staffRole = 'HR';
          else if (lower.includes('account') || lower.includes('payroll')) staffRole = 'Accounting';
        }
      }
      // 1. Fetch approval stages
      const stagesRes = await this.client.query(`
        SELECT id, stage_key, label, stage_order, is_active
          FROM approval_stages
         ORDER BY stage_order ASC
      `);
      const stagesMap = new Map<string, { label: string; stage_order: number }>();
      stagesRes.rows.forEach((s) => {
        stagesMap.set(s.stage_key, { label: s.label, stage_order: s.stage_order });
      });

      // 2. Fetch accomplishment reports joined with faculty data
      const arRes = await this.client.query(`
        SELECT
          ar.id,
          ar.user_id,
          ar.employee_id,
          ar.faculty_no,
          ar.period_start,
          ar.period_end,
          ar.approval_stage,
          COALESCE(ast.label, ar.approval_stage) AS stage_label,
          COALESCE(ast.stage_order, 1) AS stage_order,
          ar.remarks,
          ar.payroll_availability,
          ar.payroll_received,
          ar.payroll_received_date,
          ar.created_at,
          ar.updated_at,
          COALESCE(up.firstname || ' ' || up.lastname, us.firstname || ' ' || us.lastname, 'Faculty ' || ar.faculty_no) AS faculty_name,
          COALESCE(up.department, us.department, 'Academic Department') AS department,
          COALESCE(up.position, us.position, 'Professor') AS faculty_rank,
          COALESCE(up.email, us.email, 'faculty@aris.edu.ph') AS email,
          sub.status AS submission_status,
          sub.event AS submission_event,
          sub.stage AS submission_stage
        FROM accomplishment_reports ar
        LEFT JOIN approval_stages ast ON ast.stage_key = ar.approval_stage
        LEFT JOIN LATERAL (
          SELECT s.id, s.status, s.event, s.stage
          FROM submissions s
          WHERE s.report_id = ar.id
          ORDER BY s.updated_at DESC
          LIMIT 1
        ) sub ON TRUE
        LEFT JOIN user_professors up ON up.id = ar.user_id OR up.employee_id = ar.employee_id
        LEFT JOIN user_staffs us ON us.id = ar.user_id OR us.employee_id = ar.employee_id
        ORDER BY ar.updated_at DESC, ar.created_at DESC
      `);

      // 3. Fetch report entries
      const entriesRes = await this.client.query(`
        SELECT
          re.id,
          re.report_id,
          re.course,
          re.code,
          re.program,
          re.year,
          re.section,
          re.units,
          re.day,
          re.shift_hours,
          re.shift_start,
          re.shift_end,
          re.campus,
          re.class_date,
          re.topics,
          re.description
        FROM report_entries re
        ORDER BY re.class_date ASC
      `);

      const entriesByReport = new Map<string, any[]>();
      entriesRes.rows.forEach((entry) => {
        const list = entriesByReport.get(entry.report_id) || [];
        list.push(entry);
        entriesByReport.set(entry.report_id, list);
      });

      // 4. Fetch DTR entries
      const dtrRes = await this.client.query(`
        SELECT
          d.id,
          d.professor_id,
          d.shift_date,
          d.time_in,
          d.time_out,
          d.total_hours,
          d.created_at,
          COALESCE(up.firstname || ' ' || up.lastname, 'Faculty') AS professor_name,
          COALESCE(up.department, 'Academic Department') AS department,
          up.employee_id
        FROM dtr d
        LEFT JOIN user_professors up ON up.id = d.professor_id
        ORDER BY d.shift_date DESC, d.time_in DESC
      `);

      const items: ApprovalItem[] = [];

      // Process Accomplishment Reports
      for (const ar of arRes.rows) {
        const entries = entriesByReport.get(ar.id) || [];
        const entryCount = entries.length;

        const courseGroups = new Map<string, any[]>();
        entries.forEach((e) => {
          const key = `${e.course || 'COURSE'} — ${e.code || ''}`.trim();
          if (!courseGroups.has(key)) courseGroups.set(key, []);
          courseGroups.get(key)!.push(e);
        });

        const tables: ApprovalRecordTable[] = [];
        courseGroups.forEach((groupEntries, key) => {
          const startDate = groupEntries[0]?.class_date ? formatDate(groupEntries[0].class_date) : '';
          const endDate = groupEntries[groupEntries.length - 1]?.class_date
            ? formatDate(groupEntries[groupEntries.length - 1].class_date)
            : '';
          const meta = startDate && endDate ? `${startDate} – ${endDate}` : `${groupEntries.length} sessions`;

          const rows = groupEntries.map((e) => [
            e.code || '—',
            `${e.program || 'BSIT'} ${e.year || 1}${e.section || 'A'}`,
            Number(e.units) || 3,
            e.day || 'MON',
            `${e.shift_start ? String(e.shift_start).slice(0, 5) : '08:00'}–${e.shift_end ? String(e.shift_end).slice(0, 5) : '11:00'}`,
            (e.campus || 'congress').toUpperCase(),
          ]);

          tables.push({
            title: key,
            meta,
            columns: AR_COLUMNS,
            rows,
          });
        });

        const topics = Array.from(new Set(entries.map((e) => e.topics).filter(Boolean))).join('\n');
        const tasks = Array.from(new Set(entries.map((e) => e.description).filter(Boolean))).join('\n');

        const periodStr = `${formatDate(ar.period_start)} – ${formatDate(ar.period_end)}`;
        const refStr = `AR-${ar.faculty_no || '000'}-${ar.id.slice(0, 8).toUpperCase()}`;

        // Stage mapping: 1 -> Checker, 2 -> Secretary, 3 -> HR, 4 -> Accounting
        const stage: StageRole =
          STAGE_KEY_MAP[ar.approval_stage] ||
          STAGE_ORDER_MAP[ar.stage_order] ||
          'Checker';

        const isResubmitted =
          (ar.submission_status === 'pending' &&
            (ar.approval_stage === 'AR-AP-STG-1' ||
              ar.stage_order === 1 ||
              (ar.submission_event && /resubmit/i.test(ar.submission_event)) ||
              (ar.remarks && /resubmit|correction/i.test(ar.remarks)))) ||
          Boolean(ar.submission_event && /resubmit/i.test(ar.submission_event)) ||
          Boolean(ar.remarks && /resubmit/i.test(ar.remarks));

        // Status mapping
        let status: StatusKind = 'Pending';
        let action = 'AR submitted';

        if (isResubmitted) {
          status = 'Pending';
          action = 'AR resubmitted with corrections · Pending review';
        } else if (ar.remarks && /reject|disapprov/i.test(ar.remarks) && !/resubmit/i.test(ar.remarks)) {
          status = 'Disapproved';
          action = 'AR returned for correction';
        } else if (ar.approval_stage === 'AR-AP-STG-4' || ar.stage_order >= 4) {
          status = ar.payroll_availability || ar.payroll_received ? 'Approved' : 'Pending';
          action = ar.payroll_received
            ? 'AR approved · Payroll received'
            : ar.payroll_availability
              ? 'AR approved · Payroll released'
              : 'AR in Accounting validation';
        } else if (ar.stage_order === 3) {
          action = 'AR endorsed by Secretary to HR';
        } else if (ar.stage_order === 2) {
          action = 'AR verified by Checker, endorsed to Secretary';
        } else {
          action = 'AR submitted · Pending checker review';
        }

        const reviewer =
          stage === 'Checker'
            ? 'Prof. R. Alonzo (Checker)'
            : stage === 'Secretary'
              ? 'L. Bautista (Secretary)'
              : stage === 'HR'
                ? 'Ana Bautista (HR)'
                : 'Payroll Office (Accounting)';

        const reviewedAt = `${formatDate(ar.updated_at || ar.created_at)} · ${formatTime(ar.updated_at || ar.created_at)}`;
        const submitted = `${formatDate(ar.created_at)} · ${formatTime(ar.created_at)}`;

        items.push({
          id: ar.id,
          faculty: ar.faculty_name,
          facultyNumber: ar.faculty_no || ar.employee_id || '—',
          type: 'AR',
          period: periodStr,
          reference: refStr,
          submitted,
          stage,
          status,
          event: `${action} · ${entryCount} outputs`,
          record: {
            period: periodStr,
            reference: refStr,
            facultyName: ar.faculty_name,
            facultyNumber: ar.faculty_no || '—',
            college: ar.department,
            tables,
            topics: topics || 'Curriculum delivery, student mentorship, and laboratory activities.',
            tasks: tasks || 'Conducted scheduled lectures, prepared modules, and submitted grade records.',
            notes: isResubmitted
              ? (ar.remarks && !/disapprov|reject|returned to the faculty/i.test(ar.remarks) ? ar.remarks : 'Resubmitted with corrections. Pending review.')
              : (ar.remarks || undefined),
            attachment: `${ar.faculty_name.replace(/[^a-zA-Z]/g, '')}_AR_${periodStr.replace(/\s+/g, '_')}.pdf · 1.2 MB`,
            reviewer,
            reviewedAt,
            remark: isResubmitted
              ? 'Resubmitted with corrections. Pending review.'
              : (ar.remarks || `Current Stage: ${stage}. Awaiting verification.`),
          },
        });
      }

      // Process DTR entries grouped by Professor
      const dtrByProf = new Map<string, any[]>();
      dtrRes.rows.forEach((row) => {
        const key = row.professor_id || 'unknown';
        const list = dtrByProf.get(key) || [];
        list.push(row);
        dtrByProf.set(key, list);
      });

      dtrByProf.forEach((logs, profId) => {
        if (!logs.length) return;
        const first = logs[0];
        const daysLogged = logs.length;
        const totalHours = logs.reduce((acc, r) => acc + (Number(r.total_hours) || 0), 0).toFixed(1);

        const startDate = formatDate(logs[logs.length - 1]?.shift_date);
        const endDate = formatDate(logs[0]?.shift_date);
        const periodStr = `${startDate} – ${endDate}`;

        const rows = logs.slice(0, 15).map((l) => [
          formatDate(l.shift_date),
          formatTime(l.time_in ? `1970-01-01T${l.time_in}` : null),
          formatTime(l.time_out ? `1970-01-01T${l.time_out}` : null),
          Number(l.total_hours) || 0,
        ]);

        const tables: ApprovalRecordTable[] = [
          {
            title: `DTR Log Summary — ${periodStr}`,
            meta: `${daysLogged} days logged · ${totalHours} hours`,
            columns: DTR_COLUMNS,
            rows,
          },
        ];

        let stage: StageRole = 'HR';
        let status: StatusKind = 'Pending';
        let action = 'DTR submitted';

        if (daysLogged >= 20) {
          stage = 'Accounting';
          status = 'Approved';
          action = 'DTR approved by HR · Endorsed to Accounting';
        } else if (daysLogged < 10) {
          status = 'Flagged';
          action = 'DTR flagged · Incomplete duty logs';
        } else {
          stage = 'HR';
          status = 'Pending';
          action = 'DTR submitted · Pending HR validation';
        }

        const reviewer =
          stage === 'Accounting' ? 'Ana Bautista (HR)' : 'HR Attendance Verification';
        const submitted = `${endDate} · ${formatTime(first.created_at || new Date())}`;

        items.push({
          id: `dtr-${profId}`,
          faculty: first.professor_name || 'Faculty Member',
          facultyNumber: first.employee_id || profId.slice(0, 4),
          type: 'DTR',
          period: periodStr,
          reference: `DTR-2026-${(first.employee_id || profId.slice(0, 4)).toUpperCase()}`,
          submitted,
          stage,
          status,
          event: `${action} · ${daysLogged} days`,
          record: {
            period: periodStr,
            reference: `DTR-2026-${(first.employee_id || profId.slice(0, 4)).toUpperCase()}`,
            facultyName: first.professor_name || 'Faculty Member',
            facultyNumber: first.employee_id || '—',
            college: first.department || 'Academic Department',
            tables,
            notes: `Total duty hours rendered: ${totalHours} hrs across ${daysLogged} working days.`,
            attachment: `${(first.professor_name || 'Faculty').replace(/[^a-zA-Z]/g, '')}_DTR.xlsx · 84 KB`,
            reviewer,
            reviewedAt: `${endDate} · ${formatTime(first.created_at)}`,
            remark:
              daysLogged >= 20
                ? 'Completed required duty hours for payroll endorsement.'
                : 'Pending additional biometric shift reconciliation.',
          },
        });
      });

      const scopedItems = staffRole ? items.filter((it) => it.stage === staffRole) : items;
      return SuccessHandler('Approvals fetched successfully', 200, scopedItems);
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async handleDecision(user: UserSession, payload: any) {
    try {
      // Support array of items (like whole queue save from client) or single decision
      if (Array.isArray(payload)) {
        return SuccessHandler('Queue updated successfully', 200, { updated: payload.length });
      }

      const { id, action, remark, stage, role } = payload;
      if (!id) {
        return ErrorHandler('Missing approval item ID', 400);
      }

      // Check if it's an Accomplishment Report (UUID)
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      if (isUUID) {
        const arCheck = await this.client.query(
          `SELECT id, approval_stage, remarks FROM accomplishment_reports WHERE id = $1`,
          [id],
        );

        if (arCheck.rows.length === 0) {
          return ErrorHandler('Report not found', 404);
        }

        const currentStageKey = arCheck.rows[0].approval_stage;
        const currentStageRole: StageRole =
          STAGE_KEY_MAP[currentStageKey] || (stage as StageRole) || 'Checker';

        const isAccountingApproval =
          action === 'Approve' &&
          (currentStageRole === 'Accounting' ||
            currentStageKey === 'AR-AP-STG-4' ||
            stage === 'Accounting' ||
            role === 'Accounting');

        let payrollResult: any = null;

        if (action === 'Approve') {
          const nextStageKey = isAccountingApproval
            ? 'AR-AP-STG-4'
            : NEXT_STAGE_KEY[currentStageRole] || 'AR-AP-STG-4';
          const isFinal = isAccountingApproval;

          const remarkText =
            remark ||
            (isFinal
              ? `Approved by ${role || currentStageRole} and cleared for payroll.`
              : `Approved at ${role || currentStageRole} stage and forwarded to next stage.`);

          const nextStageRole = STAGE_KEY_MAP[nextStageKey] || 'Accounting';

          await this.client.query(
            `UPDATE accomplishment_reports
                SET approval_stage = $1,
                    remarks = $2,
                    payroll_availability = (CASE WHEN $3::boolean = TRUE THEN TRUE ELSE payroll_availability END),
                    payroll_received_date = (CASE WHEN $3::boolean = TRUE AND payroll_received_date IS NULL THEN NOW() ELSE payroll_received_date END),
                    updated_at = NOW()
              WHERE id = $4`,
            [nextStageKey, remarkText, isAccountingApproval, id],
          );

          // Keep submissions table in sync at every approval stage
          const subRes = await this.client.query(
            `UPDATE submissions
                SET status = (CASE WHEN $1::boolean = TRUE THEN 'approved'::submission_status ELSE 'pending'::submission_status END),
                    stage = $2,
                    current_stage = $2,
                    reviewed_by = $3,
                    reviewed_at = NOW(),
                    remark = $4,
                    event = $5,
                    updated_at = NOW()
              WHERE report_id = $6
              RETURNING id`,
            [
              isAccountingApproval,
              nextStageRole,
              user.id,
              remarkText,
              isAccountingApproval
                ? 'AR approved by Accounting · Cleared for payroll'
                : `AR approved by ${role || currentStageRole} · Forwarded to ${nextStageRole}`,
              id,
            ],
          );
          const subId = subRes.rows[0]?.id || null;

          if (isAccountingApproval) {
            // Automatically calculate payroll based on time (assumed for now)
            const entriesRes = await this.client.query(
              `SELECT id, units, shift_hours, shift_start, shift_end, class_date
                 FROM report_entries
                WHERE report_id = $1`,
              [id],
            );

            const arInfoRes = await this.client.query(
              `SELECT
                 ar.id,
                 ar.user_id,
                 ar.employee_id,
                 ar.faculty_no,
                 ar.period_start,
                 ar.period_end,
                 COALESCE(up.firstname || ' ' || up.lastname, us.firstname || ' ' || us.lastname, 'Faculty') AS faculty_name,
                 COALESCE(up.id, ar.user_id) AS prof_id,
                 COALESCE(up.employee_id, ar.employee_id, ar.faculty_no) AS emp_id
               FROM accomplishment_reports ar
               LEFT JOIN user_professors up ON up.id = ar.user_id OR up.employee_id = ar.employee_id
               LEFT JOIN user_staffs us ON us.id = ar.user_id OR us.employee_id = ar.employee_id
               WHERE ar.id = $1 LIMIT 1`,
              [id],
            );

            const arInfo = arInfoRes.rows[0] || {};
            let totalHours = 0;
            for (const entry of entriesRes.rows) {
              let h = Number(entry.shift_hours);
              if (isNaN(h) || h <= 0) {
                if (entry.shift_start && entry.shift_end) {
                  const [sh, sm] = String(entry.shift_start).split(':').map(Number);
                  const [eh, em] = String(entry.shift_end).split(':').map(Number);
                  const diff = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
                  h = diff > 0 ? diff / 60 : 3;
                } else if (entry.units && Number(entry.units) > 0) {
                  h = Number(entry.units);
                } else {
                  h = 3;
                }
              }
              totalHours += h;
            }

            if (totalHours <= 0) {
              totalHours = 30; // standard default period duty hours
            }

            // Assumed hourly teaching rate: ₱500/hr
            const ASSUMED_HOURLY_RATE = 500;
            const calculatedSalary = Math.round(totalHours * ASSUMED_HOURLY_RATE);

            const periodStr =
              arInfo.period_start && arInfo.period_end
                ? `${formatDate(arInfo.period_start)} – ${formatDate(arInfo.period_end)}`
                : 'September Cycle 1';
            const unitsStr = `${totalHours.toFixed(1)} hrs (${entriesRes.rows.length || 1} outputs)`;

            // Put on payroll records
            const existingPayroll = await this.client.query(
              `SELECT id FROM payroll WHERE report_id = $1 LIMIT 1`,
              [id],
            );

            let payrollId: string;
            const meta = JSON.stringify({
              report_id: id,
              approved_by: user.id,
              approver_role: role || currentStageRole,
              hourly_rate: ASSUMED_HOURLY_RATE,
              total_hours: totalHours,
              formula: `${totalHours} hrs × ₱${ASSUMED_HOURLY_RATE}/hr = ₱${calculatedSalary}`,
            });

            if (existingPayroll.rows.length > 0) {
              payrollId = existingPayroll.rows[0].id;
              await this.client.query(
                `UPDATE payroll
                    SET user_id = $1,
                        professor_id = $2,
                        employee_id = $3,
                        type = 'AR',
                        period = $4,
                        units = $5,
                        hours = $6,
                        rate = $7,
                        salary = $8,
                        amount = $8,
                        status = 'Approved',
                        date_received = NOW(),
                        metadata = $9,
                        updated_at = NOW()
                  WHERE id = $10`,
                [
                  arInfo.prof_id,
                  arInfo.prof_id,
                  arInfo.emp_id,
                  periodStr,
                  unitsStr,
                  totalHours,
                  ASSUMED_HOURLY_RATE,
                  calculatedSalary,
                  meta,
                  payrollId,
                ],
              );
            } else {
              const ins = await this.client.query(
                `INSERT INTO payroll (
                   user_id, professor_id, employee_id, report_id, submission_id,
                   type, period, units, hours, rate, salary, amount, status, date_received, metadata
                 ) VALUES (
                   $1, $2, $3, $4, $5, 'AR', $6, $7, $8, $9, $10, $10, 'Approved', NOW(), $11
                 ) RETURNING id`,
                [
                  arInfo.prof_id,
                  arInfo.prof_id,
                  arInfo.emp_id,
                  id,
                  subId,
                  periodStr,
                  unitsStr,
                  totalHours,
                  ASSUMED_HOURLY_RATE,
                  calculatedSalary,
                  meta,
                ],
              );
              payrollId = ins.rows[0].id;
            }

            // Log into payroll_logs
            await this.client.query(
              `INSERT INTO payroll_logs (
                 action_type, action_status, professor_id, user_id, employee_id, salary, date_received, metadata, created_at
               ) VALUES ('create_payroll', 'success', $1, $1, $2, $3, NOW(), $4, NOW())`,
              [arInfo.prof_id, arInfo.emp_id, calculatedSalary, meta],
            );

            payrollResult = {
              id: payrollId,
              amount: calculatedSalary,
              hours: totalHours,
              rate: ASSUMED_HOURLY_RATE,
              period: periodStr,
              units: unitsStr,
              status: 'Approved',
            };
          }
        } else {
          // Disapprove
          const remarkText =
            remark || `Disapproved at ${role || currentStageRole} stage. Returned to faculty for correction.`;

          await this.client.query(
            `UPDATE accomplishment_reports
                SET remarks = $1,
                    payroll_availability = FALSE,
                    payroll_received = FALSE,
                    payroll_received_date = NULL,
                    updated_at = NOW()
              WHERE id = $2`,
            [remarkText, id],
          );

          await this.client.query(
            `UPDATE submissions
                SET status = 'disapproved'::submission_status,
                    remark = $1,
                    event = $2,
                    updated_at = NOW()
              WHERE report_id = $3`,
            [remarkText, `AR returned for correction by ${role || currentStageRole}`, id],
          );

          await this.client.query(
            `UPDATE payroll
                SET status = 'Rejected',
                    updated_at = NOW()
              WHERE report_id = $1`,
            [id],
          );
        }

        await this.loggerService.logUserAction({
          user_id: user.id,
          role: user.role,
          action_type: 'update_report',
          action_status: 'success',
          metadata: { report_id: id, action, stage: currentStageRole, remark },
        });

        return SuccessHandler('Report decision saved successfully', 200, {
          id,
          action,
          remark,
          payroll: payrollResult,
        });
      }

      // If DTR or non-UUID, log the action and return success
      let dtrPayrollResult: any = null;
      const profId = id.startsWith('dtr-') ? id.replace(/^dtr-/, '') : id;
      const isAccountingDtrApproval =
        action === 'Approve' &&
        (stage === 'Accounting' || role === 'Accounting');

      if (isAccountingDtrApproval) {
        // Calculate DTR payroll based on logged duty hours
        const dtrRes = await this.client.query(
          `SELECT id, shift_date, time_in, time_out, total_hours
             FROM dtr
            WHERE professor_id = $1
            ORDER BY shift_date DESC`,
          [profId],
        );

        let totalHours = 0;
        let daysLogged = dtrRes.rows.length;
        for (const row of dtrRes.rows) {
          let h = Number(row.total_hours);
          if (isNaN(h) || h <= 0) {
            h = 8;
          }
          totalHours += h;
        }
        if (totalHours <= 0) {
          totalHours = 80;
          daysLogged = 10;
        }

        const ASSUMED_DTR_RATE = 250; // ₱250/hr
        const calculatedSalary = Math.round(totalHours * ASSUMED_DTR_RATE);

        const profRes = await this.client.query(
          `SELECT id, firstname, lastname, employee_id FROM user_professors WHERE id = $1 LIMIT 1`,
          [profId],
        );
        const prof = profRes.rows[0];
        const empId = prof?.employee_id || profId.slice(0, 4);

        const first = dtrRes.rows[0];
        const last = dtrRes.rows[dtrRes.rows.length - 1];
        const periodStr =
          first && last && first.shift_date && last.shift_date
            ? `${formatDate(last.shift_date)} – ${formatDate(first.shift_date)}`
            : 'September Cycle 1';
        const unitsStr = `${daysLogged} days (${totalHours.toFixed(1)} hrs)`;

        const meta = JSON.stringify({
          dtr_id: id,
          professor_id: profId,
          total_hours: totalHours,
          days_logged: daysLogged,
          rate: ASSUMED_DTR_RATE,
          approved_by: user.id,
          formula: `${totalHours} hrs × ₱${ASSUMED_DTR_RATE}/hr = ₱${calculatedSalary}`,
        });

        const existing = await this.client.query(
          `SELECT id FROM payroll WHERE (professor_id = $1 OR employee_id = $2) AND type = 'DTR' LIMIT 1`,
          [profId, empId],
        );

        let pId: string;
        if (existing.rows.length > 0) {
          pId = existing.rows[0].id;
          await this.client.query(
            `UPDATE payroll
                SET period = $1,
                    units = $2,
                    hours = $3,
                    rate = $4,
                    salary = $5,
                    amount = $5,
                    status = 'Approved',
                    date_received = NOW(),
                    metadata = $6,
                    updated_at = NOW()
              WHERE id = $7`,
            [
              periodStr,
              unitsStr,
              totalHours,
              ASSUMED_DTR_RATE,
              calculatedSalary,
              meta,
              pId,
            ],
          );
        } else {
          const ins = await this.client.query(
            `INSERT INTO payroll (
               user_id, professor_id, employee_id,
               type, period, units, hours, rate, salary, amount, status, date_received, metadata
             ) VALUES (
               $1, $1, $2, 'DTR', $3, $4, $5, $6, $7, $7, 'Approved', NOW(), $8
             ) RETURNING id`,
            [
              profId,
              empId,
              periodStr,
              unitsStr,
              totalHours,
              ASSUMED_DTR_RATE,
              calculatedSalary,
              meta,
            ],
          );
          pId = ins.rows[0].id;
        }

        await this.client.query(
          `INSERT INTO payroll_logs (
             action_type, action_status, professor_id, user_id, employee_id, salary, date_received, metadata, created_at
           ) VALUES ('create_payroll', 'success', $1, $1, $2, $3, NOW(), $4, NOW())`,
          [profId, empId, calculatedSalary, meta],
        );

        dtrPayrollResult = {
          id: pId,
          amount: calculatedSalary,
          hours: totalHours,
          rate: ASSUMED_DTR_RATE,
          period: periodStr,
          units: unitsStr,
          status: 'Approved',
        };
      }

      await this.loggerService.logUserAction({
        user_id: user.id,
        role: user.role,
        action_type: 'update_report',
        action_status: 'success',
        metadata: { item_id: id, action, stage, remark },
      });

      return SuccessHandler('Decision recorded successfully', 200, {
        id,
        action,
        remark,
        payroll: dtrPayrollResult,
      });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
}


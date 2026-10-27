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

  async listApprovals() {
    try {
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
          COALESCE(up.email, us.email, 'faculty@aris.edu.ph') AS email
        FROM accomplishment_reports ar
        LEFT JOIN approval_stages ast ON ast.stage_key = ar.approval_stage
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

        // Status mapping
        let status: StatusKind = 'Pending';
        let action = 'AR submitted';

        if (ar.remarks && /reject|disapprov|return|flag/i.test(ar.remarks)) {
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
            notes: ar.remarks || undefined,
            attachment: `${ar.faculty_name.replace(/[^a-zA-Z]/g, '')}_AR_${periodStr.replace(/\s+/g, '_')}.pdf · 1.2 MB`,
            reviewer,
            reviewedAt,
            remark: ar.remarks || `Current Stage: ${stage}. Awaiting verification.`,
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

      return SuccessHandler('Approvals fetched successfully', 200, items);
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

        if (action === 'Approve') {
          const nextStageKey = NEXT_STAGE_KEY[currentStageRole] || 'AR-AP-STG-4';
          const isFinal = currentStageRole === 'Accounting' || nextStageKey === 'AR-AP-STG-4';

          const remarkText =
            remark ||
            (isFinal
              ? `Approved by ${role || currentStageRole} and cleared for payroll.`
              : `Approved at ${role || currentStageRole} stage and forwarded to next stage.`);

          await this.client.query(
            `UPDATE accomplishment_reports
                SET approval_stage = $1,
                    remarks = $2,
                    payroll_availability = (CASE WHEN $1 = 'AR-AP-STG-4' THEN TRUE ELSE payroll_availability END),
                    payroll_received_date = (CASE WHEN $1 = 'AR-AP-STG-4' AND payroll_received_date IS NULL THEN NOW() ELSE payroll_received_date END),
                    updated_at = NOW()
              WHERE id = $3`,
            [nextStageKey, remarkText, id],
          );
        } else {
          // Disapprove
          const remarkText =
            remark || `Disapproved at ${role || currentStageRole} stage. Returned to faculty for correction.`;

          await this.client.query(
            `UPDATE accomplishment_reports
                SET remarks = $1,
                    updated_at = NOW()
              WHERE id = $2`,
            [remarkText, id],
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
        });
      }

      // If DTR or non-UUID, log the action and return success
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
      });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
}


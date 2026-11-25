import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { UserSession } from '../lib/data/interfaces';
import {
  PayrollConfig,
  DEFAULT_PAYROLL_CONFIG,
  computePayrollAmount,
} from '../payroll/payroll-config.interface';
import {
  CreateStageDto,
  ReorderStagesDto,
  UpdateStageDto,
} from './dto/approvals.dto';

export type StageRole = string;
export type StatusKind = 'Pending' | 'Approved' | 'Disapproved' | 'Flagged';

export interface ApprovalStageItem {
  id?: string;
  stage_key: string;
  label: string;
  role_name: string;
  stage_order: number;
  document_type?: 'AR' | 'DTR' | 'ALL';
  color?: string;
  description?: string;
  is_final: boolean;
  is_active?: boolean;
}

export const LEGACY_AR_STAGES: ApprovalStageItem[] = [
  {
    stage_key: 'AR-AP-STG-1',
    label: 'Checker',
    role_name: 'Checker',
    stage_order: 1,
    color: '#3a7d4e',
    description: 'Initial verification of attendance and accomplishment report entries',
    is_final: false,
  },
  {
    stage_key: 'AR-AP-STG-2',
    label: 'Secretary',
    role_name: 'Secretary',
    stage_order: 2,
    color: '#3f8ecc',
    description: 'College/Department secretary review and endorsement',
    is_final: false,
  },
  {
    stage_key: 'AR-AP-STG-3',
    label: 'HR',
    role_name: 'HR',
    stage_order: 3,
    color: '#8a63c4',
    description: 'Human Resources validation and employment policy compliance',
    is_final: false,
  },
  {
    stage_key: 'AR-AP-STG-4',
    label: 'Accounting',
    role_name: 'Accounting',
    stage_order: 4,
    color: '#d99a2b',
    description: 'Final accounting audit and payroll release clearance',
    is_final: true,
  },
];

export const LEGACY_DTR_STAGES: ApprovalStageItem[] = [
  {
    stage_key: 'DTR-AP-STG-1',
    label: 'Checker',
    role_name: 'Checker',
    stage_order: 1,
    color: '#3a7d4e',
    description: 'Verification of raw attendance and duty hours',
    is_final: false,
  },
  {
    stage_key: 'DTR-AP-STG-2',
    label: 'Secretary',
    role_name: 'Secretary',
    stage_order: 2,
    color: '#3f8ecc',
    description: 'Department secretary endorsement of logged shifts',
    is_final: false,
  },
  {
    stage_key: 'DTR-AP-STG-3',
    label: 'HR',
    role_name: 'HR',
    stage_order: 3,
    color: '#8a63c4',
    description: 'HR verification of biometric logs and duty records',
    is_final: false,
  },
  {
    stage_key: 'DTR-AP-STG-4',
    label: 'Accounting',
    role_name: 'Accounting',
    stage_order: 4,
    color: '#d99a2b',
    description: 'Final DTR payroll verification and release',
    is_final: true,
  },
];

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
  stage: string;
  stageRole: string;
  stageColor: string;
  stageOrder: number;
  currentStageIndex: number;
  isPastFlow: boolean;
  stages: ApprovalStageItem[];
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

export function matchesStaffPosition(
  userPosition: string | null | undefined,
  stageRole: string | null | undefined,
  stageLabel: string | null | undefined,
): boolean {
  if (!userPosition) return false;
  const pos = userPosition.trim().toLowerCase();
  const r = (stageRole || '').trim().toLowerCase();
  const l = (stageLabel || '').trim().toLowerCase();

  // Canonical standard role checks
  if (pos.includes('check') && (r.includes('check') || l.includes('check'))) return true;
  if (pos.includes('sec') && (r.includes('sec') || l.includes('sec'))) return true;
  if ((pos.includes('hr') || pos.includes('human')) && (r.includes('hr') || l.includes('hr') || r.includes('human') || l.includes('human'))) return true;
  if ((pos.includes('account') || pos.includes('payroll')) && (r.includes('account') || l.includes('account') || r.includes('payroll') || l.includes('payroll'))) return true;

  // General flexible match
  if (r && (pos.includes(r) || r.includes(pos))) return true;
  if (l && (pos.includes(l) || l.includes(pos))) return true;

  return false;
}

export function resolveItemStages(
  snapshot: any,
  type: 'AR' | 'DTR',
): { stages: ApprovalStageItem[]; isPastFlow: boolean } {
  if (snapshot) {
    try {
      const parsed = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return {
          stages: parsed.map((s, idx) => ({
            id: s.id,
            stage_key: s.stage_key || `${type}-AP-STG-${idx + 1}`,
            label: s.label || s.role_name || `Stage ${idx + 1}`,
            role_name: s.role_name || s.label || 'Checker',
            stage_order: Number(s.stage_order) || idx + 1,
            document_type: s.document_type || type,
            color: s.color || '#3a7d4e',
            description: s.description || '',
            is_final: Boolean(s.is_final ?? idx === parsed.length - 1),
            is_active: Boolean(s.is_active ?? true),
          })),
          isPastFlow: false,
        };
      }
    } catch {
      // ignore
    }
  }

  // Fallback to legacy canonical flow for past applications
  return {
    stages: type === 'AR' ? [...LEGACY_AR_STAGES] : [...LEGACY_DTR_STAGES],
    isPastFlow: true,
  };
}

@Injectable()
export class ApprovalsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly loggerService: LoggerService,
  ) {}

  private get client() {
    return this.databaseService.getClient();
  }

  private async getPayrollConfig(): Promise<PayrollConfig> {
    try {
      const res = await this.client.query<{ setting_value: string }>(
        `SELECT setting_value FROM system_settings WHERE setting_key = 'payroll_computation_config' LIMIT 1`,
      );
      if (res.rows.length > 0 && res.rows[0].setting_value) {
        return {
          ...DEFAULT_PAYROLL_CONFIG,
          ...JSON.parse(res.rows[0].setting_value),
        };
      }
    } catch {
      // ignore, use default
    }
    return { ...DEFAULT_PAYROLL_CONFIG };
  }

  // ==========================================
  // STAGES CRUD (Admin Managed)
  // ==========================================

  async getStages(documentType?: string) {
    try {
      const query = `
        SELECT
          id,
          stage_key,
          label,
          role_name,
          stage_order,
          document_type,
          color,
          description,
          is_final,
          is_active,
          created_at,
          updated_at
        FROM approval_stages
        WHERE ($1::text IS NULL OR document_type = $1 OR document_type = 'ALL')
        ORDER BY document_type ASC, stage_order ASC
      `;
      const res = await this.client.query(query, [documentType || null]);
      return SuccessHandler('Approval stages fetched successfully', 200, res.rows);
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async createStage(user: UserSession, dto: CreateStageDto) {
    try {
      if (user.role !== 'admin') {
        return ErrorHandler('Unauthorized. Admin access required.', 403);
      }

      const docType = dto.document_type || 'AR';
      const orderRes = await this.client.query(
        `SELECT COALESCE(MAX(stage_order), 0) + 1 AS next_order
           FROM approval_stages
          WHERE document_type = $1`,
        [docType],
      );
      const stageOrder = dto.stage_order || Number(orderRes.rows[0]?.next_order) || 1;
      const stageKey = `${docType}-AP-STG-${Date.now().toString(36).toUpperCase()}`;

      // If marking as final, unmark other final stages for this document type
      if (dto.is_final) {
        await this.client.query(
          `UPDATE approval_stages
              SET is_final = FALSE
            WHERE document_type = $1`,
          [docType],
        );
      }

      const insertRes = await this.client.query(
        `INSERT INTO approval_stages (
           stage_key, label, role_name, stage_order, document_type,
           color, description, is_final, is_active, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         RETURNING *`,
        [
          stageKey,
          dto.label.trim(),
          (dto.role_name || dto.label).trim(),
          stageOrder,
          docType,
          dto.color || '#3a7d4e',
          dto.description || '',
          Boolean(dto.is_final),
          dto.is_active !== undefined ? Boolean(dto.is_active) : true,
        ],
      );

      await this.loggerService.logUserAction({
        user_id: user.id,
        role: user.role,
        action_type: 'create_stage',
        action_status: 'success',
        metadata: { stage: insertRes.rows[0] },
      });

      return SuccessHandler('Approval stage created successfully', 201, insertRes.rows[0]);
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async updateStage(user: UserSession, id: string, dto: UpdateStageDto) {
    try {
      if (user.role !== 'admin') {
        return ErrorHandler('Unauthorized. Admin access required.', 403);
      }

      const existingRes = await this.client.query(
        `SELECT * FROM approval_stages WHERE id = $1 LIMIT 1`,
        [id],
      );
      if (existingRes.rows.length === 0) {
        return ErrorHandler('Approval stage not found', 404);
      }
      const existing = existingRes.rows[0];
      const docType = dto.document_type || existing.document_type;

      if (dto.is_final) {
        await this.client.query(
          `UPDATE approval_stages
              SET is_final = FALSE
            WHERE document_type = $1 AND id != $2`,
          [docType, id],
        );
      }

      const updateRes = await this.client.query(
        `UPDATE approval_stages
            SET label = COALESCE($1, label),
                role_name = COALESCE($2, role_name),
                stage_order = COALESCE($3, stage_order),
                document_type = COALESCE($4, document_type),
                color = COALESCE($5, color),
                description = COALESCE($6, description),
                is_final = COALESCE($7, is_final),
                is_active = COALESCE($8, is_active),
                updated_at = NOW()
          WHERE id = $9
          RETURNING *`,
        [
          dto.label ? dto.label.trim() : null,
          dto.role_name ? dto.role_name.trim() : null,
          dto.stage_order !== undefined ? dto.stage_order : null,
          dto.document_type || null,
          dto.color || null,
          dto.description !== undefined ? dto.description : null,
          dto.is_final !== undefined ? dto.is_final : null,
          dto.is_active !== undefined ? dto.is_active : null,
          id,
        ],
      );

      await this.loggerService.logUserAction({
        user_id: user.id,
        role: user.role,
        action_type: 'update_stage',
        action_status: 'success',
        metadata: { stage: updateRes.rows[0] },
      });

      return SuccessHandler('Approval stage updated successfully', 200, updateRes.rows[0]);
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async deleteStage(user: UserSession, id: string) {
    try {
      if (user.role !== 'admin') {
        return ErrorHandler('Unauthorized. Admin access required.', 403);
      }

      const existingRes = await this.client.query(
        `SELECT * FROM approval_stages WHERE id = $1 LIMIT 1`,
        [id],
      );
      if (existingRes.rows.length === 0) {
        return ErrorHandler('Approval stage not found', 404);
      }
      const stage = existingRes.rows[0];

      // Soft delete: marks is_active = FALSE so existing paper flow applications referencing this stage are never corrupted
      await this.client.query(
        `UPDATE approval_stages
            SET is_active = FALSE,
                updated_at = NOW()
          WHERE id = $1`,
        [id],
      );

      await this.loggerService.logUserAction({
        user_id: user.id,
        role: user.role,
        action_type: 'delete_stage',
        action_status: 'success',
        metadata: { stage_id: id, stage_key: stage.stage_key },
      });

      return SuccessHandler(
        'Approval stage deactivated successfully. Past paper flow applications referencing it remain safe.',
        200,
        { id, deactivated: true },
      );
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async reorderStages(user: UserSession, dto: ReorderStagesDto) {
    try {
      if (user.role !== 'admin') {
        return ErrorHandler('Unauthorized. Admin access required.', 403);
      }

      for (const item of dto.stages) {
        await this.client.query(
          `UPDATE approval_stages
              SET stage_order = $1,
                  updated_at = NOW()
            WHERE id = $2`,
          [item.stage_order, item.id],
        );
      }

      const res = await this.client.query(`
        SELECT * FROM approval_stages ORDER BY document_type ASC, stage_order ASC
      `);

      return SuccessHandler('Approval stages reordered successfully', 200, res.rows);
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async resetStages(user: UserSession) {
    try {
      if (user.role !== 'admin') {
        return ErrorHandler('Unauthorized. Admin access required.', 403);
      }

      // Restore canonical 4-stage pipelines
      await this.client.query(`
        UPDATE approval_stages
           SET is_active = FALSE
         WHERE stage_key NOT IN ('AR-AP-STG-1', 'AR-AP-STG-2', 'AR-AP-STG-3', 'AR-AP-STG-4',
                                 'DTR-AP-STG-1', 'DTR-AP-STG-2', 'DTR-AP-STG-3', 'DTR-AP-STG-4');

        UPDATE approval_stages
           SET is_active = TRUE,
               stage_order = CASE stage_key
                 WHEN 'AR-AP-STG-1' THEN 1
                 WHEN 'AR-AP-STG-2' THEN 2
                 WHEN 'AR-AP-STG-3' THEN 3
                 WHEN 'AR-AP-STG-4' THEN 4
                 WHEN 'DTR-AP-STG-1' THEN 1
                 WHEN 'DTR-AP-STG-2' THEN 2
                 WHEN 'DTR-AP-STG-3' THEN 3
                 WHEN 'DTR-AP-STG-4' THEN 4
                 ELSE stage_order
               END;
      `);

      const res = await this.client.query(`
        SELECT * FROM approval_stages WHERE is_active = TRUE ORDER BY document_type ASC, stage_order ASC
      `);

      return SuccessHandler('Approval stages reset to default canonical pipeline', 200, res.rows);
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  // ==========================================
  // LIST APPROVALS (Scoped with Dynamic Stages)
  // ==========================================

  async listApprovals(user?: UserSession) {
    try {
      let staffPosition = user?.position || null;
      if (user?.role === 'staff' && !staffPosition && user.id) {
        const staffRes = await this.client.query(
          'SELECT position FROM user_staffs WHERE id = $1 LIMIT 1',
          [user.id],
        );
        staffPosition = staffRes.rows[0]?.position || null;
      }

      // 1. Fetch accomplishment reports joined with faculty data
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
          COALESCE(ast.color, '#3a7d4e') AS stage_color,
          COALESCE(ast.role_name, ast.label, 'Checker') AS stage_role,
          ar.remarks,
          ar.payroll_availability,
          ar.payroll_received,
          ar.payroll_received_date,
          ar.created_at,
          ar.updated_at,
          COALESCE(NULLIF(TRIM(up.firstname || ' ' || up.lastname), ''), NULLIF(TRIM(us.firstname || ' ' || us.lastname), ''), 'Faculty ' || COALESCE(ar.faculty_no, ar.employee_id, '')) AS faculty_name,
          COALESCE(up.department, us.department, '') AS department,
          COALESCE(up.position, us.position, '') AS faculty_rank,
          COALESCE(up.email, us.email, '') AS email,
          ar.submission_status,
          ar.submission_event,
          ar.submission_topics,
          ar.submission_notes,
          ar.submission_payload,
          ar.workflow_snapshot,
          ar.current_stage AS submission_stage,
          COALESCE(NULLIF(TRIM(rev_staff.firstname || ' ' || rev_staff.lastname), ''), NULLIF(TRIM(rev_prof.firstname || ' ' || rev_prof.lastname), ''), ast.label) AS reviewer_name
        FROM accomplishment_reports ar
        LEFT JOIN approval_stages ast ON ast.stage_key = ar.approval_stage
        LEFT JOIN user_professors up ON up.id = ar.user_id OR up.employee_id = ar.employee_id
        LEFT JOIN user_staffs us ON us.id = ar.user_id OR us.employee_id = ar.employee_id
        LEFT JOIN user_staffs rev_staff ON rev_staff.id = ar.reviewed_by
        LEFT JOIN user_professors rev_prof ON rev_prof.id = ar.reviewed_by
        ORDER BY ar.updated_at DESC, ar.created_at DESC
      `);

      // 2. Fetch report entries
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

      // 3. Fetch submitted DTR documents and linked attendance entries
      const dtrRes = await this.client.query(`
        SELECT
          ds.id AS submission_id,
          ds.period_start,
          ds.period_end,
          ds.approval_stage,
          COALESCE(ast.label, ds.approval_stage) AS stage_label,
          COALESCE(ast.stage_order, 1) AS stage_order,
          COALESCE(ast.color, '#3a7d4e') AS stage_color,
          COALESCE(ast.role_name, ast.label, 'Checker') AS stage_role,
          ds.status AS submission_status,
          ds.remarks,
          ds.attachment_name,
          ds.workflow_snapshot,
          ds.current_stage AS dtr_current_stage,
          ds.submitted_at,
          ds.updated_at AS submission_updated_at,
          d.id,
          d.professor_id,
          d.shift_date,
          d.time_in,
          d.time_out,
          d.total_hours,
          d.created_at,
          COALESCE(NULLIF(TRIM(up.firstname || ' ' || up.lastname), ''), 'Faculty') AS professor_name,
          COALESCE(up.department, '') AS department,
          COALESCE(up.email, '') AS email,
          up.employee_id
        FROM dtr_submissions ds
        JOIN dtr_submission_entries dse ON dse.submission_id = ds.id
        JOIN dtr d ON d.id = dse.dtr_id
        LEFT JOIN approval_stages ast ON ast.stage_key = ds.approval_stage
        LEFT JOIN user_professors up ON up.id = d.professor_id
        ORDER BY ds.updated_at DESC, d.shift_date DESC, d.time_in DESC
      `);

      const items: ApprovalItem[] = [];

      // Process Accomplishment Reports
      for (const ar of arRes.rows) {
        const entries = entriesByReport.get(ar.id) || [];
        const entryCount = entries.length;

        let tables: ApprovalRecordTable[] = [];
        let payload: any = null;
        if (ar.submission_payload) {
          try {
            payload =
              typeof ar.submission_payload === 'string'
                ? JSON.parse(ar.submission_payload)
                : ar.submission_payload;
            if (Array.isArray(payload?.tables) && payload.tables.length > 0) {
              tables = payload.tables;
            }
          } catch {
            /* empty */
          }
        }

        if (tables.length === 0) {
          const courseGroups = new Map<string, any[]>();
          entries.forEach((e) => {
            const key = `${e.course || e.code || 'Course'}`.trim();
            if (!courseGroups.has(key)) courseGroups.set(key, []);
            courseGroups.get(key)!.push(e);
          });

          courseGroups.forEach((groupEntries, key) => {
            const startDate = groupEntries[0]?.class_date
              ? formatDate(groupEntries[0].class_date)
              : '';
            const endDate = groupEntries[groupEntries.length - 1]?.class_date
              ? formatDate(groupEntries[groupEntries.length - 1].class_date)
              : '';
            const meta =
              startDate && endDate
                ? `${startDate} – ${endDate}`
                : `${groupEntries.length} sessions`;

            const rows = groupEntries.map((e) => {
              const progYearSec =
                [
                  e.program,
                  e.year && e.section
                    ? `${e.year}${e.section}`
                    : e.section || (e.year ? String(e.year) : ''),
                ]
                  .filter(Boolean)
                  .join(' ') || '—';

              const startTime = e.shift_start
                ? String(e.shift_start).slice(0, 5)
                : '';
              const endTime = e.shift_end
                ? String(e.shift_end).slice(0, 5)
                : '';
              const timeDisplay =
                startTime && endTime
                  ? `${startTime}–${endTime}`
                  : startTime || endTime || '—';

              return [
                e.code || '—',
                progYearSec,
                e.units !== null && e.units !== undefined ? e.units : '—',
                e.day || '—',
                timeDisplay,
                e.campus ? String(e.campus).toUpperCase() : '—',
              ];
            });

            tables.push({
              title: key,
              meta,
              columns: AR_COLUMNS,
              rows,
            });
          });
        }

        const topics =
          Array.from(
            new Set(entries.map((e) => e.topics).filter(Boolean)),
          ).join('\n') ||
          ar.submission_topics ||
          payload?.topics ||
          '';
        const tasks =
          Array.from(
            new Set(entries.map((e) => e.description).filter(Boolean)),
          ).join('\n') ||
          payload?.tasks ||
          '';

        const periodStr = `${formatDate(ar.period_start)} – ${formatDate(ar.period_end)}`;
        const refStr = `AR-${ar.faculty_no || '000'}-${ar.id.slice(0, 8).toUpperCase()}`;

        // Dynamic workflow stage resolution (preserving past flow applications)
        const { stages, isPastFlow } = resolveItemStages(ar.workflow_snapshot, 'AR');
        let currentStageIndex = stages.findIndex(
          (s) => s.stage_key === ar.approval_stage,
        );
        if (currentStageIndex === -1 && ar.submission_stage) {
          currentStageIndex = stages.findIndex(
            (s) => s.label.toLowerCase() === ar.submission_stage.toLowerCase(),
          );
        }
        if (currentStageIndex === -1) {
          currentStageIndex = 0;
        }

        const currentStageObj = stages[currentStageIndex] || stages[0];
        const stageLabel = currentStageObj?.label || ar.stage_label || 'Checker';
        const stageRole = currentStageObj?.role_name || currentStageObj?.label || 'Checker';
        const stageColor = currentStageObj?.color || ar.stage_color || '#3a7d4e';
        const stageOrder = currentStageObj?.stage_order || currentStageIndex + 1;
        const isFinalStage = Boolean(currentStageObj?.is_final || currentStageIndex === stages.length - 1);

        const isDisapproved =
          ar.submission_status === 'disapproved' ||
          ar.submission_status === 'rejected' ||
          (ar.submission_status !== 'approved' &&
            ar.remarks &&
            /reject|disapprov/i.test(ar.remarks) &&
            !/resubmit/i.test(ar.remarks));

        const isResubmitted =
          !isDisapproved &&
          ar.submission_status === 'pending' &&
          (Boolean(
            ar.submission_event && /resubmit/i.test(ar.submission_event),
          ) ||
            Boolean(ar.remarks && /resubmit/i.test(ar.remarks)));

        let status: StatusKind = 'Pending';
        let action = `AR submitted · ${stageLabel}`;

        if (isDisapproved) {
          status = 'Disapproved';
          action = 'AR returned for correction';
        } else if (isResubmitted) {
          status = 'Pending';
          action = 'AR resubmitted with corrections · Pending review';
        } else if (ar.submission_status === 'approved' || (isFinalStage && (ar.payroll_availability || ar.payroll_received))) {
          status = 'Approved';
          action = ar.payroll_received
            ? 'AR approved · Payroll received'
            : ar.payroll_availability
              ? 'AR approved · Payroll released'
              : `AR in ${stageLabel} validation`;
        } else {
          action = ar.submission_event || `AR pending review at ${stageLabel}`;
        }

        const reviewer =
          ar.reviewer_name || (stageLabel ? `${stageLabel} Reviewer` : 'Reviewer');

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
          stage: stageLabel,
          stageRole,
          stageColor,
          stageOrder,
          currentStageIndex,
          isPastFlow,
          stages,
          status,
          event: `${action} · ${entryCount} outputs`,
          record: {
            period: periodStr,
            reference: refStr,
            facultyName: ar.faculty_name,
            facultyNumber: ar.faculty_no || '—',
            college: ar.department || '—',
            tables,
            topics: topics || '—',
            tasks: tasks || '—',
            notes: isDisapproved
              ? ar.remarks || 'Returned to faculty for correction.'
              : isResubmitted
                ? ar.remarks &&
                  !/disapprov|reject|returned to the faculty/i.test(ar.remarks)
                  ? ar.remarks
                  : 'Resubmitted with corrections. Pending review.'
                : ar.remarks || undefined,
            attachment: payload?.attachment || ar.attachment_name || undefined,
            reviewer,
            reviewedAt,
            remark: isDisapproved
              ? ar.remarks || `Disapproved at ${stageLabel} stage.`
              : isResubmitted
                ? 'Resubmitted with corrections. Pending review.'
                : ar.remarks ||
                  `Current Stage: ${stageLabel}. Awaiting verification.`,
          },
        });
      }

      // Process DTR submission documents
      const dtrBySubmission = new Map<string, any[]>();
      dtrRes.rows.forEach((row) => {
        const key = row.submission_id;
        const list = dtrBySubmission.get(key) || [];
        list.push(row);
        dtrBySubmission.set(key, list);
      });

      dtrBySubmission.forEach((logs, submissionId) => {
        if (!logs.length) return;
        const first = logs[0];
        const daysLogged = logs.length;
        const totalHours = logs
          .reduce((acc, r) => acc + (Number(r.total_hours) || 0), 0)
          .toFixed(1);

        const startDate = formatDate(first.period_start);
        const endDate = formatDate(first.period_end);
        const periodStr = `${startDate} – ${endDate}`;

        const rows = logs
          .slice(0, 15)
          .map((l) => [
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

        // Dynamic workflow stage resolution (preserving past flow applications)
        const { stages, isPastFlow } = resolveItemStages(first.workflow_snapshot, 'DTR');
        let currentStageIndex = stages.findIndex(
          (s) => s.stage_key === first.approval_stage,
        );
        if (currentStageIndex === -1 && first.dtr_current_stage) {
          currentStageIndex = stages.findIndex(
            (s) => s.label.toLowerCase() === first.dtr_current_stage.toLowerCase(),
          );
        }
        if (currentStageIndex === -1) {
          currentStageIndex = 0;
        }

        const currentStageObj = stages[currentStageIndex] || stages[0];
        const stageLabel = currentStageObj?.label || first.stage_label || 'Checker';
        const stageRole = currentStageObj?.role_name || currentStageObj?.label || 'Checker';
        const stageColor = currentStageObj?.color || first.stage_color || '#3a7d4e';
        const stageOrder = currentStageObj?.stage_order || currentStageIndex + 1;
        const isFinalStage = Boolean(currentStageObj?.is_final || currentStageIndex === stages.length - 1);

        let status: StatusKind = 'Pending';
        let action = `DTR submitted · ${stageLabel}`;

        const isDtrDisapproved =
          first.submission_status === 'disapproved' ||
          first.submission_status === 'rejected' ||
          (first.remarks &&
            /reject|disapprov/i.test(first.remarks) &&
            !/resubmit/i.test(first.remarks));

        if (isDtrDisapproved) {
          status = 'Disapproved';
          action = 'DTR returned for correction';
        } else if (first.submission_status === 'approved' || (isFinalStage && first.submission_status !== 'pending')) {
          status = 'Approved';
        }

        const submitted = `${formatDate(first.submitted_at)} · ${formatTime(first.submitted_at)}`;
        const reference = `DTR-${first.employee_id || 'P000'}-${submissionId
          .slice(0, 8)
          .toUpperCase()}`;

        items.push({
          id: submissionId,
          faculty: first.professor_name || 'Faculty Member',
          facultyNumber: first.employee_id || first.professor_id.slice(0, 4),
          type: 'DTR',
          period: periodStr,
          reference,
          submitted,
          stage: stageLabel,
          stageRole,
          stageColor,
          stageOrder,
          currentStageIndex,
          isPastFlow,
          stages,
          status,
          event: `${action} · ${daysLogged} days`,
          record: {
            period: periodStr,
            reference,
            facultyName: first.professor_name || 'Faculty Member',
            facultyNumber: first.employee_id || '—',
            college: first.department || '—',
            tables,
            notes: `Total duty hours rendered: ${totalHours} hrs across ${daysLogged} working days.`,
            attachment: first.attachment_name || undefined,
            reviewer: stageLabel,
            reviewedAt: `${formatDate(first.submitted_at)} · ${formatTime(first.submitted_at)}`,
            remark:
              first.remarks ||
              `Current Stage: ${stageLabel}. Awaiting verification.`,
          },
        });
      });

      // Filter by user role/position if staff
      let scopedItems = items;
      if (user?.role === 'staff' && staffPosition) {
        scopedItems = items.filter((it) =>
          matchesStaffPosition(staffPosition, it.stageRole, it.stage),
        );
      }

      return SuccessHandler('Approvals fetched successfully', 200, scopedItems);
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  // ==========================================
  // DECISION HANDLER (Dynamic & Past-Preserving)
  // ==========================================

  async handleDecision(user: UserSession, payload: any) {
    try {
      if (Array.isArray(payload)) {
        return SuccessHandler('Queue updated successfully', 200, {
          updated: payload.length,
        });
      }

      const { id, action, remark } = payload;
      if (!id) {
        return ErrorHandler('Missing approval item ID', 400);
      }

      let staffPosition = user.position || null;
      if (user.role === 'staff' && !staffPosition && user.id) {
        const staffRes = await this.client.query(
          'SELECT position FROM user_staffs WHERE id = $1 LIMIT 1',
          [user.id],
        );
        staffPosition = staffRes.rows[0]?.position || null;
      }

      // Check if item is DTR Submission
      const dtrSubmission = await this.client.query(
        `SELECT id, approval_stage, status, workflow_snapshot, current_stage
           FROM dtr_submissions
          WHERE id = $1
          LIMIT 1`,
        [id],
      );

      if (dtrSubmission.rows.length > 0) {
        const dtr = dtrSubmission.rows[0];
        const { stages } = resolveItemStages(dtr.workflow_snapshot, 'DTR');

        let currentIdx = stages.findIndex((s) => s.stage_key === dtr.approval_stage);
        if (currentIdx === -1 && dtr.current_stage) {
          currentIdx = stages.findIndex(
            (s) => s.label.toLowerCase() === dtr.current_stage.toLowerCase(),
          );
        }
        if (currentIdx === -1) currentIdx = 0;

        const currentStage = stages[currentIdx];

        // Permission check for staff
        if (
          user.role === 'staff' &&
          !matchesStaffPosition(staffPosition, currentStage?.role_name, currentStage?.label)
        ) {
          return ErrorHandler(
            `You do not have permission to act on this DTR at the ${currentStage?.label || 'current'} stage`,
            403,
          );
        }

        const isDisapproved = action === 'Disapprove';
        const isFinalStage = Boolean(currentStage?.is_final || currentIdx >= stages.length - 1);
        const nextStage = !isFinalStage && !isDisapproved ? stages[currentIdx + 1] : null;

        const nextStatus = isDisapproved ? 'disapproved' : isFinalStage ? 'approved' : 'pending';
        const nextStageKey = isDisapproved
          ? dtr.approval_stage
          : nextStage
            ? nextStage.stage_key
            : dtr.approval_stage;
        const nextStageLabel = isDisapproved
          ? currentStage?.label
          : nextStage
            ? nextStage.label
            : currentStage?.label;

        const defaultRemark = isDisapproved
          ? `DTR returned for correction by ${currentStage?.label}.`
          : nextStage
            ? `Approved at ${currentStage?.label} stage and forwarded to ${nextStage.label}.`
            : `Approved at final stage (${currentStage?.label}) and cleared for payroll.`;

        const remarkText = remark || defaultRemark;

        await this.client.query(
          `UPDATE dtr_submissions
              SET approval_stage = $1,
                  current_stage = $2,
                  status = $3,
                  remarks = $4,
                  updated_at = NOW()
            WHERE id = $5`,
          [nextStageKey, nextStageLabel, nextStatus, remarkText, id],
        );

        let dtrPayrollResult: any = null;
        if (!isDisapproved && isFinalStage) {
          // Final DTR Clearance triggers payroll calculation
          const dtrLogsRes = await this.client.query(
            `SELECT d.id, d.shift_date, d.time_in, d.time_out, d.total_hours, ds.professor_id
               FROM dtr_submissions ds
               JOIN dtr_submission_entries dse ON dse.submission_id = ds.id
               JOIN dtr d ON d.id = dse.dtr_id
              WHERE ds.id = $1
              ORDER BY d.shift_date DESC`,
            [id],
          );

          if (dtrLogsRes.rows.length > 0) {
            const profId = dtrLogsRes.rows[0].professor_id;
            let totalHours = 0;
            const daysLogged = dtrLogsRes.rows.length;
            for (const row of dtrLogsRes.rows) {
              let h = Number(row.total_hours);
              if (isNaN(h) || h <= 0) h = 8;
              totalHours += h;
            }
            if (totalHours <= 0) totalHours = 80;

            const payrollConfig = await this.getPayrollConfig();
            const calc = computePayrollAmount('DTR', totalHours, null, payrollConfig);
            const dtrRate = calc.rate;
            const calculatedSalary = calc.netAmount;

            const profRes = await this.client.query(
              `SELECT id, firstname, lastname, employee_id FROM user_professors WHERE id = $1 LIMIT 1`,
              [profId],
            );
            const prof = profRes.rows[0];
            const empId = prof?.employee_id || profId.slice(0, 4);

            const firstLog = dtrLogsRes.rows[0];
            const lastLog = dtrLogsRes.rows[dtrLogsRes.rows.length - 1];
            const periodStr =
              firstLog && lastLog && firstLog.shift_date && lastLog.shift_date
                ? `${formatDate(lastLog.shift_date)} – ${formatDate(firstLog.shift_date)}`
                : `${formatDate(new Date())}`;
            const unitsStr = `${daysLogged} days (${totalHours.toFixed(1)} hrs)`;

            const meta = JSON.stringify({
              submission_id: id,
              professor_id: profId,
              total_hours: totalHours,
              days_logged: daysLogged,
              rate: dtrRate,
              regular_pay: calc.regularPay,
              overload_pay: calc.overloadPay,
              allowance: calc.allowance,
              tax_amount: calc.taxAmount,
              approved_by: user.id,
              approver_role: currentStage?.role_name || currentStage?.label,
              formula: calc.formula,
            });

            const ins = await this.client.query(
              `INSERT INTO payroll (
                 user_id, professor_id, employee_id,
                 type, period, units, hours, rate, salary, amount, status, date_received, metadata
               ) VALUES (
                 $1, $1, $2, 'DTR', $3, $4, $5, $6, $7, $7, 'Approved', NOW(), $8
               ) RETURNING id`,
              [profId, empId, periodStr, unitsStr, totalHours, dtrRate, calculatedSalary, meta],
            );

            await this.client.query(
              `INSERT INTO payroll_logs (
                 action_type, action_status, professor_id, user_id, employee_id, salary, date_received, metadata, created_at
               ) VALUES ('create_payroll', 'success', $1, $1, $2, $3, NOW(), $4, NOW())`,
              [profId, empId, calculatedSalary, meta],
            );

            dtrPayrollResult = {
              id: ins.rows[0]?.id,
              amount: calculatedSalary,
              hours: totalHours,
              rate: dtrRate,
              period: periodStr,
              units: unitsStr,
              status: 'Approved',
            };
          }
        }

        await this.loggerService.logUserAction({
          user_id: user.id,
          role: user.role,
          action_type: 'update_dtr_submission',
          action_status: 'success',
          metadata: { id, action, stage: currentStage?.label, remark: remarkText },
        });

        return SuccessHandler('DTR decision saved successfully', 200, {
          id,
          action,
          remark: remarkText,
          stage: nextStageLabel,
          status: nextStatus,
          payroll: dtrPayrollResult,
        });
      }

      // Check if it's an Accomplishment Report
      const arCheck = await this.client.query(
        `SELECT id, approval_stage, current_stage, workflow_snapshot, remarks
           FROM accomplishment_reports
          WHERE id = $1 LIMIT 1`,
        [id],
      );

      if (arCheck.rows.length === 0) {
        return ErrorHandler('Report not found', 404);
      }

      const ar = arCheck.rows[0];
      const { stages } = resolveItemStages(ar.workflow_snapshot, 'AR');

      let currentIdx = stages.findIndex((s) => s.stage_key === ar.approval_stage);
      if (currentIdx === -1 && ar.current_stage) {
        currentIdx = stages.findIndex(
          (s) => s.label.toLowerCase() === ar.current_stage.toLowerCase(),
        );
      }
      if (currentIdx === -1) currentIdx = 0;

      const currentStage = stages[currentIdx];

      // Permission check for staff
      if (
        user.role === 'staff' &&
        !matchesStaffPosition(staffPosition, currentStage?.role_name, currentStage?.label)
      ) {
        return ErrorHandler(
          `You do not have permission to act on this report at the ${currentStage?.label || 'current'} stage`,
          403,
        );
      }

      const isDisapproved = action === 'Disapprove';
      const isFinalStage = Boolean(currentStage?.is_final || currentIdx >= stages.length - 1);
      const nextStage = !isFinalStage && !isDisapproved ? stages[currentIdx + 1] : null;

      let payrollResult: any = null;

      if (!isDisapproved) {
        const nextStageKey = nextStage ? nextStage.stage_key : currentStage?.stage_key || ar.approval_stage;
        const nextStageLabel = nextStage ? nextStage.label : currentStage?.label || 'Approved';
        const remarkText =
          remark ||
          (isFinalStage
            ? `Approved by ${currentStage?.label} and cleared for payroll.`
            : `Approved at ${currentStage?.label} stage and forwarded to ${nextStage?.label}.`);

        await this.client.query(
          `UPDATE accomplishment_reports
              SET approval_stage = $1,
                  remarks = $2,
                  submission_status = (CASE WHEN $3::boolean = TRUE THEN 'approved' ELSE 'pending' END),
                  current_stage = $4,
                  current_since = NOW(),
                  reviewed_by = $5,
                  reviewed_at = NOW(),
                  submission_notes = $2,
                  submission_event = $6,
                  payroll_availability = (CASE WHEN $3::boolean = TRUE THEN TRUE ELSE payroll_availability END),
                  payroll_received_date = (CASE WHEN $3::boolean = TRUE AND payroll_received_date IS NULL THEN NOW() ELSE payroll_received_date END),
                  updated_at = NOW()
            WHERE id = $7`,
          [
            nextStageKey,
            remarkText,
            isFinalStage,
            nextStageLabel,
            user.id,
            isFinalStage
              ? `AR approved by ${currentStage?.label} · Cleared for payroll`
              : `AR approved by ${currentStage?.label} · Forwarded to ${nextStage?.label}`,
            id,
          ],
        );

        if (isFinalStage) {
          const payrollConfig = await this.getPayrollConfig();

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
               COALESCE(up.employee_id, ar.employee_id, ar.faculty_no) AS emp_id,
               up.position AS faculty_position
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
                const diff = eh * 60 + (em || 0) - (sh * 60 + (sm || 0));
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
            totalHours = Number(payrollConfig.defaultCycleHours) || 30;
          }

          const calc = computePayrollAmount('AR', totalHours, arInfo.faculty_position, payrollConfig);
          const hourlyRate = calc.rate;
          const calculatedSalary = calc.netAmount;

          const periodStr =
            arInfo.period_start && arInfo.period_end
              ? `${formatDate(arInfo.period_start)} – ${formatDate(arInfo.period_end)}`
              : `${formatDate(new Date())}`;
          const unitsStr = `${totalHours.toFixed(1)} hrs (${entriesRes.rows.length || 1} outputs)`;

          const existingPayroll = await this.client.query(
            `SELECT id FROM payroll WHERE report_id = $1 LIMIT 1`,
            [id],
          );

          let payrollId: string;
          const meta = JSON.stringify({
            report_id: id,
            approved_by: user.id,
            approver_role: currentStage?.role_name || currentStage?.label,
            faculty_rank: arInfo.faculty_position || 'Faculty',
            hourly_rate: hourlyRate,
            total_hours: totalHours,
            regular_pay: calc.regularPay,
            overload_pay: calc.overloadPay,
            allowance: calc.allowance,
            tax_amount: calc.taxAmount,
            formula: calc.formula,
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
                hourlyRate,
                calculatedSalary,
                meta,
                payrollId,
              ],
            );
          } else {
            const ins = await this.client.query(
              `INSERT INTO payroll (
                 user_id, professor_id, employee_id, report_id,
                 type, period, units, hours, rate, salary, amount, status, date_received, metadata
               ) VALUES (
                 $1, $2, $3, $4, 'AR', $5, $6, $7, $8, $9, $9, 'Approved', NOW(), $10
               ) RETURNING id`,
              [
                arInfo.prof_id,
                arInfo.prof_id,
                arInfo.emp_id,
                id,
                periodStr,
                unitsStr,
                totalHours,
                hourlyRate,
                calculatedSalary,
                meta,
              ],
            );
            payrollId = ins.rows[0].id;
          }

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
            rate: hourlyRate,
            period: periodStr,
            units: unitsStr,
            status: 'Approved',
          };
        }
      } else {
        // Disapprove
        const remarkText =
          remark ||
          `Disapproved at ${currentStage?.label} stage. Returned to faculty for correction.`;

        await this.client.query(
          `UPDATE accomplishment_reports
              SET remarks = $1,
                  submission_status = 'disapproved',
                  submission_notes = $1,
                  submission_event = $2,
                  reviewed_by = $3,
                  reviewed_at = NOW(),
                  current_stage = 'Faculty',
                  current_since = NOW(),
                  payroll_availability = FALSE,
                  payroll_received = FALSE,
                  payroll_received_date = NULL,
                  updated_at = NOW()
            WHERE id = $4`,
          [
            remarkText,
            `AR returned for correction by ${currentStage?.label}`,
            user.id,
            id,
          ],
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
        metadata: { report_id: id, action, stage: currentStage?.label, remark },
      });

      return SuccessHandler('Report decision saved successfully', 200, {
        id,
        action,
        remark,
        stage: isDisapproved ? 'Faculty' : nextStage ? nextStage.label : currentStage?.label,
        status: isDisapproved ? 'disapproved' : isFinalStage ? 'approved' : 'pending',
        payroll: payrollResult,
      });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
}

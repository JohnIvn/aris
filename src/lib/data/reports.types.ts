export const REPORT_STATUS = ['draft', 'submitted', 'approved', 'rejected'];
export type ReportStatus = (typeof REPORT_STATUS)[number];
export type ArStatus =
  | 'submitted'
  | 'department_secretary_review'
  | 'hr_review'
  | 'accounting_review'
  | 'approved'
  | 'rejected'
  | 'returned';

export type ArStage = 'department_secretary' | 'hr' | 'accounting';

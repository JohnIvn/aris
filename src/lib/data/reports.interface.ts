import { ArStatus, Campus } from './reports.types';

export interface ReportData {
  id: string;
  user_id: string | null;
  employee_id: number | null;
  faculty_id: string;
  period_start: string;
  period_end: string;
  approval_stage: ArStatus;
  entries: ReportEntryData[];
  department_secretary_id: string | null;
  hr_id: string | null;
  accounting_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportEntryData {
  id: string;
  report_id: string;
  course: string;
  code: string;
  program: string;
  year: string;
  section: string;
  units: string;
  day: string;
  shift_hours: number;
  shift_start: string;
  shift_end: string;
  campus: Campus;
  class_date: string;
  topics: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

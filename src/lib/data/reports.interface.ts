export interface ReportData {
  id: string;
  user_id: string | null;
  employee_id: number | null;
  shift_hours: number;
  shift_start: string | null;
  shift_end: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportEntryData {
  id: string;
  report_id: string;
  course: string | null;
  description: string | null;
  output_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

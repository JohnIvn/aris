export interface PayrollData {
  id: string;
  user_id: string;
  employee_id: string;
  salary: number;
  date_received: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
}

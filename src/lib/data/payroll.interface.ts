export interface PayrollData {
  id: string;
  user_id: string;
  employee_id: string;
  salary: number;
  date_received: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
}

export type PayrollStatus =
  'pending' | 'processing' | 'ready' | 'rejected' | 'received';

export interface Payroll {
  id: string;
  employee_id: string;
  ar_id: string;
  period: string;
  amount: number;
  status: PayrollStatus;
  created_at: string;
  updated_at: string;
}

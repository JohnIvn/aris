export interface Dtr {
  id: string;
  professor_id: string;
  staff_id: string;
  biometrics_id: string;
  time_in: string;
  time_out: string;
  total_hours: number;
  shift_date: string;
  on_site: boolean;
}

export type DtrStatus = 'present' | 'late' | 'missing' | 'absent';

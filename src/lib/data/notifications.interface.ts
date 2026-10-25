import { NotificationType } from './types';

export interface Notification {
  id: string;
  professor_id: string | null;
  staff_id: string | null;
  title: string | null;
  description: string;
  type: NotificationType;
  report_id: string | null;
  is_read: boolean;
  created_at: string;
  updated_at: string;
}

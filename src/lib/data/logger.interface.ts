import { ActionStatus, AdminAction } from './logger.types';

export interface AdminLog {
  id?: string | null;
  action_type: AdminAction;
  action_status: ActionStatus;
  admin_id: string;
  admin_email: string;
  user_id: string;
  user_email: string;
  created_at?: string | null;
  updated_at?: string | null;
}

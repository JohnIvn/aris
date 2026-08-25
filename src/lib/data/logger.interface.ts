import { ActionStatus, AdminAction, AuthAction } from './logger.types';
import { UserRoles } from './types';

export interface AdminLog {
  id?: string | null;
  action_type: AdminAction;
  action_status: ActionStatus;
  admin_id: string;
  user_id: string;
  metadata?: Record<string, any>;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AuthLog {
  id?: string | null;
  action_type: AuthAction;
  action_status: ActionStatus;
  user_id: string;
  role: UserRoles;
  metadata?: Record<string, any>;
  created_at?: string | null;
  updated_at?: string | null;
}

import {
  ActionStatus,
  AdminAction,
  AuthAction,
  UserAction,
} from './logger.types';
import { UserRoles } from './types';

export interface AdminLog {
  id?: string | null;
  action_type?: AdminAction | null;
  auth_action?: AuthAction | null;
  action_status: ActionStatus;
  admin_id: string;
  user_id?: string | null;
  metadata?: Record<string, any>;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface UserLog {
  id?: string | null;
  action_type?: UserAction | null;
  auth_action?: AuthAction | null;
  action_status: ActionStatus;
  user_id: string;
  role: UserRoles;
  staff_id?: string | null;
  professor_id?: string | null;
  metadata?: Record<string, any>;
  created_at?: string | null;
  updated_at?: string | null;
}

export type AuthLog = UserLog;

import { AccountProvider, UserRoles } from './types';

export interface UserData {
  id: string;
  employee_id: string;
  avatar_url?: string;
  email: string;
  password_hash: string;
  username: string;
  firstname: string;
  middlename: string;
  lastname: string;
  gender: string;
  birthday?: string;
  age?: number;
  role: UserRoles;
  department: string;
  position: string;
  faculty_no: string;
  provider: AccountProvider;
  is_banned: boolean;
  failed_login_attempts: number;
  created_at?: string;
  updated_at?: string;
}

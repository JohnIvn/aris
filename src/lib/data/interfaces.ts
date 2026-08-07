import { UserRoles } from './types';

export interface UserSession {
  id: string;
  email: string;
  role: UserRoles;
}

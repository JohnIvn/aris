import { AccountProvider, UserRoles } from './types';

export interface UserData {
  id?: string;
  avatar_url?: string;
  email: string;
  password_hash: string;
  username: string;
  firstname: string;
  middlename: string;
  lastname: string;
  birthday?: string;
  age?: number;
  role?: UserRoles;
  provider?: AccountProvider;
}

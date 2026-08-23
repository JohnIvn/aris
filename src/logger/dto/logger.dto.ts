import { IsEmail, IsEnum, IsString, IsUUID } from 'class-validator';
import {
  ACTION_STATUS,
  type ActionStatus,
  ADMIN_ACTION,
  type AdminAction,
  AUTH_ACTION,
  type AuthAction,
} from '../../lib/data/logger.types';
import { USER_ROLES, type UserRoles } from '../../lib/data/types';

export class LoggerAuthDto {
  @IsEnum(AUTH_ACTION)
  @IsString()
  action_type!: AuthAction;

  @IsEnum(ACTION_STATUS)
  @IsString()
  action_status!: ActionStatus;

  @IsUUID()
  @IsString()
  user_id!: string;

  @IsEmail()
  @IsString()
  user_email!: string;

  @IsEnum(USER_ROLES)
  @IsString()
  role!: UserRoles;
}

export class LoggerAdminDto {
  @IsEnum(ADMIN_ACTION)
  @IsString()
  action_type!: AdminAction;

  @IsEnum(ACTION_STATUS)
  @IsString()
  action_status!: ActionStatus;

  @IsUUID()
  @IsString()
  admin_id!: string;

  @IsEmail()
  @IsString()
  admin_email!: string;

  @IsUUID()
  @IsString()
  user_id!: string;

  @IsEmail()
  @IsString()
  user_email!: string;
}

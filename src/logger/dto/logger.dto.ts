import { IsEnum, IsJSON, IsOptional, IsString, IsUUID } from 'class-validator';
import {
  ACTION_STATUS,
  type ActionStatus,
  ADMIN_ACTION,
  type AdminAction,
  AUTH_ACTION,
  type AuthAction,
  USER_ACTION,
  type UserAction,
} from '../../lib/data/logger.types';
import { USER_ROLES, type UserRoles } from '../../lib/data/types';

export class LoggerAuthDto {
  @IsEnum(AUTH_ACTION)
  @IsString()
  auth_action!: AuthAction;

  @IsEnum(ACTION_STATUS)
  @IsString()
  action_status!: ActionStatus;

  @IsUUID()
  @IsString()
  @IsOptional()
  user_id?: string;

  @IsEnum(USER_ROLES)
  @IsString()
  @IsOptional()
  role?: UserRoles;

  @IsJSON()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class LoggerAdminDto {
  @IsEnum(ADMIN_ACTION)
  @IsString()
  @IsOptional()
  action_type?: AdminAction;

  @IsEnum(AUTH_ACTION)
  @IsString()
  @IsOptional()
  auth_action?: AuthAction;

  @IsEnum(ACTION_STATUS)
  @IsString()
  action_status!: ActionStatus;

  @IsUUID()
  @IsString()
  admin_id!: string;

  @IsUUID()
  @IsString()
  @IsOptional()
  user_id?: string;

  @IsJSON()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class LoggerUserDto {
  @IsEnum(USER_ACTION)
  @IsString()
  @IsOptional()
  action_type?: UserAction;

  @IsEnum(AUTH_ACTION)
  @IsString()
  @IsOptional()
  auth_action?: AuthAction;

  @IsEnum(ACTION_STATUS)
  @IsString()
  action_status!: ActionStatus;

  @IsUUID()
  @IsString()
  user_id!: string;

  @IsEnum(USER_ROLES)
  @IsString()
  role!: UserRoles;

  @IsJSON()
  @IsOptional()
  metadata?: Record<string, any>;
}

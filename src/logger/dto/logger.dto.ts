import { IsEnum, IsJSON, IsOptional, IsString, IsUUID } from 'class-validator';
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
  action_type!: AdminAction;

  @IsEnum(ACTION_STATUS)
  @IsString()
  action_status!: ActionStatus;

  @IsUUID()
  @IsString()
  admin_id!: string;

  @IsUUID()
  @IsString()
  user_id!: string;

  @IsJSON()
  @IsOptional()
  metadata?: Record<string, any>;
}

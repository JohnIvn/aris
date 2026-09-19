import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { NOTIFICATION_TYPE, type NotificationType } from '../../lib/data/types';

export class NotificationDto {
  @IsUUID()
  id!: string;

  @IsUUID()
  user_id!: string;

  @IsEnum(NOTIFICATION_TYPE)
  @IsOptional()
  type?: NotificationType;

  @IsString()
  title!: string;

  @IsString()
  @IsOptional()
  body?: string;

  @IsString()
  @IsOptional()
  entity_type?: string;

  @IsUUID()
  @IsOptional()
  entity_id?: string;

  @IsUUID()
  @IsOptional()
  actor_id?: string;

  @IsBoolean()
  @IsOptional()
  is_read?: boolean;

  @IsDateString()
  @IsOptional()
  created_at?: Date | string;
}

import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { NOTIFICATION_TYPE, type NotificationType } from '../../lib/data/types';

export class NotificationDto {
  @IsString()
  @IsEnum(NOTIFICATION_TYPE)
  type!: NotificationType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsUUID()
  report_id?: string;
}

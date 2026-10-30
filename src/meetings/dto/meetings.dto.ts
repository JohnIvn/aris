import { IsOptional, IsString, IsNumber } from 'class-validator';

export class SaveMeetingDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  course?: string;

  @IsOptional()
  @IsString()
  meeting_code?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  meeting_url?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  started_at?: string | number | Date;

  @IsOptional()
  ended_at?: string | number | Date;

  @IsOptional()
  @IsNumber()
  duration_seconds?: number;

  @IsOptional()
  @IsNumber()
  duration_minutes?: number;

  @IsOptional()
  @IsString()
  meeting_date?: string;

  @IsOptional()
  @IsString()
  start_time?: string;

  @IsOptional()
  @IsString()
  end_time?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  info?: string;

  @IsOptional()
  @IsString()
  professor_id?: string;

  @IsOptional()
  @IsString()
  user_email?: string;

  @IsOptional()
  transcript?: { t: string; who: string; text: string }[] | unknown[];

  @IsOptional()
  @IsString()
  transcript_source?: string;

  @IsOptional()
  participants?: string[] | unknown[];

  @IsOptional()
  @IsNumber()
  word_count?: number;

  @IsOptional()
  metadata?: Record<string, unknown>;
}

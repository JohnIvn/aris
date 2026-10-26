import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const ANNOUNCEMENT_CATEGORIES = [
  'AR / DTR',
  'System',
  'AI / ML',
  'General',
  'Urgent',
] as const;

export const ANNOUNCEMENT_AUDIENCES = [
  'Everyone',
  'HR',
  'Checker',
  'Accounting',
  'Secretary',
  'Professors',
] as const;

export const ANNOUNCEMENT_STATUSES = [
  'draft',
  'scheduled',
  'sent',
  'archived',
] as const;

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsIn(ANNOUNCEMENT_CATEGORIES)
  category!: (typeof ANNOUNCEMENT_CATEGORIES)[number];

  @IsIn(ANNOUNCEMENT_AUDIENCES)
  audience!: (typeof ANNOUNCEMENT_AUDIENCES)[number];

  @IsBoolean()
  @IsOptional()
  isPinned?: boolean;

  @IsIn(ANNOUNCEMENT_STATUSES)
  @IsOptional()
  status?: (typeof ANNOUNCEMENT_STATUSES)[number];

  @IsISO8601()
  @IsOptional()
  expiresAt?: string;
}

export class UpdateAnnouncementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @IsOptional()
  title?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  @IsOptional()
  body?: string;

  @IsIn(ANNOUNCEMENT_CATEGORIES)
  @IsOptional()
  category?: (typeof ANNOUNCEMENT_CATEGORIES)[number];

  @IsIn(ANNOUNCEMENT_AUDIENCES)
  @IsOptional()
  audience?: (typeof ANNOUNCEMENT_AUDIENCES)[number];

  @IsBoolean()
  @IsOptional()
  isPinned?: boolean;

  @IsIn(ANNOUNCEMENT_STATUSES)
  @IsOptional()
  status?: (typeof ANNOUNCEMENT_STATUSES)[number];

  @IsISO8601()
  @IsOptional()
  expiresAt?: string | null;
}

export class TogglePinAnnouncementDto {
  @IsBoolean()
  @IsOptional()
  isPinned?: boolean;
}

export class ListAnnouncementsDto {
  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  audience?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  search?: string;
}

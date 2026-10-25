import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const ANNOUNCEMENT_CATEGORIES = ['AR / DTR', 'System', 'AI / ML'] as const;
export const ANNOUNCEMENT_AUDIENCES = [
  'Everyone',
  'HR',
  'Checker',
  'Accounting',
  'Secretary',
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

  @IsISO8601()
  @IsOptional()
  expiresAt?: string;
}

export class ListAnnouncementsDto {
  @IsIn(['all', ...ANNOUNCEMENT_CATEGORIES])
  @IsOptional()
  category?: 'all' | (typeof ANNOUNCEMENT_CATEGORIES)[number];
}

import {
  IsInt,
  IsOptional,
  IsDateString,
  IsUUID,
  IsString,
  IsIn,
  Min,
} from 'class-validator';

export class ReportFetchDto {
  @IsUUID()
  id!: string;
}

export class ReportFetchUserDto {
  @IsUUID()
  user_id!: string;
}

export class ReportRecordDto {
  @IsUUID()
  user_id!: string;

  @IsOptional()
  @IsInt()
  employee_id?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  shift_hours?: number;

  @IsOptional()
  @IsDateString()
  shift_start?: string;

  @IsOptional()
  @IsDateString()
  shift_end?: string;
}

export class ReportUpdateDto {
  @IsUUID()
  id!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  shift_hours?: number;

  @IsOptional()
  @IsDateString()
  shift_start?: string;

  @IsOptional()
  @IsDateString()
  shift_end?: string;
}

export class ReportDeleteDto {
  @IsUUID()
  id!: string;
}

export class ReportEntryFetchDto {
  @IsUUID()
  id!: string;
}

export class ReportEntryFetchReportDto {
  @IsUUID()
  report_id!: string;
}

export class ReportEntryRecordDto {
  @IsUUID()
  report_id!: string;

  @IsOptional()
  @IsString()
  course?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  output_count?: number;

  @IsOptional()
  @IsIn(['draft', 'submitted', 'approved', 'rejected'])
  status?: 'draft' | 'submitted' | 'approved' | 'rejected';
}

export class ReportEntryUpdateDto {
  @IsUUID()
  id!: string;

  @IsOptional()
  @IsString()
  course?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  output_count?: number;

  @IsOptional()
  @IsIn(['draft', 'submitted', 'approved', 'rejected'])
  status?: 'draft' | 'submitted' | 'approved' | 'rejected';
}

export class ReportEntryDeleteDto {
  @IsUUID()
  id!: string;
}

import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsInt,
} from 'class-validator';

export class TransactionsDto {
  @IsNumber()
  id!: number;

  @IsOptional()
  @IsNumber()
  emp?: number;

  @IsOptional()
  @IsString()
  emp_code?: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string | null;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  position?: string | null;

  @IsDateString()
  punch_time!: string;

  @IsOptional()
  @IsString()
  punch_state?: string;

  @IsOptional()
  @IsString()
  punch_state_display?: string;

  @IsOptional()
  @IsInt()
  verify_type?: number;

  @IsOptional()
  @IsString()
  verify_type_display?: string;

  @IsOptional()
  @IsString()
  work_code?: string;

  @IsOptional()
  @IsString()
  gps_location?: string | null;

  @IsOptional()
  @IsString()
  area_alias?: string;

  @IsOptional()
  @IsString()
  terminal_sn?: string;

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsString()
  is_mask?: string;

  @IsOptional()
  @IsString()
  terminal_alias?: string;

  @IsOptional()
  @IsDateString()
  upload_time?: string;

  @IsOptional()
  @IsNumber()
  longitude?: number | null;

  @IsOptional()
  @IsNumber()
  latitude?: number | null;
}

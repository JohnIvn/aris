import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ACCOUNT_PROVIDER } from '../lib/data/types';

export class CreateStaffDto {
  @IsString()
  @MinLength(1)
  employee_id!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(50)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstname!: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  middlename?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastname!: string;

  @ValidateIf((data) => data.provider !== 'google')
  @IsString()
  @MinLength(8)
  password?: string;

  @IsEnum(ACCOUNT_PROVIDER)
  @IsOptional()
  provider?: (typeof ACCOUNT_PROVIDER)[number];

  @IsString()
  @IsOptional()
  oauth_id_token?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  position?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  department?: string;
}

export class UpdateStaffStatusDto {
  @IsBoolean()
  active!: boolean;
}

export class UpdateStaffDto {
  @IsString()
  @IsOptional()
  employee_id?: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  firstname?: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  middlename?: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  lastname?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  position?: string;

  @IsString()
  @IsOptional()
  @MaxLength(150)
  department?: string;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  @MinLength(8)
  @MaxLength(100)
  password?: string;
}

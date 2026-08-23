import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ACCOUNT_PROVIDER,
  USER_ROLES,
  type UserRoles,
  type AccountProvider,
} from '../../lib/data/types';

export class SignInDto {
  @IsString()
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class SignUpDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsString()
  @IsOptional()
  avatar_url?: string;

  @IsString()
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  username!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstname!: string;

  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(60)
  middlename?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  lastname!: string;

  @IsDateString()
  @IsOptional()
  birthday?: string;

  @IsNumber()
  @IsOptional()
  age?: number;

  @IsEnum(USER_ROLES)
  @IsString()
  @IsOptional()
  role?: UserRoles;

  @IsEnum(ACCOUNT_PROVIDER)
  @IsString()
  @IsOptional()
  provider?: AccountProvider;
}

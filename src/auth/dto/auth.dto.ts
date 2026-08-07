import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
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
  @Max(20)
  @Min(8)
  username!: string;

  @IsString()
  @Max(60)
  @Min(2)
  firstname!: string;

  @IsString()
  @IsOptional()
  @Max(60)
  @Min(2)
  middlename!: string;

  @IsString()
  @Max(60)
  @Min(2)
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

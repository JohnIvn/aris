import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class GoogleSignInDto {
  @IsString()
  @IsNotEmpty()
  id_token!: string;

  @IsIn(['android', 'ios', 'desktop', 'web'])
  platform!: 'android' | 'ios' | 'desktop' | 'web';
}

export class GoogleSignUpDto extends GoogleSignInDto {
  @IsIn(['staff', 'professor'])
  role!: 'staff' | 'professor';

  @IsString()
  @IsNotEmpty()
  employee_id!: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  middlename?: string;

  @IsOptional()
  @IsDateString()
  birthday?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  department?: string;
}

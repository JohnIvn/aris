import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateProfessorDto {
  @IsString()
  @MinLength(1)
  employee_id!: string;

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

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

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
}

export class UpdateProfessorStatusDto {
  @IsBoolean()
  active!: boolean;
}

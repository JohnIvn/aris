import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

// --- COLLEGES ---
export class CreateCollegeDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class UpdateCollegeDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

// --- DEPARTMENTS ---
export class CreateDepartmentDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  college_id?: string;

  @IsString()
  @IsOptional()
  college_name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class UpdateDepartmentDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  college_id?: string;

  @IsString()
  @IsOptional()
  college_name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

// --- PROGRAMS ---
export class CreateProgramDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  department_id?: string;

  @IsString()
  @IsOptional()
  department_name?: string;

  @IsString()
  @IsOptional()
  college_id?: string;

  @IsString()
  @IsOptional()
  college_name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class UpdateProgramDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  department_id?: string;

  @IsString()
  @IsOptional()
  department_name?: string;

  @IsString()
  @IsOptional()
  college_id?: string;

  @IsString()
  @IsOptional()
  college_name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

// --- ACADEMIC RANKS ---
export class CreateRankDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsInt()
  @IsOptional()
  hierarchy_level?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class UpdateRankDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsInt()
  @IsOptional()
  hierarchy_level?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

// --- COURSES ---
export class CreateCourseDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  department_id?: string;

  @IsString()
  @IsOptional()
  department_name?: string;

  @IsInt()
  @IsOptional()
  units?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class UpdateCourseDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  department_id?: string;

  @IsString()
  @IsOptional()
  department_name?: string;

  @IsInt()
  @IsOptional()
  units?: number;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

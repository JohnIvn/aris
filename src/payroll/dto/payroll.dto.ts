import {
  IsDate,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class PayrollRecordDto {
  @IsUUID()
  @IsString()
  user_id!: string;

  @IsString()
  employee_id!: string;

  @IsNumber()
  salary!: number;

  @IsDate()
  @IsOptional()
  date_received?: Date | string;
}

export class PayrollUpdateDto {
  @IsUUID()
  @IsString()
  id!: string;

  @IsNumber()
  salary!: number;

  @IsDate()
  @IsOptional()
  date_received?: Date | string;
}

export class PayrollFetchDto {
  @IsUUID()
  @IsString()
  id!: string;
}

export class PayrollFetchUserDto {
  @IsUUID()
  @IsString()
  user_id!: string;
}
export class PayrollDeleteDto {
  @IsUUID()
  @IsString()
  id!: string;
}

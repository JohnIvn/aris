import { IsNotEmpty, IsUUID } from 'class-validator';

export class AssignBiometricsDto {
  @IsNotEmpty()
  biometrics_emp_id!: string;

  @IsUUID()
  user_id!: string;
}

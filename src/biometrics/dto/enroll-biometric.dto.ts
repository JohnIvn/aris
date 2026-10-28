import { IsOptional, IsString } from 'class-validator';

export class EnrollBiometricDto {
  @IsString()
  @IsOptional()
  professor_id?: string;

  @IsString()
  @IsOptional()
  staff_id?: string;

  @IsString()
  biometrics_id!: string;

  @IsString()
  @IsOptional()
  biometrics_fingerprint?: string;

  @IsString()
  @IsOptional()
  authenticator_fingerprint?: string;

  @IsString()
  @IsOptional()
  nfc_id?: string;

  @IsString()
  @IsOptional()
  rfid?: string;

  @IsString()
  @IsOptional()
  device_name?: string;
}


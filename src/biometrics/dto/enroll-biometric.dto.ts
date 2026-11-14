import { IsNotEmpty, IsString, IsUUID, Matches } from 'class-validator';

export class EnrollBiometricDto {
  @IsUUID()
  user_id!: string;

  // Device tag, e.g. auth-00001
  @IsString()
  @Matches(/^(auth-\d{5,}|[A-Za-z0-9_-]{3,32})$/)
  authenticator_tag!: string;

  // fingerprintId reported by the sensor after enrollment, saved as
  // dtr_biometrics.authenticator_fingerprint. Capacity is device-defined, so no upper bound here.
  @Matches(/^\d+$/)
  biometrics_fingerprint!: string;
}

export class ClearAuthenticatorDto {
  @IsString()
  @IsNotEmpty()
  authenticator_tag!: string;
}

export class PunchDto {
  @IsUUID()
  user_id!: string;

  @IsString()
  @IsNotEmpty()
  authenticator_tag!: string;
}

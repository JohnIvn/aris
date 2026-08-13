import { IsBase64, IsDate, IsOptional, IsUUID } from 'class-validator';

export class FingerprintRegister {
  @IsUUID()
  id!: string;

  @IsUUID()
  user_id!: string;

  @IsBase64()
  image_id!: string;

  @IsDate()
  @IsOptional()
  created_at?: Date;
}
export class FingerprintVerify {
  @IsUUID()
  image_id!: string;
}
export class FingerprintDelete {
  @IsUUID()
  id!: string;
}

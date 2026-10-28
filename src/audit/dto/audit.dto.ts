import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListAuditDto {
  @IsOptional()
  @IsString()
  result?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  stage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  limit?: number;
}

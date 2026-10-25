import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const AUDIT_RESULTS = [
  'All',
  'Submitted',
  'Approved',
  'Rejected',
  'Flagged',
  'Missing',
  'Pending',
  'Disapproved',
] as const;

export class ListAuditDto {
  @IsOptional()
  @IsIn(AUDIT_RESULTS)
  result?: (typeof AUDIT_RESULTS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

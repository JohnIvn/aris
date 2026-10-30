import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateApprovalDto {
  @IsNotEmpty()
  @IsString()
  id: string;

  @IsNotEmpty()
  @IsIn(['Approve', 'Disapprove', 'Flag'])
  action: 'Approve' | 'Disapprove' | 'Flag';

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsString()
  stage?: string;

  @IsOptional()
  @IsString()
  role?: string;
}

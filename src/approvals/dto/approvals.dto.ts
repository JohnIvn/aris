import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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

export class CreateStageDto {
  @IsNotEmpty()
  @IsString()
  label: string;

  @IsNotEmpty()
  @IsString()
  role_name: string;

  @IsNotEmpty()
  @IsIn(['AR', 'DTR', 'ALL'])
  document_type: 'AR' | 'DTR' | 'ALL';

  @IsOptional()
  @IsInt()
  @Min(1)
  stage_order?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_final?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateStageDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  role_name?: string;

  @IsOptional()
  @IsIn(['AR', 'DTR', 'ALL'])
  document_type?: 'AR' | 'DTR' | 'ALL';

  @IsOptional()
  @IsInt()
  @Min(1)
  stage_order?: number;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  is_final?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class StageOrderItemDto {
  @IsNotEmpty()
  @IsString()
  id: string;

  @IsNotEmpty()
  @IsInt()
  @Min(1)
  stage_order: number;
}

export class ReorderStagesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StageOrderItemDto)
  stages: StageOrderItemDto[];
}

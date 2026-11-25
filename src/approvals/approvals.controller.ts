import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import type { UserSession } from '../lib/data/interfaces';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { ApprovalsService } from './approvals.service';
import {
  CreateStageDto,
  ReorderStagesDto,
  UpdateStageDto,
} from './dto/approvals.dto';

@Controller('approvals')
@UseGuards(JwtCookieGuard)
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get()
  list(@CurrentUser() user: UserSession) {
    return this.approvalsService.listApprovals(user);
  }

  @Get('stages')
  getStages(@Query('document_type') documentType?: string) {
    return this.approvalsService.getStages(documentType);
  }

  @Post('stages')
  createStage(
    @CurrentUser() user: UserSession,
    @Body() dto: CreateStageDto,
  ) {
    return this.approvalsService.createStage(user, dto);
  }

  @Put('stages/reorder')
  reorderStages(
    @CurrentUser() user: UserSession,
    @Body() dto: ReorderStagesDto,
  ) {
    return this.approvalsService.reorderStages(user, dto);
  }

  @Post('stages/reset')
  resetStages(@CurrentUser() user: UserSession) {
    return this.approvalsService.resetStages(user);
  }

  @Put('stages/:id')
  updateStage(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() dto: UpdateStageDto,
  ) {
    return this.approvalsService.updateStage(user, id, dto);
  }

  @Delete('stages/:id')
  deleteStage(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
  ) {
    return this.approvalsService.deleteStage(user, id);
  }

  @Put()
  decide(@CurrentUser() user: UserSession, @Body() data: any) {
    return this.approvalsService.handleDecision(user, data);
  }

  @Patch(':id')
  updateById(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.approvalsService.handleDecision(user, { ...data, id });
  }
}

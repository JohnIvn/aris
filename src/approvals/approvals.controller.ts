import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import type { UserSession } from '../lib/data/interfaces';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { ApprovalsService } from './approvals.service';

@Controller('approvals')
@UseGuards(JwtCookieGuard)
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get()
  list() {
    return this.approvalsService.listApprovals();
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


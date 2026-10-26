import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { CurrentUser } from '../lib/decorators/cookie-decorator';
import type { UserSession } from '../lib/data/interfaces';
import {
  CreateSupportTicketDto,
  CreateTicketMessageDto,
  UpdateSupportTicketDto,
} from './dto/support.dto';
import { SupportService } from './support.service';

@Controller('support')
@UseGuards(JwtCookieGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get('tickets')
  listTickets(@CurrentUser() user: UserSession) {
    return this.supportService.listTickets(user);
  }

  @Post('tickets')
  createTicket(
    @CurrentUser() user: UserSession,
    @Body() dto: CreateSupportTicketDto,
  ) {
    return this.supportService.createTicket(user, dto);
  }

  @Patch('tickets/:id')
  updateTicket(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() dto: UpdateSupportTicketDto,
  ) {
    return this.supportService.updateTicket(user, id, dto);
  }

  @Post('tickets/:id/messages')
  addMessage(
    @CurrentUser() user: UserSession,
    @Param('id') id: string,
    @Body() dto: CreateTicketMessageDto,
  ) {
    return this.supportService.addMessage(user, id, dto);
  }
}

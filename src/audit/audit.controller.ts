import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { AuditService } from './audit.service';
import { ListAuditDto } from './dto/audit.dto';

@Controller('audit')
@UseGuards(JwtCookieGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(@Query() filters: ListAuditDto) {
    return this.auditService.list(filters);
  }

  @Get('stages')
  getStages() {
    return this.auditService.getStages();
  }

  @Get('stats')
  getStats() {
    return this.auditService.getStats();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.auditService.getById(id);
  }
}

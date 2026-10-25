import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { Roles } from '../lib/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { ListAuditDto } from './dto/audit.dto';

@Controller('audit')
@Roles('admin')
@UseGuards(JwtCookieGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(@Query() filters: ListAuditDto) {
    return this.auditService.list(filters);
  }
}

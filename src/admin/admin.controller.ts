import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { Roles } from '../lib/decorators/roles.decorator';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Roles('admin')
  @UseGuards(JwtCookieGuard)
  @Get()
  fetchUsers(@Query('for') target?: string) {
    return this.adminService.fetchUsers(
      target === 'biometrics' ? 'biometrics' : 'authenticator',
    );
  }
}

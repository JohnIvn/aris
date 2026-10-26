import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { CreateStaffDto, UpdateStaffDto, UpdateStaffStatusDto } from './staff.dto';
import { StaffService } from './staff.service';

@Controller('staff')
@UseGuards(JwtCookieGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get()
  list() {
    return this.staffService.list();
  }

  @Post()
  create(@Body() data: CreateStaffDto) {
    return this.staffService.create(data);
  }

  @Patch(':id')
  updateStaff(
    @Param('id') id: string,
    @Body() data: UpdateStaffDto,
  ) {
    return this.staffService.updateStaff(id, data);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() data: UpdateStaffStatusDto,
  ) {
    return this.staffService.updateStatus(id, data.active);
  }

  @Delete(':id')
  deleteStaff(@Param('id') id: string) {
    return this.staffService.deleteStaff(id);
  }
}

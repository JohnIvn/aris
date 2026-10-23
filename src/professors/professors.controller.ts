import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { ProfessorsService } from './professors.service';

@Controller('professors')
export class ProfessorsController {
  constructor(private readonly professorsService: ProfessorsService) {}

  @Get()
  @UseGuards(JwtCookieGuard)
  fetchProfessors() {
    return this.professorsService.fetchProfessors();
  }
}

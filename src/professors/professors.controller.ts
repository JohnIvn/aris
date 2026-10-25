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
import { ProfessorsService } from './professors.service';
import {
  CreateProfessorDto,
  UpdateProfessorStatusDto,
} from './dto/professor.dto';

@Controller('professors')
@UseGuards(JwtCookieGuard)
export class ProfessorsController {
  constructor(private readonly professorsService: ProfessorsService) {}

  @Get()
  fetchProfessors() {
    return this.professorsService.fetchProfessors();
  }

  @Post()
  createProfessor(@Body() data: CreateProfessorDto) {
    return this.professorsService.createProfessor(data);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() data: UpdateProfessorStatusDto,
  ) {
    return this.professorsService.updateStatus(id, data.active);
  }
}

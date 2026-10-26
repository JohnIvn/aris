import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtCookieGuard } from '../lib/guards/jwt.guard';
import { CurriculumService } from './curriculum.service';
import {
  CreateCourseDto,
  CreateDepartmentDto,
  CreateRankDto,
  UpdateCourseDto,
  UpdateDepartmentDto,
  UpdateRankDto,
} from './dto/curriculum.dto';

@Controller('curriculum')
@UseGuards(JwtCookieGuard)
export class CurriculumController {
  constructor(private readonly curriculumService: CurriculumService) {}

  @Get()
  getOverview() {
    return this.curriculumService.getOverview();
  }

  // Departments
  @Get('departments')
  listDepartments(@Query('active') active?: string) {
    return this.curriculumService.listDepartments(active === 'true');
  }

  @Post('departments')
  createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.curriculumService.createDepartment(dto);
  }

  @Patch('departments/:id')
  updateDepartment(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.curriculumService.updateDepartment(id, dto);
  }

  @Delete('departments/:id')
  deleteDepartment(@Param('id') id: string) {
    return this.curriculumService.deleteDepartment(id);
  }

  // Academic Ranks
  @Get('ranks')
  listRanks(@Query('active') active?: string) {
    return this.curriculumService.listRanks(active === 'true');
  }

  @Post('ranks')
  createRank(@Body() dto: CreateRankDto) {
    return this.curriculumService.createRank(dto);
  }

  @Patch('ranks/:id')
  updateRank(
    @Param('id') id: string,
    @Body() dto: UpdateRankDto,
  ) {
    return this.curriculumService.updateRank(id, dto);
  }

  @Delete('ranks/:id')
  deleteRank(@Param('id') id: string) {
    return this.curriculumService.deleteRank(id);
  }

  // Courses
  @Get('courses')
  listCourses(@Query('department') department?: string) {
    return this.curriculumService.listCourses(department);
  }

  @Post('courses')
  createCourse(@Body() dto: CreateCourseDto) {
    return this.curriculumService.createCourse(dto);
  }

  @Patch('courses/:id')
  updateCourse(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.curriculumService.updateCourse(id, dto);
  }

  @Delete('courses/:id')
  deleteCourse(@Param('id') id: string) {
    return this.curriculumService.deleteCourse(id);
  }
}


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
  CreateCollegeDto,
  CreateCourseDto,
  CreateDepartmentDto,
  CreateProgramDto,
  CreateRankDto,
  UpdateCollegeDto,
  UpdateCourseDto,
  UpdateDepartmentDto,
  UpdateProgramDto,
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

  // --- COLLEGES ---
  @Get('colleges')
  listColleges(@Query('active') active?: string) {
    return this.curriculumService.listColleges(active === 'true');
  }

  @Post('colleges')
  createCollege(@Body() dto: CreateCollegeDto) {
    return this.curriculumService.createCollege(dto);
  }

  @Patch('colleges/:id')
  updateCollege(@Param('id') id: string, @Body() dto: UpdateCollegeDto) {
    return this.curriculumService.updateCollege(id, dto);
  }

  @Delete('colleges/:id')
  deleteCollege(@Param('id') id: string) {
    return this.curriculumService.deleteCollege(id);
  }

  // --- DEPARTMENTS ---
  @Get('departments')
  listDepartments(
    @Query('active') active?: string,
    @Query('college') college?: string,
  ) {
    return this.curriculumService.listDepartments(active === 'true', college);
  }

  @Post('departments')
  createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.curriculumService.createDepartment(dto);
  }

  @Patch('departments/:id')
  updateDepartment(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.curriculumService.updateDepartment(id, dto);
  }

  @Delete('departments/:id')
  deleteDepartment(@Param('id') id: string) {
    return this.curriculumService.deleteDepartment(id);
  }

  // --- PROGRAMS ---
  @Get('programs')
  listPrograms(
    @Query('active') active?: string,
    @Query('department') department?: string,
    @Query('college') college?: string,
  ) {
    return this.curriculumService.listPrograms(
      active === 'true',
      department,
      college,
    );
  }

  @Post('programs')
  createProgram(@Body() dto: CreateProgramDto) {
    return this.curriculumService.createProgram(dto);
  }

  @Patch('programs/:id')
  updateProgram(@Param('id') id: string, @Body() dto: UpdateProgramDto) {
    return this.curriculumService.updateProgram(id, dto);
  }

  @Delete('programs/:id')
  deleteProgram(@Param('id') id: string) {
    return this.curriculumService.deleteProgram(id);
  }

  // --- ACADEMIC RANKS ---
  @Get('ranks')
  listRanks(@Query('active') active?: string) {
    return this.curriculumService.listRanks(active === 'true');
  }

  @Post('ranks')
  createRank(@Body() dto: CreateRankDto) {
    return this.curriculumService.createRank(dto);
  }

  @Patch('ranks/:id')
  updateRank(@Param('id') id: string, @Body() dto: UpdateRankDto) {
    return this.curriculumService.updateRank(id, dto);
  }

  @Delete('ranks/:id')
  deleteRank(@Param('id') id: string) {
    return this.curriculumService.deleteRank(id);
  }

  // --- COURSES ---
  @Get('courses')
  listCourses(@Query('department') department?: string) {
    return this.curriculumService.listCourses(department);
  }

  @Post('courses')
  createCourse(@Body() dto: CreateCourseDto) {
    return this.curriculumService.createCourse(dto);
  }

  @Patch('courses/:id')
  updateCourse(@Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.curriculumService.updateCourse(id, dto);
  }

  @Delete('courses/:id')
  deleteCourse(@Param('id') id: string) {
    return this.curriculumService.deleteCourse(id);
  }
}

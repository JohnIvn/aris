import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
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

@Injectable()
export class CurriculumService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly loggerService: LoggerService,
  ) {}

  private get client() {
    return this.databaseService.getClient();
  }

  // --- OVERVIEW ---
  async getOverview() {
    try {
      const [
        collegesRes,
        departmentsRes,
        programsRes,
        ranksRes,
        coursesRes,
        countsRes,
      ] = await Promise.all([
        this.client.query(`
          SELECT col.*,
                 (SELECT COUNT(*)::int FROM departments d WHERE d.college_id = col.id OR d.college_name = col.name) AS department_count,
                 (SELECT COUNT(*)::int FROM programs p WHERE p.college_id = col.id OR p.college_name = col.name) AS program_count,
                 (SELECT COUNT(*)::int FROM user_professors up WHERE up.department = col.name) AS professor_count
            FROM colleges col
           ORDER BY col.name ASC
        `),
        this.client.query(`
          SELECT d.*,
                 (SELECT COUNT(*)::int FROM programs p WHERE p.department_id = d.id OR p.department_name = d.name) AS program_count,
                 (SELECT COUNT(*)::int FROM curriculum_courses c WHERE c.department_id = d.id OR c.department_name = d.name) AS course_count,
                 (SELECT COUNT(*)::int FROM user_professors up WHERE up.department = d.name) AS professor_count,
                 (SELECT COUNT(*)::int FROM user_staffs us WHERE us.department = d.name) AS staff_count
            FROM departments d
           ORDER BY d.name ASC
        `),
        this.client.query(`
          SELECT p.*
            FROM programs p
           ORDER BY p.name ASC
        `),
        this.client.query(`
          SELECT r.*,
                 (SELECT COUNT(*)::int FROM user_professors up WHERE up.position = r.name) AS professor_count
            FROM academic_ranks r
           ORDER BY r.hierarchy_level ASC, r.name ASC
        `),
        this.client.query(`
          SELECT c.*,
                 (SELECT COUNT(*)::int FROM user_professors up WHERE up.department = c.department_name) AS professor_count
            FROM curriculum_courses c
           ORDER BY c.code ASC
        `),
        this.client.query(`
          SELECT
            (SELECT COUNT(*)::int FROM colleges) AS total_colleges,
            (SELECT COUNT(*)::int FROM colleges WHERE is_active = TRUE) AS active_colleges,
            (SELECT COUNT(*)::int FROM departments) AS total_departments,
            (SELECT COUNT(*)::int FROM departments WHERE is_active = TRUE) AS active_departments,
            (SELECT COUNT(*)::int FROM programs) AS total_programs,
            (SELECT COUNT(*)::int FROM programs WHERE is_active = TRUE) AS active_programs,
            (SELECT COUNT(*)::int FROM academic_ranks) AS total_ranks,
            (SELECT COUNT(*)::int FROM academic_ranks WHERE is_active = TRUE) AS active_ranks,
            (SELECT COUNT(*)::int FROM curriculum_courses) AS total_courses,
            (SELECT COUNT(*)::int FROM user_professors) AS total_professors
        `),
      ]);

      return SuccessHandler('Successfully fetched curriculum data', 200, {
        colleges: collegesRes.rows,
        departments: departmentsRes.rows,
        programs: programsRes.rows,
        ranks: ranksRes.rows,
        courses: coursesRes.rows,
        stats: countsRes.rows[0] ?? {
          total_colleges: 0,
          active_colleges: 0,
          total_departments: 0,
          active_departments: 0,
          total_programs: 0,
          active_programs: 0,
          total_ranks: 0,
          active_ranks: 0,
          total_courses: 0,
          total_professors: 0,
        },
      });
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500, error.name)
        : ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  // ==============================================================
  // --- COLLEGES ---
  // ==============================================================
  async listColleges(activeOnly = false) {
    try {
      const query = activeOnly
        ? `SELECT col.*,
                  (SELECT COUNT(*)::int FROM departments d WHERE d.college_id = col.id OR d.college_name = col.name) AS department_count,
                  (SELECT COUNT(*)::int FROM programs p WHERE p.college_id = col.id OR p.college_name = col.name) AS program_count,
                  (SELECT COUNT(*)::int FROM user_professors up WHERE up.department = col.name) AS professor_count
             FROM colleges col
            WHERE col.is_active = TRUE
            ORDER BY col.name ASC`
        : `SELECT col.*,
                  (SELECT COUNT(*)::int FROM departments d WHERE d.college_id = col.id OR d.college_name = col.name) AS department_count,
                  (SELECT COUNT(*)::int FROM programs p WHERE p.college_id = col.id OR p.college_name = col.name) AS program_count,
                  (SELECT COUNT(*)::int FROM user_professors up WHERE up.department = col.name) AS professor_count
             FROM colleges col
            ORDER BY col.name ASC`;
      const result = await this.client.query(query);
      return SuccessHandler('Colleges fetched successfully', 200, result.rows);
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async createCollege(dto: CreateCollegeDto) {
    try {
      const code = dto.code.trim().toUpperCase();
      const name = dto.name.trim();
      const desc = dto.description?.trim() || null;
      const isActive = dto.is_active !== undefined ? dto.is_active : true;

      const result = await this.client.query(
        `INSERT INTO colleges (code, name, description, is_active)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [code, name, desc, isActive],
      );

      return SuccessHandler(
        'College created successfully',
        201,
        result.rows[0],
      );
    } catch (error: any) {
      if (error?.code === '23505') {
        return ErrorHandler(
          'A college with that code or name already exists.',
          409,
        );
      }
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async updateCollege(id: string, dto: UpdateCollegeDto) {
    try {
      const current = await this.client.query(
        'SELECT * FROM colleges WHERE id = $1',
        [id],
      );
      if (current.rows.length === 0) {
        return ErrorHandler('College not found', 404);
      }

      const existing = current.rows[0];
      const code =
        dto.code !== undefined ? dto.code.trim().toUpperCase() : existing.code;
      const name = dto.name !== undefined ? dto.name.trim() : existing.name;
      const desc =
        dto.description !== undefined
          ? dto.description
            ? dto.description.trim()
            : null
          : existing.description;
      const isActive =
        dto.is_active !== undefined ? dto.is_active : existing.is_active;

      const result = await this.client.query(
        `UPDATE colleges
            SET code = $1,
                name = $2,
                description = $3,
                is_active = $4,
                updated_at = NOW()
          WHERE id = $5
          RETURNING *`,
        [code, name, desc, isActive, id],
      );

      // If college name changed, cascade to referenced departments and programs
      if (existing.name !== name) {
        await this.client.query(
          `UPDATE departments SET college_name = $1 WHERE college_id = $2 OR college_name = $3`,
          [name, id, existing.name],
        );
        await this.client.query(
          `UPDATE programs SET college_name = $1 WHERE college_id = $2 OR college_name = $3`,
          [name, id, existing.name],
        );
        await this.client.query(
          `UPDATE user_professors SET department = $1 WHERE department = $2`,
          [name, existing.name],
        );
      }

      return SuccessHandler(
        'College updated successfully',
        200,
        result.rows[0],
      );
    } catch (error: any) {
      if (error?.code === '23505') {
        return ErrorHandler(
          'A college with that code or name already exists.',
          409,
        );
      }
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async deleteCollege(id: string) {
    try {
      const check = await this.client.query(
        'SELECT * FROM colleges WHERE id = $1',
        [id],
      );
      if (check.rows.length === 0) {
        return ErrorHandler('College not found', 404);
      }

      const colName = check.rows[0].name;

      // Check if departments or programs are tied to this college
      const [deptCount, progCount, profCount] = await Promise.all([
        this.client.query(
          'SELECT COUNT(*)::int AS count FROM departments WHERE college_id = $1 OR college_name = $2',
          [id, colName],
        ),
        this.client.query(
          'SELECT COUNT(*)::int AS count FROM programs WHERE college_id = $1 OR college_name = $2',
          [id, colName],
        ),
        this.client.query(
          'SELECT COUNT(*)::int AS count FROM user_professors WHERE department = $1',
          [colName],
        ),
      ]);

      const depts = deptCount.rows[0]?.count || 0;
      const progs = progCount.rows[0]?.count || 0;
      const profs = profCount.rows[0]?.count || 0;

      if (depts > 0 || progs > 0 || profs > 0) {
        await this.client.query(
          `UPDATE colleges SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
          [id],
        );
        return SuccessHandler(
          `College has ${depts} departments, ${progs} programs, and ${profs} faculty assigned, so it has been deactivated instead of deleted.`,
          200,
          { id, deactivated: true },
        );
      }

      await this.client.query('DELETE FROM colleges WHERE id = $1', [id]);
      void this.loggerService.logSystemEvent({
        actor_label: 'Administrator',
        kind: 'alert',
        event: 'Deleted College',
        detail: `Deleted college (${id})`,
      });
      return SuccessHandler('College deleted successfully', 200, { id });
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  // ==============================================================
  // --- DEPARTMENTS ---
  // ==============================================================
  async listDepartments(activeOnly = false, college?: string) {
    try {
      let query = `
        SELECT d.*,
               (SELECT COUNT(*)::int FROM programs p WHERE p.department_id = d.id OR p.department_name = d.name) AS program_count,
               (SELECT COUNT(*)::int FROM curriculum_courses c WHERE c.department_id = d.id OR c.department_name = d.name) AS course_count,
               (SELECT COUNT(*)::int FROM user_professors up WHERE up.department = d.name) AS professor_count
          FROM departments d
         WHERE 1=1
      `;
      const params: any[] = [];

      if (activeOnly) {
        query += ` AND d.is_active = TRUE`;
      }
      if (college) {
        params.push(college);
        query += ` AND (d.college_name = $${params.length} OR d.college_id::text = $${params.length})`;
      }

      query += ` ORDER BY d.name ASC`;

      const result = await this.client.query(query, params);
      return SuccessHandler(
        'Departments fetched successfully',
        200,
        result.rows,
      );
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async createDepartment(dto: CreateDepartmentDto) {
    try {
      const code = dto.code.trim().toUpperCase();
      const name = dto.name.trim();
      const desc = dto.description?.trim() || null;
      const isActive = dto.is_active !== undefined ? dto.is_active : true;

      let collegeId = dto.college_id || null;
      let collegeName = dto.college_name?.trim() || null;

      // Automatically look up college_id if college_name is provided
      if (collegeName && !collegeId) {
        const colRes = await this.client.query(
          'SELECT id, name FROM colleges WHERE name = $1 LIMIT 1',
          [collegeName],
        );
        if (colRes.rows.length > 0) {
          collegeId = colRes.rows[0].id;
          collegeName = colRes.rows[0].name;
        }
      } else if (collegeId && !collegeName) {
        const colRes = await this.client.query(
          'SELECT id, name FROM colleges WHERE id = $1 LIMIT 1',
          [collegeId],
        );
        if (colRes.rows.length > 0) {
          collegeName = colRes.rows[0].name;
        }
      }

      const result = await this.client.query(
        `INSERT INTO departments (code, name, college_id, college_name, description, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [code, name, collegeId, collegeName, desc, isActive],
      );

      return SuccessHandler(
        'Department created successfully',
        201,
        result.rows[0],
      );
    } catch (error: any) {
      if (error?.code === '23505') {
        return ErrorHandler(
          'A department with that code or name already exists.',
          409,
        );
      }
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto) {
    try {
      const current = await this.client.query(
        'SELECT * FROM departments WHERE id = $1',
        [id],
      );
      if (current.rows.length === 0) {
        return ErrorHandler('Department not found', 404);
      }

      const existing = current.rows[0];
      const code =
        dto.code !== undefined ? dto.code.trim().toUpperCase() : existing.code;
      const name = dto.name !== undefined ? dto.name.trim() : existing.name;
      const desc =
        dto.description !== undefined
          ? dto.description
            ? dto.description.trim()
            : null
          : existing.description;
      const isActive =
        dto.is_active !== undefined ? dto.is_active : existing.is_active;

      let collegeId =
        dto.college_id !== undefined ? dto.college_id : existing.college_id;
      let collegeName =
        dto.college_name !== undefined
          ? dto.college_name
            ? dto.college_name.trim()
            : null
          : existing.college_name;

      if (collegeName && !collegeId) {
        const colRes = await this.client.query(
          'SELECT id, name FROM colleges WHERE name = $1 LIMIT 1',
          [collegeName],
        );
        if (colRes.rows.length > 0) {
          collegeId = colRes.rows[0].id;
          collegeName = colRes.rows[0].name;
        }
      } else if (collegeId && !collegeName) {
        const colRes = await this.client.query(
          'SELECT id, name FROM colleges WHERE id = $1 LIMIT 1',
          [collegeId],
        );
        if (colRes.rows.length > 0) {
          collegeName = colRes.rows[0].name;
        }
      }

      const result = await this.client.query(
        `UPDATE departments
            SET code = $1,
                name = $2,
                college_id = $3,
                college_name = $4,
                description = $5,
                is_active = $6,
                updated_at = NOW()
          WHERE id = $7
          RETURNING *`,
        [code, name, collegeId, collegeName, desc, isActive, id],
      );

      // If department name changed, cascade references
      if (existing.name !== name) {
        await this.client.query(
          `UPDATE programs SET department_name = $1 WHERE department_id = $2 OR department_name = $3`,
          [name, id, existing.name],
        );
        await this.client.query(
          `UPDATE user_professors SET department = $1 WHERE department = $2`,
          [name, existing.name],
        );
        await this.client.query(
          `UPDATE user_staffs SET department = $1 WHERE department = $2`,
          [name, existing.name],
        );
        await this.client.query(
          `UPDATE curriculum_courses SET department_name = $1 WHERE department_id = $2 OR department_name = $3`,
          [name, id, existing.name],
        );
      }

      return SuccessHandler(
        'Department updated successfully',
        200,
        result.rows[0],
      );
    } catch (error: any) {
      if (error?.code === '23505') {
        return ErrorHandler(
          'A department with that code or name already exists.',
          409,
        );
      }
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async deleteDepartment(id: string) {
    try {
      const check = await this.client.query(
        'SELECT * FROM departments WHERE id = $1',
        [id],
      );
      if (check.rows.length === 0) {
        return ErrorHandler('Department not found', 404);
      }

      const deptName = check.rows[0].name;

      // Check if programs, professors or courses are actively tied to this department
      const [progCount, profCount, courseCount] = await Promise.all([
        this.client.query(
          'SELECT COUNT(*)::int AS count FROM programs WHERE department_id = $1 OR department_name = $2',
          [id, deptName],
        ),
        this.client.query(
          'SELECT COUNT(*)::int AS count FROM user_professors WHERE department = $1',
          [deptName],
        ),
        this.client.query(
          'SELECT COUNT(*)::int AS count FROM curriculum_courses WHERE department_id = $1 OR department_name = $2',
          [id, deptName],
        ),
      ]);

      const progs = progCount.rows[0]?.count || 0;
      const profs = profCount.rows[0]?.count || 0;
      const courses = courseCount.rows[0]?.count || 0;

      if (progs > 0 || profs > 0 || courses > 0) {
        await this.client.query(
          `UPDATE departments SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
          [id],
        );
        return SuccessHandler(
          `Department has ${progs} programs, ${profs} faculty, and ${courses} courses assigned, so it has been deactivated instead of deleted.`,
          200,
          { id, deactivated: true },
        );
      }

      await this.client.query('DELETE FROM departments WHERE id = $1', [id]);
      void this.loggerService.logSystemEvent({
        actor_label: 'Administrator',
        kind: 'alert',
        event: 'Deleted Department',
        detail: `Deleted department (${id})`,
      });
      return SuccessHandler('Department deleted successfully', 200, { id });
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  // ==============================================================
  // --- PROGRAMS ---
  // ==============================================================
  async listPrograms(activeOnly = false, dept?: string, college?: string) {
    try {
      let query = `SELECT p.* FROM programs p WHERE 1=1`;
      const params: any[] = [];

      if (activeOnly) {
        query += ` AND p.is_active = TRUE`;
      }
      if (dept) {
        params.push(dept);
        query += ` AND (p.department_name = $${params.length} OR p.department_id::text = $${params.length})`;
      }
      if (college) {
        params.push(college);
        query += ` AND (p.college_name = $${params.length} OR p.college_id::text = $${params.length})`;
      }

      query += ` ORDER BY p.name ASC`;
      const result = await this.client.query(query, params);
      return SuccessHandler('Programs fetched successfully', 200, result.rows);
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async createProgram(dto: CreateProgramDto) {
    try {
      const code = dto.code.trim().toUpperCase();
      const name = dto.name.trim();
      const desc = dto.description?.trim() || null;
      const isActive = dto.is_active !== undefined ? dto.is_active : true;

      let deptId = dto.department_id || null;
      let deptName = dto.department_name?.trim() || null;
      let collegeId = dto.college_id || null;
      let collegeName = dto.college_name?.trim() || null;

      // Look up department info if name provided
      if (deptName && !deptId) {
        const dRes = await this.client.query(
          'SELECT id, name, college_id, college_name FROM departments WHERE name = $1 LIMIT 1',
          [deptName],
        );
        if (dRes.rows.length > 0) {
          deptId = dRes.rows[0].id;
          deptName = dRes.rows[0].name;
          if (!collegeId) collegeId = dRes.rows[0].college_id;
          if (!collegeName) collegeName = dRes.rows[0].college_name;
        }
      } else if (deptId && !deptName) {
        const dRes = await this.client.query(
          'SELECT id, name, college_id, college_name FROM departments WHERE id = $1 LIMIT 1',
          [deptId],
        );
        if (dRes.rows.length > 0) {
          deptName = dRes.rows[0].name;
          if (!collegeId) collegeId = dRes.rows[0].college_id;
          if (!collegeName) collegeName = dRes.rows[0].college_name;
        }
      }

      // Look up college info if name provided
      if (collegeName && !collegeId) {
        const cRes = await this.client.query(
          'SELECT id, name FROM colleges WHERE name = $1 LIMIT 1',
          [collegeName],
        );
        if (cRes.rows.length > 0) {
          collegeId = cRes.rows[0].id;
          collegeName = cRes.rows[0].name;
        }
      } else if (collegeId && !collegeName) {
        const cRes = await this.client.query(
          'SELECT id, name FROM colleges WHERE id = $1 LIMIT 1',
          [collegeId],
        );
        if (cRes.rows.length > 0) {
          collegeName = cRes.rows[0].name;
        }
      }

      const result = await this.client.query(
        `INSERT INTO programs (code, name, department_id, department_name, college_id, college_name, description, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [code, name, deptId, deptName, collegeId, collegeName, desc, isActive],
      );

      return SuccessHandler(
        'Program created successfully',
        201,
        result.rows[0],
      );
    } catch (error: any) {
      if (error?.code === '23505') {
        return ErrorHandler(
          'A program with that code or name already exists.',
          409,
        );
      }
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async updateProgram(id: string, dto: UpdateProgramDto) {
    try {
      const current = await this.client.query(
        'SELECT * FROM programs WHERE id = $1',
        [id],
      );
      if (current.rows.length === 0) {
        return ErrorHandler('Program not found', 404);
      }

      const existing = current.rows[0];
      const code =
        dto.code !== undefined ? dto.code.trim().toUpperCase() : existing.code;
      const name = dto.name !== undefined ? dto.name.trim() : existing.name;
      const desc =
        dto.description !== undefined
          ? dto.description
            ? dto.description.trim()
            : null
          : existing.description;
      const isActive =
        dto.is_active !== undefined ? dto.is_active : existing.is_active;

      let deptId =
        dto.department_id !== undefined
          ? dto.department_id
          : existing.department_id;
      let deptName =
        dto.department_name !== undefined
          ? dto.department_name
            ? dto.department_name.trim()
            : null
          : existing.department_name;
      let collegeId =
        dto.college_id !== undefined ? dto.college_id : existing.college_id;
      let collegeName =
        dto.college_name !== undefined
          ? dto.college_name
            ? dto.college_name.trim()
            : null
          : existing.college_name;

      if (deptName && !deptId) {
        const dRes = await this.client.query(
          'SELECT id, name, college_id, college_name FROM departments WHERE name = $1 LIMIT 1',
          [deptName],
        );
        if (dRes.rows.length > 0) {
          deptId = dRes.rows[0].id;
          deptName = dRes.rows[0].name;
          if (!collegeId) collegeId = dRes.rows[0].college_id;
          if (!collegeName) collegeName = dRes.rows[0].college_name;
        }
      } else if (deptId && !deptName) {
        const dRes = await this.client.query(
          'SELECT id, name, college_id, college_name FROM departments WHERE id = $1 LIMIT 1',
          [deptId],
        );
        if (dRes.rows.length > 0) {
          deptName = dRes.rows[0].name;
          if (!collegeId) collegeId = dRes.rows[0].college_id;
          if (!collegeName) collegeName = dRes.rows[0].college_name;
        }
      }

      if (collegeName && !collegeId) {
        const cRes = await this.client.query(
          'SELECT id, name FROM colleges WHERE name = $1 LIMIT 1',
          [collegeName],
        );
        if (cRes.rows.length > 0) {
          collegeId = cRes.rows[0].id;
          collegeName = cRes.rows[0].name;
        }
      } else if (collegeId && !collegeName) {
        const cRes = await this.client.query(
          'SELECT id, name FROM colleges WHERE id = $1 LIMIT 1',
          [collegeId],
        );
        if (cRes.rows.length > 0) {
          collegeName = cRes.rows[0].name;
        }
      }

      const result = await this.client.query(
        `UPDATE programs
            SET code = $1,
                name = $2,
                department_id = $3,
                department_name = $4,
                college_id = $5,
                college_name = $6,
                description = $7,
                is_active = $8,
                updated_at = NOW()
          WHERE id = $9
          RETURNING *`,
        [
          code,
          name,
          deptId,
          deptName,
          collegeId,
          collegeName,
          desc,
          isActive,
          id,
        ],
      );

      return SuccessHandler(
        'Program updated successfully',
        200,
        result.rows[0],
      );
    } catch (error: any) {
      if (error?.code === '23505') {
        return ErrorHandler(
          'A program with that code or name already exists.',
          409,
        );
      }
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async deleteProgram(id: string) {
    try {
      const check = await this.client.query(
        'SELECT * FROM programs WHERE id = $1',
        [id],
      );
      if (check.rows.length === 0) {
        return ErrorHandler('Program not found', 404);
      }

      await this.client.query('DELETE FROM programs WHERE id = $1', [id]);
      void this.loggerService.logSystemEvent({
        actor_label: 'Administrator',
        kind: 'alert',
        event: 'Deleted Program',
        detail: `Deleted program (${id})`,
      });
      return SuccessHandler('Program deleted successfully', 200, { id });
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  // ==============================================================
  // --- ACADEMIC RANKS --- (Untouched)
  // ==============================================================
  async listRanks(activeOnly = false) {
    try {
      const query = activeOnly
        ? `SELECT r.*,
                  (SELECT COUNT(*)::int FROM user_professors up WHERE up.position = r.name) AS professor_count
             FROM academic_ranks r
            WHERE r.is_active = TRUE
            ORDER BY r.hierarchy_level ASC, r.name ASC`
        : `SELECT r.*,
                  (SELECT COUNT(*)::int FROM user_professors up WHERE up.position = r.name) AS professor_count
             FROM academic_ranks r
            ORDER BY r.hierarchy_level ASC, r.name ASC`;
      const result = await this.client.query(query);
      return SuccessHandler(
        'Academic ranks fetched successfully',
        200,
        result.rows,
      );
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async createRank(dto: CreateRankDto) {
    try {
      const name = dto.name.trim();
      const code = dto.code ? dto.code.trim().toUpperCase() : null;
      const level =
        dto.hierarchy_level !== undefined ? Number(dto.hierarchy_level) : 1;
      const desc = dto.description?.trim() || null;
      const isActive = dto.is_active !== undefined ? dto.is_active : true;

      const result = await this.client.query(
        `INSERT INTO academic_ranks (name, code, hierarchy_level, description, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name, code, level, desc, isActive],
      );

      return SuccessHandler(
        'Academic rank created successfully',
        201,
        result.rows[0],
      );
    } catch (error: any) {
      if (error?.code === '23505') {
        return ErrorHandler(
          'An academic rank with that name already exists.',
          409,
        );
      }
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async updateRank(id: string, dto: UpdateRankDto) {
    try {
      const current = await this.client.query(
        'SELECT * FROM academic_ranks WHERE id = $1',
        [id],
      );
      if (current.rows.length === 0) {
        return ErrorHandler('Academic rank not found', 404);
      }

      const existing = current.rows[0];
      const name = dto.name !== undefined ? dto.name.trim() : existing.name;
      const code =
        dto.code !== undefined
          ? dto.code
            ? dto.code.trim().toUpperCase()
            : null
          : existing.code;
      const level =
        dto.hierarchy_level !== undefined
          ? Number(dto.hierarchy_level)
          : existing.hierarchy_level;
      const desc =
        dto.description !== undefined
          ? dto.description
            ? dto.description.trim()
            : null
          : existing.description;
      const isActive =
        dto.is_active !== undefined ? dto.is_active : existing.is_active;

      const result = await this.client.query(
        `UPDATE academic_ranks
            SET name = $1,
                code = $2,
                hierarchy_level = $3,
                description = $4,
                is_active = $5,
                updated_at = NOW()
          WHERE id = $6
          RETURNING *`,
        [name, code, level, desc, isActive, id],
      );

      // If rank name changed, cascade to user_professors position
      if (existing.name !== name) {
        await this.client.query(
          `UPDATE user_professors SET position = $1 WHERE position = $2`,
          [name, existing.name],
        );
      }

      return SuccessHandler(
        'Academic rank updated successfully',
        200,
        result.rows[0],
      );
    } catch (error: any) {
      if (error?.code === '23505') {
        return ErrorHandler(
          'An academic rank with that name already exists.',
          409,
        );
      }
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async deleteRank(id: string) {
    try {
      const check = await this.client.query(
        'SELECT * FROM academic_ranks WHERE id = $1',
        [id],
      );
      if (check.rows.length === 0) {
        return ErrorHandler('Academic rank not found', 404);
      }

      const rankName = check.rows[0].name;

      const profCount = await this.client.query(
        'SELECT COUNT(*)::int AS count FROM user_professors WHERE position = $1',
        [rankName],
      );
      const profs = profCount.rows[0]?.count || 0;

      if (profs > 0) {
        await this.client.query(
          `UPDATE academic_ranks SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
          [id],
        );
        return SuccessHandler(
          `Rank has ${profs} faculty holding this title, so it has been deactivated instead of deleted.`,
          200,
          { id, deactivated: true },
        );
      }

      await this.client.query('DELETE FROM academic_ranks WHERE id = $1', [id]);
      void this.loggerService.logSystemEvent({
        actor_label: 'Administrator',
        kind: 'alert',
        event: 'Deleted Academic Rank',
        detail: `Deleted academic rank (${id})`,
      });
      return SuccessHandler('Academic rank deleted successfully', 200, { id });
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  // ==============================================================
  // --- COURSES --- (Untouched)
  // ==============================================================
  async listCourses(dept?: string) {
    try {
      const query = dept
        ? `SELECT c.*,
                  (SELECT COUNT(*)::int FROM user_professors up WHERE up.department = c.department_name) AS professor_count
             FROM curriculum_courses c
            WHERE c.department_name = $1
            ORDER BY c.code ASC`
        : `SELECT c.*,
                  (SELECT COUNT(*)::int FROM user_professors up WHERE up.department = c.department_name) AS professor_count
             FROM curriculum_courses c
            ORDER BY c.code ASC`;
      const params = dept ? [dept] : [];
      const result = await this.client.query(query, params);
      return SuccessHandler('Courses fetched successfully', 200, result.rows);
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async createCourse(dto: CreateCourseDto) {
    try {
      const code = dto.code.trim().toUpperCase();
      const title = dto.title.trim();
      const deptName = dto.department_name?.trim() || null;
      const deptId = dto.department_id || null;
      const units = dto.units !== undefined ? Number(dto.units) : 3;
      const desc = dto.description?.trim() || null;
      const isActive = dto.is_active !== undefined ? dto.is_active : true;

      const result = await this.client.query(
        `INSERT INTO curriculum_courses (code, title, department_id, department_name, units, description, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [code, title, deptId, deptName, units, desc, isActive],
      );

      return SuccessHandler('Course created successfully', 201, result.rows[0]);
    } catch (error: any) {
      if (error?.code === '23505') {
        return ErrorHandler('A course with that code already exists.', 409);
      }
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async updateCourse(id: string, dto: UpdateCourseDto) {
    try {
      const current = await this.client.query(
        'SELECT * FROM curriculum_courses WHERE id = $1',
        [id],
      );
      if (current.rows.length === 0) {
        return ErrorHandler('Course not found', 404);
      }

      const existing = current.rows[0];
      const code =
        dto.code !== undefined ? dto.code.trim().toUpperCase() : existing.code;
      const title = dto.title !== undefined ? dto.title.trim() : existing.title;
      const deptName =
        dto.department_name !== undefined
          ? dto.department_name
            ? dto.department_name.trim()
            : null
          : existing.department_name;
      const deptId =
        dto.department_id !== undefined
          ? dto.department_id
          : existing.department_id;
      const units =
        dto.units !== undefined ? Number(dto.units) : existing.units;
      const desc =
        dto.description !== undefined
          ? dto.description
            ? dto.description.trim()
            : null
          : existing.description;
      const isActive =
        dto.is_active !== undefined ? dto.is_active : existing.is_active;

      const result = await this.client.query(
        `UPDATE curriculum_courses
            SET code = $1,
                title = $2,
                department_id = $3,
                department_name = $4,
                units = $5,
                description = $6,
                is_active = $7,
                updated_at = NOW()
          WHERE id = $8
          RETURNING *`,
        [code, title, deptId, deptName, units, desc, isActive, id],
      );

      return SuccessHandler('Course updated successfully', 200, result.rows[0]);
    } catch (error: any) {
      if (error?.code === '23505') {
        return ErrorHandler('A course with that code already exists.', 409);
      }
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async deleteCourse(id: string) {
    try {
      const check = await this.client.query(
        'SELECT * FROM curriculum_courses WHERE id = $1',
        [id],
      );
      if (check.rows.length === 0) {
        return ErrorHandler('Course not found', 404);
      }

      await this.client.query('DELETE FROM curriculum_courses WHERE id = $1', [
        id,
      ]);
      void this.loggerService.logSystemEvent({
        actor_label: 'Administrator',
        kind: 'alert',
        event: 'Deleted Course',
        detail: `Deleted course (${id})`,
      });
      return SuccessHandler('Course deleted successfully', 200, { id });
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }
}

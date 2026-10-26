import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import {
  CreateCourseDto,
  CreateDepartmentDto,
  CreateRankDto,
  UpdateCourseDto,
  UpdateDepartmentDto,
  UpdateRankDto,
} from './dto/curriculum.dto';

@Injectable()
export class CurriculumService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get client() {
    return this.databaseService.getClient();
  }

  // --- OVERVIEW ---
  async getOverview() {
    try {
      const [departmentsRes, ranksRes, coursesRes, countsRes] = await Promise.all([
        this.client.query(`
          SELECT d.*,
                 (SELECT COUNT(*)::int FROM user_professors up WHERE up.department = d.name) AS professor_count,
                 (SELECT COUNT(*)::int FROM user_staffs us WHERE us.department = d.name) AS staff_count
            FROM departments d
           ORDER BY d.name ASC
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
            (SELECT COUNT(*)::int FROM departments) AS total_departments,
            (SELECT COUNT(*)::int FROM departments WHERE is_active = TRUE) AS active_departments,
            (SELECT COUNT(*)::int FROM academic_ranks) AS total_ranks,
            (SELECT COUNT(*)::int FROM academic_ranks WHERE is_active = TRUE) AS active_ranks,
            (SELECT COUNT(*)::int FROM curriculum_courses) AS total_courses,
            (SELECT COUNT(*)::int FROM user_professors) AS total_professors
        `),
      ]);

      return SuccessHandler('Successfully fetched curriculum data', 200, {
        departments: departmentsRes.rows,
        ranks: ranksRes.rows,
        courses: coursesRes.rows,
        stats: countsRes.rows[0] ?? {
          total_departments: 0,
          active_departments: 0,
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

  // --- DEPARTMENTS ---
  async listDepartments(activeOnly = false) {
    try {
      const query = activeOnly
        ? `SELECT d.*,
                  (SELECT COUNT(*)::int FROM user_professors up WHERE up.department = d.name) AS professor_count
             FROM departments d
            WHERE d.is_active = TRUE
            ORDER BY d.name ASC`
        : `SELECT d.*,
                  (SELECT COUNT(*)::int FROM user_professors up WHERE up.department = d.name) AS professor_count
             FROM departments d
            ORDER BY d.name ASC`;
      const result = await this.client.query(query);
      return SuccessHandler('Departments fetched successfully', 200, result.rows);
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

      const result = await this.client.query(
        `INSERT INTO departments (code, name, description, is_active)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [code, name, desc, isActive],
      );

      return SuccessHandler('Department created successfully', 201, result.rows[0]);
    } catch (error: any) {
      if (error?.code === '23505') {
        return ErrorHandler('A department with that code or name already exists.', 409);
      }
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto) {
    try {
      const current = await this.client.query('SELECT * FROM departments WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        return ErrorHandler('Department not found', 404);
      }

      const existing = current.rows[0];
      const code = dto.code !== undefined ? dto.code.trim().toUpperCase() : existing.code;
      const name = dto.name !== undefined ? dto.name.trim() : existing.name;
      const desc = dto.description !== undefined ? (dto.description ? dto.description.trim() : null) : existing.description;
      const isActive = dto.is_active !== undefined ? dto.is_active : existing.is_active;

      const result = await this.client.query(
        `UPDATE departments
            SET code = $1,
                name = $2,
                description = $3,
                is_active = $4,
                updated_at = NOW()
          WHERE id = $5
          RETURNING *`,
        [code, name, desc, isActive, id],
      );

      // If department name changed, optionally update user_professors and user_staffs department reference
      if (existing.name !== name) {
        await this.client.query(
          `UPDATE user_professors SET department = $1 WHERE department = $2`,
          [name, existing.name],
        );
        await this.client.query(
          `UPDATE user_staffs SET department = $1 WHERE department = $2`,
          [name, existing.name],
        );
        await this.client.query(
          `UPDATE curriculum_courses SET department_name = $1 WHERE department_name = $2`,
          [name, existing.name],
        );
      }

      return SuccessHandler('Department updated successfully', 200, result.rows[0]);
    } catch (error: any) {
      if (error?.code === '23505') {
        return ErrorHandler('A department with that code or name already exists.', 409);
      }
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async deleteDepartment(id: string) {
    try {
      const check = await this.client.query('SELECT * FROM departments WHERE id = $1', [id]);
      if (check.rows.length === 0) {
        return ErrorHandler('Department not found', 404);
      }

      const deptName = check.rows[0].name;

      // Check if professors or courses are actively tied to this department
      const [profCount, courseCount] = await Promise.all([
        this.client.query('SELECT COUNT(*)::int AS count FROM user_professors WHERE department = $1', [deptName]),
        this.client.query('SELECT COUNT(*)::int AS count FROM curriculum_courses WHERE department_id = $1 OR department_name = $2', [id, deptName]),
      ]);

      const profs = profCount.rows[0]?.count || 0;
      const courses = courseCount.rows[0]?.count || 0;

      if (profs > 0 || courses > 0) {
        // Soft delete / deactivate instead of hard delete to preserve referential integrity, or inform user
        await this.client.query(
          `UPDATE departments SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
          [id],
        );
        return SuccessHandler(
          `Department has ${profs} faculty and ${courses} courses assigned, so it has been deactivated instead of deleted.`,
          200,
          { id, deactivated: true },
        );
      }

      await this.client.query('DELETE FROM departments WHERE id = $1', [id]);
      return SuccessHandler('Department deleted successfully', 200, { id });
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  // --- ACADEMIC RANKS ---
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
      return SuccessHandler('Academic ranks fetched successfully', 200, result.rows);
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async createRank(dto: CreateRankDto) {
    try {
      const name = dto.name.trim();
      const code = dto.code?.trim().toUpperCase() || null;
      const level = dto.hierarchy_level !== undefined ? Number(dto.hierarchy_level) : 1;
      const desc = dto.description?.trim() || null;
      const isActive = dto.is_active !== undefined ? dto.is_active : true;

      const result = await this.client.query(
        `INSERT INTO academic_ranks (name, code, hierarchy_level, description, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name, code, level, desc, isActive],
      );

      return SuccessHandler('Academic rank created successfully', 201, result.rows[0]);
    } catch (error: any) {
      if (error?.code === '23505') {
        return ErrorHandler('An academic rank with that name already exists.', 409);
      }
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async updateRank(id: string, dto: UpdateRankDto) {
    try {
      const current = await this.client.query('SELECT * FROM academic_ranks WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        return ErrorHandler('Academic rank not found', 404);
      }

      const existing = current.rows[0];
      const name = dto.name !== undefined ? dto.name.trim() : existing.name;
      const code = dto.code !== undefined ? (dto.code ? dto.code.trim().toUpperCase() : null) : existing.code;
      const level = dto.hierarchy_level !== undefined ? Number(dto.hierarchy_level) : existing.hierarchy_level;
      const desc = dto.description !== undefined ? (dto.description ? dto.description.trim() : null) : existing.description;
      const isActive = dto.is_active !== undefined ? dto.is_active : existing.is_active;

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

      // If rank name changed, update professors who had this position
      if (existing.name !== name) {
        await this.client.query(
          `UPDATE user_professors SET position = $1 WHERE position = $2`,
          [name, existing.name],
        );
      }

      return SuccessHandler('Academic rank updated successfully', 200, result.rows[0]);
    } catch (error: any) {
      if (error?.code === '23505') {
        return ErrorHandler('An academic rank with that name already exists.', 409);
      }
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  async deleteRank(id: string) {
    try {
      const check = await this.client.query('SELECT * FROM academic_ranks WHERE id = $1', [id]);
      if (check.rows.length === 0) {
        return ErrorHandler('Academic rank not found', 404);
      }

      const rankName = check.rows[0].name;

      // Check if professors have this rank
      const profCount = await this.client.query(
        'SELECT COUNT(*)::int AS count FROM user_professors WHERE position = $1',
        [rankName],
      );
      const profs = profCount.rows[0]?.count || 0;

      if (profs > 0) {
        // Deactivate instead of delete to protect historical data
        await this.client.query(
          `UPDATE academic_ranks SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
          [id],
        );
        return SuccessHandler(
          `Rank has ${profs} faculty members assigned, so it has been deactivated instead of deleted.`,
          200,
          { id, deactivated: true },
        );
      }

      await this.client.query('DELETE FROM academic_ranks WHERE id = $1', [id]);
      return SuccessHandler('Academic rank deleted successfully', 200, { id });
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }

  // --- COURSES ---
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
      const current = await this.client.query('SELECT * FROM curriculum_courses WHERE id = $1', [id]);
      if (current.rows.length === 0) {
        return ErrorHandler('Course not found', 404);
      }

      const existing = current.rows[0];
      const code = dto.code !== undefined ? dto.code.trim().toUpperCase() : existing.code;
      const title = dto.title !== undefined ? dto.title.trim() : existing.title;
      const deptName = dto.department_name !== undefined ? (dto.department_name ? dto.department_name.trim() : null) : existing.department_name;
      const deptId = dto.department_id !== undefined ? dto.department_id : existing.department_id;
      const units = dto.units !== undefined ? Number(dto.units) : existing.units;
      const desc = dto.description !== undefined ? (dto.description ? dto.description.trim() : null) : existing.description;
      const isActive = dto.is_active !== undefined ? dto.is_active : existing.is_active;

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
      const check = await this.client.query('SELECT * FROM curriculum_courses WHERE id = $1', [id]);
      if (check.rows.length === 0) {
        return ErrorHandler('Course not found', 404);
      }

      await this.client.query('DELETE FROM curriculum_courses WHERE id = $1', [id]);
      return SuccessHandler('Course deleted successfully', 200, { id });
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500)
        : ErrorHandler('Server Error', 500);
    }
  }
}


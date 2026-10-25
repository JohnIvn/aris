import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { DatabaseService } from '../database/database.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { CreateProfessorDto } from './dto/professor.dto';

@Injectable()
export class ProfessorsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async fetchProfessors() {
    try {
      const result = await this.databaseService.getClient().query(`
        SELECT id, employee_id, username, firstname, middlename, lastname, email,
               avatar_url, birthday, age, gender, position, department, provider,
               is_banned, created_at, updated_at
          FROM user_professors
         ORDER BY lastname ASC, firstname ASC, id ASC
      `);
      return SuccessHandler('Successfully Fetched Professors', 200, result.rows);
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500, error.name)
        : ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async createProfessor(data: CreateProfessorDto) {
    try {
      const email = data.email.trim().toLowerCase();
      const passwordHash = await argon2.hash(data.password);
      const result = await this.databaseService.getClient().query(
        `INSERT INTO user_professors
          (employee_id, username, firstname, middlename, lastname, email, password_hash,
           position, department, provider, is_banned)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, employee_id, username, firstname, middlename, lastname, email,
                   avatar_url, birthday, age, gender, position, department, provider,
                   is_banned, created_at, updated_at`,
        [
          data.employee_id.trim(),
          data.username.trim(),
          data.firstname.trim(),
          data.middlename?.trim() || null,
          data.lastname.trim(),
          email,
          passwordHash,
          data.position?.trim() || null,
          data.department?.trim() || null,
          data.provider ?? 'local',
          data.active === false,
        ],
      );
      return SuccessHandler('Successfully Created Professor', 201, result.rows[0]);
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 400, error.name)
        : ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async updateStatus(id: string, active: boolean) {
    try {
      const result = await this.databaseService.getClient().query(
        `UPDATE user_professors
            SET is_banned = $1, updated_at = NOW()
          WHERE id = $2
          RETURNING id, email, is_banned, updated_at`,
        [!active, id],
      );
      if (!result.rowCount) return ErrorHandler('Professor not found', 404);
      return SuccessHandler(
        'Successfully Updated Professor Status',
        200,
        result.rows[0],
      );
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500, error.name)
        : ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
}

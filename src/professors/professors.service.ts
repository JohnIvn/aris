import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';

@Injectable()
export class ProfessorsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async fetchProfessors() {
    try {
      const result = await this.databaseService.getClient().query(`
        SELECT
          id,
          employee_id,
          username,
          firstname,
          middlename,
          lastname,
          email,
          avatar_url,
          birthday,
          age,
          gender,
          position,
          department,
          provider,
          created_at,
          updated_at
        FROM user_professors
        ORDER BY lastname ASC, firstname ASC, id ASC
      `);

      return SuccessHandler(
        'Successfully Fetched Professors',
        200,
        result.rows,
      );
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
}

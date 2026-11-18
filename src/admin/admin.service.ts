import { Injectable } from '@nestjs/common';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AdminService {
  constructor(private readonly databaseServie: DatabaseService) {}

  private get db() {
    return this.databaseServie.getClient();
  }

  async fetchUsers() {
    try {
      const professor_response = await this.db.query(`
        SELECT id, employee_id, username, firstname, lastname, email, position, department 
        FROM user_professors
        WHERE id NOT IN (SELECT professor_id FROM dtr_biometrics)`);

      const staff_response = await this.db.query(`
            SELECT id, employee_id, username, firstname, lastname, email, position, department 
            FROM user_staffs
            WHERE id NOT IN (SELECT staff_id FROM dtr_biometrics)`);

      return SuccessHandler('Successfully Fetched Professrs', 200, {
        professors: professor_response.rows,
        staffs: staff_response.rows,
      });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
}

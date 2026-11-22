import { Injectable } from '@nestjs/common';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { DatabaseService } from '../database/database.service';

export type FetchUsersFor = 'authenticator' | 'biometrics';

@Injectable()
export class AdminService {
  constructor(private readonly databaseServie: DatabaseService) {}

  private get db() {
    return this.databaseServie.getClient();
  }

  async fetchUsers(target: FetchUsersFor = 'authenticator') {
    try {
      const linkTable =
        target === 'biometrics' ? 'user_id_biometrics' : 'dtr_biometrics';

      const professor_response = await this.db.query(`
        SELECT id, employee_id, username, firstname, lastname, email, position, department
        FROM user_professors p
        WHERE NOT EXISTS (SELECT 1 FROM ${linkTable} b WHERE b.professor_id = p.id)`);

      const staff_response = await this.db.query(`
        SELECT id, employee_id, username, firstname, lastname, email, position, department
        FROM user_staffs s
        WHERE NOT EXISTS (SELECT 1 FROM ${linkTable} b WHERE b.staff_id = s.id)`);

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

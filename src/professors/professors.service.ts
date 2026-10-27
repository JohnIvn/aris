import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { DatabaseService } from '../database/database.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { CreateProfessorDto, UpdateProfessorDto } from './dto/professor.dto';
import { OAuthService } from '../auth/oauth.service';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class ProfessorsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly oauthService: OAuthService,
    private readonly loggerService: LoggerService,
  ) {}

  async fetchProfessors() {
    try {
      const result = await this.databaseService.getClient().query(`
        SELECT id, employee_id, username, firstname, middlename, lastname, email,
               avatar_url, birthday, age, gender, position, department, provider,
               is_banned, phone, address, created_at, updated_at
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
      let email = data.email.trim().toLowerCase();
      let firstname = data.firstname.trim();
      let lastname = data.lastname.trim();
      let avatarUrl: string | null = null;
      let passwordHash: string | null = null;
      if (data.provider === 'google') {
        if (!data.oauth_id_token) throw new Error('A verified Google account is required.');
        const profile = await this.oauthService.verifyGoogleToken(data.oauth_id_token);
        if (!profile) throw new Error('The Google account could not be verified.');
        email = profile.email;
        firstname = profile.firstname;
        lastname = profile.lastname;
        avatarUrl = profile.avatar_url;
      } else {
        if (!data.password) throw new Error('Password is required for a local account.');
        passwordHash = await argon2.hash(data.password);
      }
      const result = await this.databaseService.getClient().query(
        `INSERT INTO user_professors
          (employee_id, username, firstname, middlename, lastname, email, password_hash,
           avatar_url, position, department, provider, is_banned)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id, employee_id, username, firstname, middlename, lastname, email,
                   avatar_url, birthday, age, gender, position, department, provider,
                   is_banned, created_at, updated_at`,
        [
          data.employee_id.trim(),
          data.username.trim(),
          firstname,
          data.middlename?.trim() || null,
          lastname,
          email,
          passwordHash,
          avatarUrl,
          data.position?.trim() || null,
          data.department?.trim() || null,
          data.provider ?? 'local',
          data.active === false,
        ],
      );
      void this.loggerService.logSystemEvent({
        actor_label: 'Administrator',
        kind: 'security',
        event: 'Added Professor',
        detail: `Created professor ${firstname} ${lastname} (${email})${data.department ? ` · ${data.department}` : ''}`,
      });
      return SuccessHandler('Successfully Created Professor', 201, result.rows[0]);
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 400, error.name)
        : ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async updateProfessor(id: string, data: UpdateProfessorDto) {
    try {
      const existing = await this.databaseService.getClient().query(
        `SELECT * FROM user_professors WHERE id = $1`,
        [id],
      );
      if (existing.rowCount === 0) return ErrorHandler('Professor not found', 404);
      const current = existing.rows[0];

      const employeeId = data.employee_id !== undefined ? data.employee_id.trim() : current.employee_id;
      const firstname = data.firstname !== undefined ? data.firstname.trim() : current.firstname;
      const middlename = data.middlename !== undefined ? (data.middlename?.trim() || null) : current.middlename;
      const lastname = data.lastname !== undefined ? data.lastname.trim() : current.lastname;
      const email = data.email !== undefined ? data.email.trim().toLowerCase() : current.email;
      const position = data.position !== undefined ? (data.position?.trim() || null) : current.position;
      const department = data.department !== undefined ? (data.department?.trim() || null) : current.department;
      const isBanned = data.active !== undefined ? !data.active : current.is_banned;
      const phone = data.phone !== undefined ? (data.phone?.trim() || null) : (current.phone || null);
      const address = data.address !== undefined ? (data.address?.trim() || null) : (current.address || null);

      const result = await this.databaseService.getClient().query(
        `UPDATE user_professors
            SET employee_id = $1,
                firstname = $2,
                middlename = $3,
                lastname = $4,
                email = $5,
                position = $6,
                department = $7,
                is_banned = $8,
                phone = $9,
                address = $10,
                updated_at = NOW()
          WHERE id = $11
          RETURNING id, employee_id, username, firstname, middlename, lastname, email,
                    avatar_url, birthday, age, gender, position, department, provider,
                    is_banned, phone, address, created_at, updated_at`,
        [
          employeeId,
          firstname,
          middlename,
          lastname,
          email,
          position,
          department,
          isBanned,
          phone,
          address,
          id,
        ],
      );

      void this.loggerService.logSystemEvent({
        actor_label: 'Administrator',
        kind: 'security',
        event: 'Modified Professor',
        detail: `Updated professor ${firstname} ${lastname} (${email})`,
      });
      return SuccessHandler('Successfully Updated Professor', 200, result.rows[0]);
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
      void this.loggerService.logSystemEvent({
        actor_label: 'Administrator',
        kind: active ? 'security' : 'alert',
        event: active ? 'Activated Professor' : 'Deactivated Professor',
        detail: `${active ? 'Restored access for' : 'Deactivated/banned access for'} professor ID ${id}`,
      });
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

  async deleteProfessor(id: string) {
    try {
      const result = await this.databaseService.getClient().query(
        `DELETE FROM user_professors WHERE id = $1 RETURNING id`,
        [id],
      );
      if (!result.rowCount) return ErrorHandler('Professor not found', 404);
      void this.loggerService.logSystemEvent({
        actor_label: 'Administrator',
        kind: 'alert',
        event: 'Deleted Professor',
        detail: `Permanently deleted professor record (${id})`,
      });
      return SuccessHandler('Successfully Deleted Professor', 200, result.rows[0]);
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500, error.name)
        : ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
}

import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MultipartFile } from '@fastify/multipart';
import type { FastifyReply } from 'fastify';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';
import type { UserSession } from '../lib/data/interfaces';
import { USER_ROLE_TABLES } from '../lib/data/types';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';

@Injectable()
export class UserSettingsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly loggerService: LoggerService,
  ) {}

  private get db() {
    return this.databaseService.getClient();
  }

  private table(user: UserSession) {
    return USER_ROLE_TABLES[user.role];
  }

  async getProfile(user: UserSession) {
    try {
      const result = await this.db.query(
        `SELECT id, firstname, lastname, email, avatar_url, position, department,
                phone, created_at
         FROM ${this.table(user)} WHERE id = $1`,
        [user.id],
      );
      if (!result.rows[0]) return this.invalid('User profile not found', 404);
      return result.rows[0];
    } catch (error) {
      return this.error(error);
    }
  }

  async updateProfile(user: UserSession, data: Record<string, unknown>) {
    try {
      const values = {
        firstname: this.text(data.firstName),
        lastname: this.text(data.lastName),
        email: this.text(data.email),
        phone: this.text(data.phone),
      };
      if (!values.firstname || !values.lastname || !values.email) {
        return this.invalid('First name, last name, and email are required');
      }
      const result = await this.db.query(
        `UPDATE ${this.table(user)}
         SET firstname = $1, lastname = $2, email = $3, phone = $4, updated_at = NOW()
         WHERE id = $5
         RETURNING id, firstname, lastname, email, avatar_url, phone`,
        [values.firstname, values.lastname, values.email, values.phone, user.id],
      );
      if (!result.rows[0]) return this.invalid('User profile not found', 404);
      return SuccessHandler('Profile updated successfully', 200, result.rows[0]);
    } catch (error) {
      return this.error(error);
    }
  }

  async changePassword(user: UserSession, data: Record<string, unknown>) {
    try {
      const password = this.text(data.password);
      const confirmation = this.text(data.confirmPassword);
      if (!password || password.length < 8) return this.invalid('Password must be at least 8 characters');
      if (password !== confirmation) return this.invalid('Passwords do not match');
      const result = await this.db.query<{ password_hash: string | null }>(
        `SELECT password_hash FROM ${this.table(user)} WHERE id = $1`,
        [user.id],
      );
      if (!result.rows[0]) return this.invalid('User not found', 404);
      await this.db.query(
        `UPDATE ${this.table(user)} SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [await argon2.hash(password), user.id],
      );
      return SuccessHandler('Password updated successfully', 200, null);
    } catch (error) {
      return this.error(error);
    }
  }

  async getPreferences(user: UserSession) {
    const result = await this.db.query(
      `SELECT desktop, weekly, mentions FROM user_preferences WHERE user_id = $1`,
      [user.id],
    );
    return result.rows[0] ?? { desktop: true, weekly: true, mentions: false };
  }

  async updatePreferences(user: UserSession, data: Record<string, unknown>) {
    const values = [data.desktop, data.weekly, data.mentions];
    if (values.some((value) => typeof value !== 'boolean')) {
      return this.invalid('Notification preferences must be boolean values');
    }
    const result = await this.db.query(
      `INSERT INTO user_preferences (user_id, desktop, weekly, mentions)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET desktop = EXCLUDED.desktop,
         weekly = EXCLUDED.weekly, mentions = EXCLUDED.mentions, updated_at = NOW()
       RETURNING desktop, weekly, mentions`,
      [user.id, data.desktop, data.weekly, data.mentions],
    );
    return SuccessHandler('Preferences updated successfully', 200, result.rows[0]);
  }

  async savePhoto(user: UserSession, file: MultipartFile) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) return this.invalid('Only JPG, PNG, and WEBP photos are supported');
    const content = await file.toBuffer();
    const limitResult = await this.db.query<{ setting_value: string }>(
      `SELECT setting_value FROM system_settings
       WHERE setting_key = 'maxUploadMb' LIMIT 1`,
    );
    const maxUploadMb = Math.min(6, Math.max(1, Number(limitResult.rows[0]?.setting_value ?? 6)));
    if (content.length > maxUploadMb * 1024 * 1024) {
      return this.invalid(`Photo must be ${maxUploadMb} MB or smaller`);
    }
    const extension = file.mimetype.split('/')[1];
    const directory = join(process.cwd(), 'uploads', 'photos');
    const filename = `${user.id}.${extension}`;
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, filename), content);
    const url = `/users/me/photo?rev=${Date.now()}`;
    await this.db.query(
      `UPDATE ${this.table(user)} SET avatar_url = $1, updated_at = NOW() WHERE id = $2`,
      [url, user.id],
    );
    return SuccessHandler('Photo updated successfully', 200, { avatar_url: url });
  }

  async sendPhoto(user: UserSession, reply: FastifyReply) {
    const result = await this.db.query<{ avatar_url: string | null }>(
      `SELECT avatar_url FROM ${this.table(user)} WHERE id = $1`,
      [user.id],
    );
    const url = result.rows[0]?.avatar_url;
    if (!url) return reply.code(404).send({ message: 'Photo not found' });
    const extension = url.split('?')[0].split('.').pop();
    const content = await readFile(join(process.cwd(), 'uploads', 'photos', `${user.id}.${extension}`));
    return reply.type(`image/${extension}`).send(content);
  }

  invalid(message: string, status = 400) {
    return ErrorHandler(message, status);
  }

  private text(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private error(error: unknown) {
    return this.invalid(error instanceof Error ? error.message : 'Server Error', 500);
  }
}

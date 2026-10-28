import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { MultipartFile } from '@fastify/multipart';
import type { FastifyReply } from 'fastify';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';
import type { UserSession } from '../lib/data/interfaces';
import { USER_ROLE_TABLES } from '../lib/data/types';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';

@Injectable()
export class UserSettingsService {
  private readonly logger = new Logger(UserSettingsService.name);

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

  private getSupabase(): SupabaseClient {
    const url = process.env.SUPABASE_URL ?? process.env.DATABASE_REST_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.DATABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured');
    }

    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }

  private async getBucketName(supabase: SupabaseClient): Promise<string> {
    if (process.env.SUPABASE_PHOTO_BUCKET) {
      return process.env.SUPABASE_PHOTO_BUCKET;
    }
    if (process.env.SUPABASE_STORAGE_BUCKET) {
      return process.env.SUPABASE_STORAGE_BUCKET;
    }
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      if (buckets && buckets.length > 0) {
        const found = buckets.find((b) => b.name === 'photos' || b.name === 'avatars');
        if (found) return found.name;
      }
    } catch {
      // ignore bucket listing errors
    }
    return 'photos';
  }

  private async ensureBucket(supabase: SupabaseClient, bucketName: string) {
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      const exists = buckets?.some((b) => b.name === bucketName);
      if (!exists) {
        await supabase.storage.createBucket(bucketName, {
          public: true,
          fileSizeLimit: '6MB',
        });
      }
    } catch {
      // ignore bucket creation errors
    }
  }

  async getProfile(user: UserSession) {
    try {
      const result = await this.db.query(
        `SELECT id, employee_id, firstname, middlename, lastname, email, avatar_url, position, department,
                phone, address, provider, created_at
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
      const firstname = this.text(data.firstname ?? data.firstName);
      const middlename = this.text(data.middlename ?? data.middleName) || null;
      const lastname = this.text(data.lastname ?? data.lastName);
      const email = this.text(data.email).toLowerCase();
      const phone = this.text(data.phone) || null;
      const address = this.text(data.address) || null;
      const department = this.text(data.department) || null;
      const password = this.text(data.password);

      if (!firstname || !lastname || !email) {
        return this.invalid('First name, last name, and email are required');
      }

      let passwordClause = '';
      const params: any[] = [firstname, middlename, lastname, email, phone, address, department];
      if (password && password.length >= 8) {
        const hash = await argon2.hash(password);
        params.push(hash);
        passwordClause = `, password_hash = $${params.length}`;
      }
      params.push(user.id);

      const result = await this.db.query(
        `UPDATE ${this.table(user)}
         SET firstname = $1,
             middlename = $2,
             lastname = $3,
             email = $4,
             phone = $5,
             address = $6,
             department = $7
             ${passwordClause},
             updated_at = NOW()
         WHERE id = $${params.length}
         RETURNING id, employee_id, firstname, middlename, lastname, email, avatar_url, position, department, phone, address, provider`,
        params,
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
    try {
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(file.mimetype)) {
        return this.invalid('Only JPG, PNG, and WEBP photos are supported');
      }
      const content = await file.toBuffer();
      const limitResult = await this.db.query<{ setting_value: string }>(
        `SELECT setting_value FROM system_settings
         WHERE setting_key = 'maxUploadMb' LIMIT 1`,
      );
      const maxUploadMb = Math.min(6, Math.max(1, Number(limitResult.rows[0]?.setting_value ?? 6)));
      if (content.length > maxUploadMb * 1024 * 1024) {
        return this.invalid(`Photo must be ${maxUploadMb} MB or smaller`);
      }

      const supabase = this.getSupabase();
      const bucket = await this.getBucketName(supabase);
      await this.ensureBucket(supabase, bucket);

      const extension = file.mimetype.split('/')[1] === 'jpeg' ? 'jpg' : file.mimetype.split('/')[1];
      const filename = `${user.id}.${extension}`;

      // Clean up previous files with different extensions for this user
      const possibleExtensions = ['jpg', 'jpeg', 'png', 'webp'];
      const filesToRemove = possibleExtensions
        .filter((ext) => ext !== extension)
        .map((ext) => `${user.id}.${ext}`);
      try {
        await supabase.storage.from(bucket).remove(filesToRemove);
      } catch {
        // ignore cleanup error
      }

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filename, content, {
          contentType: file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        this.logger.error(`Failed to upload photo to Supabase storage: ${uploadError.message}`);
        return this.invalid(`Photo upload failed: ${uploadError.message}`, 500);
      }

      const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filename);
      const photoUrl = `${publicUrlData.publicUrl}?rev=${Date.now()}`;

      await this.db.query(
        `UPDATE ${this.table(user)} SET avatar_url = $1, updated_at = NOW() WHERE id = $2`,
        [photoUrl, user.id],
      );

      return SuccessHandler('Photo updated successfully', 200, { avatar_url: photoUrl });
    } catch (error) {
      return this.error(error);
    }
  }

  async sendPhoto(user: UserSession, reply: FastifyReply) {
    try {
      const result = await this.db.query<{ avatar_url: string | null }>(
        `SELECT avatar_url FROM ${this.table(user)} WHERE id = $1`,
        [user.id],
      );
      const url = result.rows[0]?.avatar_url;
      if (!url) return reply.code(404).send({ message: 'Photo not found' });

      // If it's a full URL (Supabase public URL or OAuth provider image), redirect to it
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return reply.redirect(url, 302);
      }

      // If an existing local file exists on disk (backwards compatibility), serve it
      const extension = url.split('?')[0].split('.').pop();
      const localPath = join(process.cwd(), 'uploads', 'photos', `${user.id}.${extension}`);
      if (existsSync(localPath)) {
        const content = await readFile(localPath);
        return reply.type(`image/${extension}`).send(content);
      }

      // Otherwise attempt to download from Supabase storage bucket
      const supabase = this.getSupabase();
      const bucket = await this.getBucketName(supabase);
      const { data: files } = await supabase.storage.from(bucket).list('', {
        search: user.id,
      });
      const file = files?.find((f) => f.name.startsWith(user.id));
      if (!file) return reply.code(404).send({ message: 'Photo not found' });

      const { data, error } = await supabase.storage.from(bucket).download(file.name);
      if (error || !data) return reply.code(404).send({ message: 'Photo not found' });

      const buffer = Buffer.from(await data.arrayBuffer());
      return reply.type(data.type || `image/${extension}`).send(buffer);
    } catch (error) {
      return reply.code(500).send({
        message: error instanceof Error ? error.message : 'Server Error',
      });
    }
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

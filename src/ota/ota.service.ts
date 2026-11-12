import { Injectable, Logger } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MultipartFile } from '@fastify/multipart';
import type { UserSession } from '../lib/data/interfaces';
import { DatabaseService } from '../database/database.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';

const OTA_BUCKET = process.env.SUPABASE_OTA_BUCKET ?? 'ota';

@Injectable()
export class OTAService {
  private readonly logger = new Logger(OTAService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.getClient();
  }

  private getSupabase(): SupabaseClient {
    const url = process.env.SUPABASE_URL ?? process.env.DATABASE_REST_URL;
    const key =
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.DATABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured',
      );
    }
    return createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  private async ensureBucket(supabase: SupabaseClient) {
    const { data: buckets, error: listError } =
      await supabase.storage.listBuckets();
    if (listError) throw new Error(`Unable to inspect storage buckets: ${listError.message}`);
    if (buckets?.some((bucket) => bucket.name === OTA_BUCKET)) return;

    const { error: createError } = await supabase.storage.createBucket(OTA_BUCKET, {
      public: false,
      fileSizeLimit: '20MB',
    });
    if (createError && !/already exists/i.test(createError.message)) {
      throw new Error(`Unable to create OTA bucket: ${createError.message}`);
    }
  }

  async listFiles() {
    try {
      const supabase = this.getSupabase();
      await this.ensureBucket(supabase);
      const { data, error } = await supabase.storage.from(OTA_BUCKET).list('', {
        limit: 100,
        sortBy: { column: 'updated_at', order: 'desc' },
      });
      if (error) throw new Error(`Unable to list OTA files: ${error.message}`);
      const mainFileResult = await this.db.query<{ setting_value: string }>(
        `SELECT setting_value FROM system_settings
         WHERE setting_key = 'ota_main_file' LIMIT 1`,
      );
      const mainFile = mainFileResult.rows[0]?.setting_value ?? null;

      return data.map((file) => ({
        id: file.id,
        name: file.name,
        is_main: file.name === mainFile,
        size: file.metadata?.size ? Number(file.metadata.size) : null,
        mimetype: file.metadata?.mimetype ?? null,
        created_at: file.created_at,
        updated_at: file.updated_at,
      }));
    } catch (error) {
      this.logger.error(error);
      return this.invalid(error instanceof Error ? error.message : 'Unable to list OTA files', 500);
    }

  }

  async getMainFile() {
    try {
      const mainFileResult = await this.db.query<{ setting_value: string }>(
        `SELECT setting_value FROM system_settings
         WHERE setting_key = 'ota_main_file' LIMIT 1`,
      );
      const mainFile = mainFileResult.rows[0]?.setting_value;
      if (!mainFile) {
        return this.invalid('No main OTA file has been designated', 404);
      }

      const supabase = this.getSupabase();
      await this.ensureBucket(supabase);
      const { data, error } = await supabase.storage
        .from(OTA_BUCKET)
        .download(mainFile);
      if (error) throw new Error(`Unable to download main OTA file: ${error.message}`);

      const content = Buffer.from(await data.arrayBuffer()).toString('base64');
      return { name: mainFile, content };
    } catch (error) {
      this.logger.error(error);
      return this.invalid(
        error instanceof Error ? error.message : 'Unable to download main OTA file',
        500,
      );
    }
  }

  async setMainFile(user: UserSession, name: string | undefined) {
      try {
        if (!name || name.includes('/') || name.includes('\\')) {
          return this.invalid('A valid OTA filename is required');
        }

        const supabase = this.getSupabase();
        await this.ensureBucket(supabase);
        const { data: files, error: listError } = await supabase.storage
          .from(OTA_BUCKET)
          .list('', { limit: 100 });
        if (listError) throw new Error(`Unable to verify OTA file: ${listError.message}`);
        if (!files.some((file) => file.name === name)) {
          return this.invalid('The selected OTA file does not exist', 404);
        }

        await this.db.query(
          `INSERT INTO system_settings
             (setting_key, setting_value, data_type, category, description, updated_by)
           VALUES ('ota_main_file', $1, 'string', 'system', 'The OTA file downloaded by clients', $2)
           ON CONFLICT (setting_key) DO UPDATE
             SET setting_value = EXCLUDED.setting_value,
                 updated_by = EXCLUDED.updated_by,
                 updated_at = NOW()`,
          [name, user.id],
        );

        return SuccessHandler('Main OTA file updated successfully', 200, { name });
      } catch (error) {
        this.logger.error(error);
        return this.invalid(
          error instanceof Error ? error.message : 'Unable to set main OTA file',
          500,
        );
      }
  }

  async uploadFile(_user: UserSession, file: MultipartFile) {
    try {
      if (!file.filename.toLowerCase().endsWith('.ps1')) {
        return this.invalid('Only PowerShell (.ps1) files are supported');
      }

      const supabase = this.getSupabase();
      await this.ensureBucket(supabase);
      const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
      const objectPath = `${Date.now()}-${safeName}`;
      const { error } = await supabase.storage.from(OTA_BUCKET).upload(
        objectPath,
        await file.toBuffer(),
        { contentType: 'application/octet-stream', upsert: false },
      );
      if (error) throw new Error(`OTA upload failed: ${error.message}`);

      return SuccessHandler('OTA file uploaded successfully', 201, {
        name: objectPath,
      });
    } catch (error) {
      this.logger.error(error);
      return this.invalid(error instanceof Error ? error.message : 'OTA upload failed', 500);
    }
  }

  invalid(message: string, status = 400) {
    return ErrorHandler(message, status);
  }
}

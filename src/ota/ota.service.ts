import { Injectable, Logger } from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MultipartFile } from '@fastify/multipart';
import type { UserSession } from '../lib/data/interfaces';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';

const OTA_BUCKET = process.env.SUPABASE_OTA_BUCKET ?? 'ota';

@Injectable()
export class OTAService {
  private readonly logger = new Logger(OTAService.name);

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
      return data.map((file) => ({
        id: file.id,
        name: file.name,
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

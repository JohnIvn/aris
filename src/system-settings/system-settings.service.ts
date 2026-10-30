import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerService } from '../logger/logger.service';
import type { UserSession } from '../lib/data/interfaces';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';

type Settings = {
  siteName: string;
  maintenanceMode: boolean;
  sessionTimeoutMinutes: number;
  maxUploadMb: number;
};

@Injectable()
export class SystemSettingsService {
  private readonly defaults: Settings = {
    siteName: 'ARIS University',
    maintenanceMode: false,
    sessionTimeoutMinutes: 30,
    maxUploadMb: 6,
  };

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly loggerService: LoggerService,
  ) {}

  private get db() {
    return this.databaseService.getClient();
  }

  async get() {
    try {
      const result = await this.db.query(
        `SELECT setting_key, setting_value
         FROM system_settings
         WHERE category = 'system' OR category = 'backup'`,
      );
      const settings = { ...this.defaults };
      for (const row of result.rows) {
        if (!(row.setting_key in settings)) continue;
        const key = row.setting_key as keyof Settings;
        if (typeof settings[key] === 'boolean') {
          settings[key] = (row.setting_value === 'true') as never;
        } else if (typeof settings[key] === 'number') {
          const value = Number(row.setting_value);
          if (Number.isFinite(value)) settings[key] = value as never;
        } else {
          settings[key] = row.setting_value as never;
        }
      }
      return settings;
    } catch (error) {
      return this.error(error);
    }
  }

  async update(user: UserSession, data: Record<string, unknown>) {
    try {
      const current = await this.get();
      if ('ok' in current && current.ok === false) return current;
      const next = { ...(current as Settings) };
      const allowed = Object.keys(this.defaults) as (keyof Settings)[];
      for (const key of allowed) {
        if (data[key] === undefined) continue;
        if (
          typeof this.defaults[key] === 'boolean' &&
          typeof data[key] !== 'boolean'
        ) {
          return this.errorResponse(`${key} must be a boolean`);
        }
        if (
          typeof this.defaults[key] === 'number' &&
          (typeof data[key] !== 'number' || !Number.isFinite(data[key]))
        ) {
          return this.errorResponse(`${key} must be a number`);
        }
        if (
          typeof this.defaults[key] === 'string' &&
          typeof data[key] !== 'string'
        ) {
          return this.errorResponse(`${key} must be a string`);
        }
        next[key] = data[key] as never;
      }
      if (next.sessionTimeoutMinutes < 5 || next.sessionTimeoutMinutes > 1440) {
        return this.errorResponse(
          'Session timeout must be between 5 and 1440 minutes',
        );
      }
      if (next.maxUploadMb < 1 || next.maxUploadMb > 6) {
        return this.errorResponse('Upload limit must be between 1 and 6 MB');
      }
      for (const key of allowed) {
        await this.db.query(
          `INSERT INTO system_settings
             (setting_key, setting_value, data_type, category, description, updated_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (setting_key) DO UPDATE
             SET setting_value = EXCLUDED.setting_value,
                 data_type = EXCLUDED.data_type,
                 category = EXCLUDED.category,
                 updated_by = EXCLUDED.updated_by,
                 updated_at = NOW()`,
          [
            key,
            String(next[key]),
            typeof next[key],
            'system',
            `System setting: ${key}`,
            user.id,
          ],
        );
      }
      return SuccessHandler('System settings saved successfully', 200, next);
    } catch (error) {
      return this.error(error);
    }
  }

  private errorResponse(message: string) {
    return ErrorHandler(message, 400);
  }

  private error(error: unknown) {
    return ErrorHandler(
      error instanceof Error ? error.message : 'Server Error',
      500,
    );
  }
}

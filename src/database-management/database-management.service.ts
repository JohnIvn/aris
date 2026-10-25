import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { DatabaseService } from '../database/database.service';
import { UserSession } from '../lib/data/interfaces';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';

@Injectable()
export class DatabaseManagementService implements OnModuleInit, OnModuleDestroy {
  private readonly bucket = 'backup';
  private scheduler?: NodeJS.Timeout;

  constructor(private readonly databaseService: DatabaseService) {}

  onModuleInit() {
    this.scheduler = setInterval(() => {
      void this.runScheduledBackup();
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.scheduler) clearInterval(this.scheduler);
  }

  private get db() {
    return this.databaseService.getClient();
  }

  async listBackups() {
    try {
      const result = await this.db.query(
        `SELECT id, name, backup_type, size_bytes, created_at, status, checksum, storage_location
         FROM backups
         ORDER BY created_at DESC
         LIMIT 100`,
      );
      return result.rows.map((row) => this.mapBackup(row));
    } catch (error) {
      return this.error(error);
    }
  }

  async metrics() {
      try {
        const result = await this.db.query<{
          database_name: string;
          database_size: string;
          active_connections: string;
          max_connections: string;
          block_reads: string;
          block_hits: string;
        }>(
          `SELECT
             current_database() AS database_name,
             pg_database_size(current_database())::text AS database_size,
             (SELECT COUNT(*) FROM pg_stat_activity)::text AS active_connections,
             current_setting('max_connections')::text AS max_connections,
             COALESCE(pg_stat_database.blks_read, 0)::text AS block_reads,
             COALESCE(pg_stat_database.blks_hit, 0)::text AS block_hits
           FROM pg_stat_database
           WHERE datname = current_database()`,
        );
        const row = result.rows[0];
        if (!row) throw new Error('Database metrics are unavailable');

        const latestBackup = await this.db.query(
          `SELECT name, backup_type, size_bytes,
                  (created_at AT TIME ZONE 'UTC') AS created_at_utc
           FROM backups
           ORDER BY created_at DESC
           LIMIT 1`,
        );

        const backup = latestBackup.rows[0];
        return SuccessHandler('Successfully fetched database metrics', 200, {
          clusterStatus: 'Healthy',
          clusterDetail: `Connected to ${row.database_name}`,
          databaseSizeBytes: Number(row.database_size),
          activeConnections: Number(row.active_connections),
          maxConnections: Number(row.max_connections),
          blockReads: Number(row.block_reads),
          blockHits: Number(row.block_hits),
          latestSnapshot: backup
            ? {
                name: backup.name,
                type: backup.backup_type,
                sizeBytes: Number(backup.size_bytes),
                createdAt: this.toUtcIso(backup.created_at_utc),
              }
            : null,
        });
      } catch (error) {
        return this.error(error);
    }
  }

  async createBackup(user: UserSession | null, type: 'manual_snapshot' | 'automated_daily' = 'manual_snapshot') {
    const directory = await mkdtemp(join(tmpdir(), 'aris-backup-'));
    const filePath = join(directory, 'database.sql');
    const name = `db_backup_${this.timestamp()}.sql`;

    try {
      await this.runPgDump(filePath);
      const content = await readFile(filePath);
      const checksum = createHash('sha256').update(content).digest('hex');
      const supabase = this.getSupabase();
      const storagePath = `${new Date().getUTCFullYear()}/${name}`;
      const upload = await supabase.storage.from(this.bucket).upload(storagePath, content, {
        contentType: 'application/sql',
        upsert: false,
      });
      if (upload.error) throw new Error(`Backup upload failed: ${upload.error.message}`);

      const result = await this.db.query(
        `INSERT INTO backups
          (name, backup_type, size_bytes, checksum, status, storage_location, created_by)
         VALUES ($1, $6, $2, $3, 'verified', $4, $5)
         RETURNING id, name, backup_type, size_bytes, created_at, status, checksum, storage_location`,
        [name, content.length, `sha256:${checksum}`, `${this.bucket}/${storagePath}`, user?.id ?? null, type],
      );

      return SuccessHandler('Database backup created successfully', 201, this.mapBackup(result.rows[0]));
    } catch (error) {
      return this.error(error);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }

  }

  async getSettings() {
    try {
      const result = await this.db.query(
        `SELECT setting_key, setting_value
         FROM system_settings
         WHERE category = 'backup'`,
      );
      const settings = this.defaultSettings();
      for (const row of result.rows) {
        if (row.setting_key in settings) {
          settings[row.setting_key as keyof typeof settings] = row.setting_value === 'true';
        }
      }
      return settings;
    } catch (error) {
      return this.error(error);
    }
  }

  async updateSettings(user: UserSession, data: Record<string, unknown>) {
    try {
      const allowed = Object.keys(this.defaultSettings());
      const updates = Object.entries(data).filter(
        ([key, value]) => allowed.includes(key) && typeof value === 'boolean',
      );
      for (const [key, value] of updates) {
        await this.db.query(
          `INSERT INTO system_settings
             (setting_key, setting_value, data_type, category, description, updated_by)
           VALUES ($1, $2, 'boolean', 'backup', $3, $4)
           ON CONFLICT (setting_key) DO UPDATE
             SET setting_value = EXCLUDED.setting_value,
                 updated_by = EXCLUDED.updated_by,
                 updated_at = NOW()`,
          [key, String(value), `Backup setting: ${key}`, user.id],
        );
      }
      return this.getSettings();
    } catch (error) {
      return this.error(error);
    }
  }

  async healthChecks() {
    try {
      const started = Date.now();
      await this.db.query('SELECT 1');
      const tableResult = await this.db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM information_schema.tables
         WHERE table_schema = 'public'`,
      );
      return [
        {
          id: 'database-connectivity',
          name: 'Database Connectivity',
          desc: 'Checks that the application can connect to PostgreSQL.',
          frequency: 'On demand',
          lastRun: 'Just now',
          status: 'PASSED',
          latency: `${Date.now() - started}ms`,
          tone: 'green',
        },
        {
          id: 'schema-integrity',
          name: 'Schema Availability',
          desc: 'Counts available public database tables.',
          frequency: 'On demand',
          lastRun: 'Just now',
          status: Number(tableResult.rows[0].count) > 0 ? 'HEALTHY' : 'WARNING',
          latency: '—',
          tone: Number(tableResult.rows[0].count) > 0 ? 'blue' : 'amber',
        },
      ];
    } catch (error) {
      return this.error(error);
    }
  }

  async restoreLogs() {
    try {
      const result = await this.db.query(
        `SELECT rl.id, rl.target_database, b.name AS snapshot, rl.initiated_by_label,
                rl.duration_seconds, rl.restored_at, rl.status
         FROM restore_logs rl
         JOIN backups b ON b.id = rl.backup_id
         ORDER BY rl.restored_at DESC
         LIMIT 100`,
      );
      return result.rows.map((row) => ({
        id: row.id,
        target: row.target_database,
        snapshot: row.snapshot,
        initiatedBy: row.initiated_by_label,
        duration: row.duration_seconds == null ? '—' : `${row.duration_seconds}s`,
        date: new Date(row.restored_at).toISOString(),
        status: row.status === 'success' ? 'Success' : row.status,
      }));
    } catch (error) {
      return this.error(error);
    }
  }

  private getSupabase() {
    const url = process.env.SUPABASE_URL ?? process.env.DATABASE_REST_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.DATABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured');
    }

    return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }

  private defaultSettings() {
    return {
      autoBackupEnabled: true,
      crossRegionEnabled: false,
      pointInTimeEnabled: false,
    };
  }

  private async runScheduledBackup() {
    try {
      const setting = await this.db.query<{ setting_value: string }>(
        `SELECT setting_value
         FROM system_settings
         WHERE category = 'backup' AND setting_key = 'autoBackupEnabled'
         LIMIT 1`,
      );
      if (setting.rows[0]?.setting_value === 'false') return;

      const now = new Date();
      if (now.getUTCHours() !== 18 || now.getUTCMinutes() !== 0) return;

      const recent = await this.db.query(
        `SELECT 1 FROM backups
         WHERE backup_type = 'automated_daily'
           AND created_at >= CURRENT_DATE
         LIMIT 1`,
      );
      if (recent.rowCount) return;

      await this.createBackup(null, 'automated_daily');
    } catch (error) {
      console.error(
        '[DATABASE BACKUP SCHEDULER]',
        error instanceof Error ? error.message : error,
      );
    }
  }

  private runPgDump(outputPath: string) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is not configured');

    return new Promise<void>((resolve, reject) => {
      const process = spawn('pg_dump', ['--no-owner', '--no-privileges', '--file', outputPath, databaseUrl], {
        windowsHide: true,
      });
      let stderr = '';
      process.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      process.once('error', (error) => reject(new Error(`Unable to run pg_dump: ${error.message}`)));
      process.once('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`pg_dump failed${stderr ? `: ${stderr.trim()}` : ''}`));
      });
    });
  }

  private timestamp() {
    return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  }

  private mapBackup(row: Record<string, unknown>) {
    const type = String(row.backup_type ?? 'manual_snapshot');
    return {
      id: row.id,
      name: row.name,
      type: type === 'manual_snapshot' ? 'Manual Snapshot' : type === 'weekly_full' ? 'Weekly Full' : 'Automated Daily',
      size: this.formatBytes(Number(row.size_bytes ?? 0)),
      date: this.toUtcIso(row.created_at),
      status: String(row.status ?? 'verified').replace(/^./, (value) => value.toUpperCase()),
      checksum: row.checksum ?? '—',
      storageLocation: row.storage_location,
    };
  }

  private toUtcIso(value: unknown) {
    if (value instanceof Date) return value.toISOString();
    const text = String(value);
    const normalized = /(?:Z|[+-]\d{2}:\d{2})$/.test(text) ? text : `${text}Z`;
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid backup timestamp returned by database');
    return date.toISOString();
  }

  private formatBytes(bytes: number) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
  }

  private error(error: unknown) {
    return ErrorHandler(
      error instanceof Error ? error.message : 'Server Error',
      500,
      error instanceof Error ? error.name : 'Unknown Error',
    );
  }
}

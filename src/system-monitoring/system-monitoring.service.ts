import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';

@Injectable()
export class SystemMonitoringService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.getClient();
  }

  async getHardwareEvents() {
    try {
      const result = await this.db.query<{
        id: string;
        occurred_at: Date;
        event: string;
        status: string;
        details: string | null;
        ip_address: string | null;
      }>(
        `SELECT id, occurred_at, event, status, details, ip_address
         FROM hardware_events
         ORDER BY occurred_at DESC
         LIMIT 100`,
      );

      return result.rows.map((row) => ({
        id: row.id,
        time: row.occurred_at.toISOString(),
        event: row.event,
        status: row.status === 'Failure' ? 'Failure' : 'Success',
        details: row.details ?? (row.ip_address ? `IP: ${row.ip_address}` : ''),
      }));
    } catch (error) {
      return this.error(error);
    }
  }

  async getSoftwareMonitoring() {
    try {
      const [services, endpoints] = await Promise.all([
        this.db.query(
          `SELECT name, version, latency_ms, uptime_percent, status
           FROM software_services
           ORDER BY name`,
        ),
        this.db.query(
          `SELECT method, path, requests_per_second, p95_ms, error_rate
           FROM software_endpoints
           ORDER BY requests_per_second DESC
           LIMIT 100`,
        ),
      ]);

      return SuccessHandler('Successfully fetched software monitoring data', 200, {
        services: services.rows.map((row) => ({
          name: row.name,
          version: row.version,
          latency: row.latency_ms == null ? '—' : `${row.latency_ms} ms`,
          uptime: row.uptime_percent == null ? '—' : `${row.uptime_percent}%`,
          status: row.status,
          dot: row.status === 'Down' ? '#c0392b' : row.status === 'Degraded' ? '#d99a2b' : '#2f7043',
        })),
        topEndpoints: endpoints.rows.map((row) => ({
          method: row.method,
          methodColor: '#eaf4ee',
          methodTextColor: '#2f7043',
          path: row.path,
          reqSec: Number(row.requests_per_second),
          p95: row.p95_ms == null ? '—' : `${row.p95_ms} ms`,
          err: `${row.error_rate}%`,
          highP95: Number(row.p95_ms ?? 0) >= 500,
          highErr: Number(row.error_rate) >= 5,
        })),
      });
    } catch (error) {
      return this.error(error);
    }
  }

  async getSystemLogs() {
    try {
      const result = await this.db.query(
        `SELECT id, actor_label, event, detail, ip_address, occurred_at, kind
         FROM system_logs
         ORDER BY occurred_at DESC
         LIMIT 200`,
      );

      return result.rows.map((row) => ({
        id: row.id,
        actor: row.actor_label,
        init: row.actor_label
          .split(/\s+/)
          .filter(Boolean)
          .map((part: string) => part[0])
          .join('')
          .slice(0, 2)
          .toUpperCase(),
        event: row.event,
        detail: row.detail ?? '—',
        ip: row.ip_address ?? '—',
        time: new Date(row.occurred_at).toISOString(),
        kind: row.kind.charAt(0).toUpperCase() + row.kind.slice(1),
      }));
    } catch (error) {
      return this.error(error);
    }
  }

  private error(error: unknown) {
    return ErrorHandler(
      error instanceof Error ? error.message : 'Server Error',
      500,
      error instanceof Error ? error.name : 'Unknown Error',
    );
  }
}

import { Pool } from 'pg';

export async function createSoftwareMonitoring(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS software_services (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      version TEXT NOT NULL DEFAULT 'unknown',
      latency_ms NUMERIC(10, 2),
      uptime_percent NUMERIC(5, 2),
      status TEXT NOT NULL DEFAULT 'Healthy',
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS software_endpoints (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      requests_per_second NUMERIC(12, 2) NOT NULL DEFAULT 0,
      p95_ms NUMERIC(10, 2),
      error_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
      measured_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE (method, path)
    );

    CREATE INDEX IF NOT EXISTS idx_software_endpoints_volume
    ON software_endpoints (requests_per_second DESC);
  `);
}

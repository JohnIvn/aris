import { Pool } from 'pg';

export default async function createBiometricsTransactions(client: Pool) {
  await client.query(`
    CREATE TABLE attendance_transactions (
        id BIGINT PRIMARY KEY,
        emp BIGINT,
        emp_code VARCHAR(50),
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        department VARCHAR(150),
        position VARCHAR(150),

        punch_time TIMESTAMP NOT NULL,
        punch_state VARCHAR(10),
        punch_state_display VARCHAR(50),

        verify_type INTEGER,
        verify_type_display VARCHAR(50),

        work_code VARCHAR(50),
        gps_location TEXT,
        area_alias VARCHAR(100),

        terminal_sn VARCHAR(100),
        temperature NUMERIC(5,2),
        is_mask VARCHAR(10),

        terminal_alias VARCHAR(100),
        upload_time TIMESTAMP,

        longitude NUMERIC(11,8),
        latitude NUMERIC(10,8),

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`);

  await client.query(`
    CREATE INDEX idx_attendance_emp
        ON attendance_transactions (emp);`);

  await client.query(`
    CREATE INDEX idx_attendance_emp_code
        ON attendance_transactions (emp_code);`);

  await client.query(`
    CREATE INDEX idx_attendance_punch_time
        ON attendance_transactions (punch_time);`);

  await client.query(`
    CREATE INDEX idx_attendance_terminal_sn
        ON attendance_transactions (terminal_sn);`);
}

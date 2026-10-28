import { Pool } from 'pg';

export default async function createDtrModel(client: Pool) {
  await client.query(
    `
        CREATE TABLE IF NOT EXISTS dtr (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        professor_id UUID REFERENCES user_professors(id) ON DELETE CASCADE,
        staff_id UUID REFERENCES user_staffs(id) ON DELETE CASCADE,
        biometrics_id TEXT REFERENCES dtr_biometrics(id) ON DELETE SET NULL,
        time_in TIME DEFAULT null,
        time_out TIME DEFAULT null,
        total_hours NUMERIC(10, 2) DEFAULT 0,
        shift_date DATE NOT NULL,
        on_site BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
        )
        
    `,
  );
}

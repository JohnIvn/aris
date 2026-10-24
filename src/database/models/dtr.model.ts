import { Pool } from 'pg';

export default async function createDtrModel(client: Pool) {
  await client.query(
    `
        CREATE TABLE IF NOT EXISTS dtr (
        id UUID PRIMARY KEY DEFAULT gen_uuid(),
        professor_id UUID REFERENCES user_professor(id) ON DELETE CASCADE,
        staff_id UUID REFERENCES user_staff(id) ON DELETE CASCADE,
        time_in TIME DEFAULT null,
        time_out TIME DEFAULT null,
        total_hours INT DEFAULT 0,
        shift_date DATE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
        )
        
    `,
  );
}

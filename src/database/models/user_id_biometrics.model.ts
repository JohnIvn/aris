import { Pool } from 'pg';

export default async function createUserIdBiometricsModel(client: Pool) {
  await client.query(
    `CREATE TABLE IF NOT EXISTS user_id_biometrics(
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      professor_id UUID REFERENCES user_professors(id) ON DELETE CASCADE,
      staff_id UUID REFERENCES user_staffs(id) ON DELETE CASCADE,
      biometrics_emp_id INT UNIQUE DEFAULT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );`,
  );
}

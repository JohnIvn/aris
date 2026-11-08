import { Pool } from 'pg';

export default async function createDtrBiometricsModel(client: Pool) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS dtr_biometrics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        professor_id UUID REFERENCES user_professors(id) ON DELETE CASCADE,
        staff_id UUID REFERENCES user_staffs(id) ON DELETE CASCADE,
        biometrics_id TEXT DEFAULT NULL,
        biometrics_fingerprint TEXT DEFAULT NULL,
        authenticator_tag TEXT REFERENCES authenticators(tag) ON DELETE SET NULL ON UPDATE CASCADE,
        authenticator_fingerprint TEXT DEFAULT NULL,
        nfc_id TEXT DEFAULT NULL,
        rfid TEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
    ) 
    `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS
      uq_authenticator_fingerprint
    ON dtr_biometrics(authenticator_tag, authenticator_fingerprint)
    WHERE authenticator_tag IS NOT NULL
      AND authenticator_fingerprint IS NOT NULL;
      `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS
      uq_dtr_biometrics_staff
    ON dtr_biometrics(staff_id)
    WHERE staff_id IS NOT NULL;
    `);
}

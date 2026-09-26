import { Pool } from 'pg';

export async function createUserLogs(client: Pool) {
  await client.query(`
        CREATE TABLE IF NOT EXISTS user_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            action_type user_action,
            auth_action auth_action,
            action_status action_status,
            user_id UUID,
            role user_role DEFAULT 'staff',
            staff_id UUID REFERENCES user_staffs(id) ON DELETE SET NULL,
            professor_id UUID REFERENCES user_professors(id) ON DELETE SET NULL,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT user_logs_subject_matches_role CHECK (
                (role = 'staff' AND staff_id IS NOT NULL AND professor_id IS NULL)
                OR (role = 'professor' AND professor_id IS NOT NULL AND staff_id IS NULL)
                OR (role = 'admin' AND staff_id IS NULL AND professor_id IS NULL)
                OR (user_id IS NULL AND staff_id IS NULL AND professor_id IS NULL)
            )
        );

        CREATE INDEX IF NOT EXISTS idx_user_logs_user_id
        ON user_logs (user_id);

        CREATE INDEX IF NOT EXISTS idx_user_logs_staff_id
        ON user_logs (staff_id);

        CREATE INDEX IF NOT EXISTS idx_user_logs_professor_id
        ON user_logs (professor_id);

        CREATE INDEX IF NOT EXISTS idx_user_logs_auth_action
        ON user_logs (auth_action);
        `);
}

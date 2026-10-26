import { Pool } from 'pg';

export async function createCurriculumModel(client: Pool) {
  // 1. Departments table
  await client.query(`
    CREATE TABLE IF NOT EXISTS departments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);
  `);

  // 2. Academic Ranks table
  await client.query(`
    CREATE TABLE IF NOT EXISTS academic_ranks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT,
      name TEXT NOT NULL UNIQUE,
      hierarchy_level INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_academic_ranks_name ON academic_ranks(name);
  `);

  // 3. Curriculum Courses table
  await client.query(`
    CREATE TABLE IF NOT EXISTS curriculum_courses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
      department_name TEXT,
      units INTEGER NOT NULL DEFAULT 3,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_curriculum_courses_code ON curriculum_courses(code);
  `);

  // Seed default departments if table is empty
  const deptCount = await client.query('SELECT COUNT(*)::int AS count FROM departments');
  if (deptCount.rows[0]?.count === 0) {
    const initialDepts = [
      ['ENG', 'Engineering', 'College of Engineering and Technology disciplines'],
      ['CS', 'Computer Science', 'Computing, Software Engineering, and Information Systems'],
      ['BUS', 'Business', 'Business Administration, Accountancy, and Management'],
      ['SCI', 'Sciences', 'Natural Sciences, Mathematics, and Applied Sciences'],
      ['HUM', 'Arts & Humanities', 'Liberal Arts, Communication, and Social Sciences'],
    ];

    for (const [code, name, desc] of initialDepts) {
      await client.query(
        `INSERT INTO departments (code, name, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO NOTHING`,
        [code, name, desc],
      );
    }
  }

  // Seed default ranks if table is empty
  const rankCount = await client.query('SELECT COUNT(*)::int AS count FROM academic_ranks');
  if (rankCount.rows[0]?.count === 0) {
    const initialRanks = [
      ['PROF', 'Professor', 1, 'Full Professor rank with academic tenure and research credentials'],
      ['ASC_PROF', 'Associate Prof.', 2, 'Associate Professor rank with teaching excellence and research output'],
      ['AST_PROF', 'Assistant Prof.', 3, 'Assistant Professor rank contributing to instruction and department programs'],
      ['LEC', 'Lecturer', 4, 'Academic faculty lecturer focusing on undergraduate curriculum delivery'],
      ['ADJ', 'Adjunct', 5, 'Adjunct or visiting faculty offering specialized industry courses'],
    ];

    for (const [code, name, level, desc] of initialRanks) {
      await client.query(
        `INSERT INTO academic_ranks (code, name, hierarchy_level, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO NOTHING`,
        [code, name, level, desc],
      );
    }
  }

  // Seed initial courses if table is empty
  const courseCount = await client.query('SELECT COUNT(*)::int AS count FROM curriculum_courses');
  if (courseCount.rows[0]?.count === 0) {
    const initialCourses = [
      ['CS101', 'Introduction to Computing', 'Computer Science', 3, 'Fundamental computer concepts and programming logic'],
      ['CS201', 'Data Structures & Algorithms', 'Computer Science', 3, 'Core algorithmic design, lists, trees, graphs, and complexity'],
      ['ENG101', 'Engineering Mechanics', 'Engineering', 3, 'Statics and dynamics principles for engineering systems'],
      ['BUS101', 'Principles of Management', 'Business', 3, 'Organizational behavior and modern management practices'],
      ['SCI101', 'Applied Physics', 'Sciences', 3, 'Classical mechanics, thermodynamics, and laboratory applications'],
    ];

    for (const [code, title, deptName, units, desc] of initialCourses) {
      await client.query(
        `INSERT INTO curriculum_courses (code, title, department_name, units, description)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (code) DO NOTHING`,
        [code, title, deptName, units, desc],
      );
    }
  }
}


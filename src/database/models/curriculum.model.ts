import { Pool } from 'pg';

export async function createCurriculumModel(client: Pool) {
  // 1. Colleges table (Turn current Department into College)
  await client.query(`
    CREATE TABLE IF NOT EXISTS colleges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_colleges_name ON colleges(name);
  `);

  // 2. Departments table (New Department, linked to College)
  await client.query(`
    CREATE TABLE IF NOT EXISTS departments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      college_id UUID REFERENCES colleges(id) ON DELETE SET NULL,
      college_name TEXT,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE departments ADD COLUMN IF NOT EXISTS college_id UUID REFERENCES colleges(id) ON DELETE SET NULL;
    ALTER TABLE departments ADD COLUMN IF NOT EXISTS college_name TEXT;
    CREATE INDEX IF NOT EXISTS idx_departments_name ON departments(name);
    CREATE INDEX IF NOT EXISTS idx_departments_college_name ON departments(college_name);
  `);

  // 3. Programs table (Academic Degree Programs, e.g. BSIT)
  await client.query(`
    CREATE TABLE IF NOT EXISTS programs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL UNIQUE,
      department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
      department_name TEXT,
      college_id UUID REFERENCES colleges(id) ON DELETE SET NULL,
      college_name TEXT,
      description TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_programs_name ON programs(name);
    CREATE INDEX IF NOT EXISTS idx_programs_code ON programs(code);
    CREATE INDEX IF NOT EXISTS idx_programs_department ON programs(department_name);
    CREATE INDEX IF NOT EXISTS idx_programs_college ON programs(college_name);
  `);

  // 4. Academic Ranks table (Untouched)
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

  // 5. Curriculum Courses table (Untouched)
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

  // --- DATA MIGRATION & SEEDING ---

  // A. Copy existing college entries from departments to colleges if any were created there
  await client.query(`
    INSERT INTO colleges (code, name, description, is_active, created_at, updated_at)
    SELECT d.code, d.name, d.description, d.is_active, d.created_at, d.updated_at
      FROM departments d
     WHERE d.name ILIKE '%College%' OR d.name ILIKE '%School%' OR d.code IN ('CLAS', 'CBA', 'CCJE', 'CEDUC', 'CENG', 'GRAD')
    ON CONFLICT (name) DO NOTHING;
  `);

  // Seed default colleges if table is empty
  const collegeCount = await client.query(
    'SELECT COUNT(*)::int AS count FROM colleges',
  );
  if (collegeCount.rows[0]?.count === 0) {
    const initialColleges = [
      [
        'CLAS',
        'College of Liberal Arts and Sciences',
        'Liberal Arts, Computing, Mathematics, Social Sciences',
      ],
      [
        'CBA',
        'College of Business and Accountancy',
        'Accountancy, Business Administration, and Management',
      ],
      [
        'CCJE',
        'College of Criminal Justice Education',
        'Criminology and Industrial Security Management',
      ],
      [
        'CEDUC',
        'College of Education',
        'Elementary, Secondary, and Early Childhood Education',
      ],
      [
        'CENG',
        'College of Engineering',
        'Computer, Electrical, Electronics, and Industrial Engineering',
      ],
      ['GRAD', 'Graduate School', 'Advanced masteral and doctoral disciplines'],
    ];

    for (const [code, name, desc] of initialColleges) {
      await client.query(
        `INSERT INTO colleges (code, name, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO NOTHING`,
        [code, name, desc],
      );
    }
  }

  // B. Clean up colleges from departments table (since they now live in colleges table)
  await client.query(`
    DELETE FROM departments
     WHERE name IN (SELECT name FROM colleges);
  `);

  // Seed default departments if table is empty or missing Computer Studies Department
  const deptCount = await client.query(
    'SELECT COUNT(*)::int AS count FROM departments',
  );
  if (deptCount.rows[0]?.count === 0) {
    const initialDepartments = [
      [
        'CSD',
        'Computer Studies Department',
        'College of Liberal Arts and Sciences',
        'Computing, Software Engineering, and Information Technology',
      ],
      [
        'LANG',
        'Languages & Humanities Department',
        'College of Liberal Arts and Sciences',
        'Languages, Literature, and Communication',
      ],
      [
        'MATH',
        'Mathematics & Natural Sciences Department',
        'College of Liberal Arts and Sciences',
        'Mathematics, Statistics, and Physical Sciences',
      ],
      [
        'BA',
        'Business Administration Department',
        'College of Business and Accountancy',
        'Management, Marketing, and Entrepreneurship',
      ],
      [
        'ACCT',
        'Accountancy Department',
        'College of Business and Accountancy',
        'Accounting, Taxation, and Auditing',
      ],
      [
        'CRIM',
        'Criminal Justice Department',
        'College of Criminal Justice Education',
        'Criminal Justice and Law Enforcement',
      ],
      [
        'TED',
        'Teacher Education Department',
        'College of Education',
        'Elementary and Secondary Teacher Education',
      ],
      [
        'ENG_DEPT',
        'Engineering Department',
        'College of Engineering',
        'Electrical, Electronics, and Industrial Engineering',
      ],
    ];

    for (const [code, name, collegeName, desc] of initialDepartments) {
      const colRes = await client.query(
        'SELECT id FROM colleges WHERE name = $1 LIMIT 1',
        [collegeName],
      );
      const collegeId = colRes.rows[0]?.id || null;
      await client.query(
        `INSERT INTO departments (code, name, college_id, college_name, description)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (name) DO NOTHING`,
        [code, name, collegeId, collegeName, desc],
      );
    }
  }

  // C. Seed default programs if table is empty
  const programCount = await client.query(
    'SELECT COUNT(*)::int AS count FROM programs',
  );
  if (programCount.rows[0]?.count === 0) {
    const initialPrograms = [
      [
        'BSIT',
        'Bachelor of Science in Information Technology',
        'Computer Studies Department',
        'College of Liberal Arts and Sciences',
        'Four-year undergraduate degree program focusing on information technology, software, and systems.',
      ],
      [
        'BSCS',
        'Bachelor of Science in Computer Science',
        'Computer Studies Department',
        'College of Liberal Arts and Sciences',
        'Undergraduate degree program focusing on algorithms, computing systems, and software engineering.',
      ],
      [
        'BSIS',
        'Bachelor of Science in Information System',
        'Computer Studies Department',
        'College of Liberal Arts and Sciences',
        'Undergraduate degree program focusing on enterprise information systems.',
      ],
      [
        'BSA',
        'Bachelor of Science in Accountancy',
        'Accountancy Department',
        'College of Business and Accountancy',
        'Professional undergraduate degree program in accountancy.',
      ],
      [
        'BSBA-FM',
        'BSBA Major in Financial Management',
        'Business Administration Department',
        'College of Business and Accountancy',
        'Financial management and corporate finance program.',
      ],
      [
        'BSCrim',
        'Bachelor of Science in Criminology',
        'Criminal Justice Department',
        'College of Criminal Justice Education',
        'Program focusing on law enforcement and criminological sciences.',
      ],
      [
        'BSED-ENG',
        'Bachelor of Secondary Education Major in English',
        'Teacher Education Department',
        'College of Education',
        'Teacher education degree in secondary English instruction.',
      ],
      [
        'BSCpE',
        'Bachelor of Science in Computer Engineering',
        'Engineering Department',
        'College of Engineering',
        'Undergraduate program bridging hardware and software computer engineering.',
      ],
    ];

    for (const [code, name, deptName, collegeName, desc] of initialPrograms) {
      const deptRes = await client.query(
        'SELECT id, college_id FROM departments WHERE name = $1 LIMIT 1',
        [deptName],
      );
      const deptId = deptRes.rows[0]?.id || null;
      const colRes = await client.query(
        'SELECT id FROM colleges WHERE name = $1 LIMIT 1',
        [collegeName],
      );
      const collegeId =
        colRes.rows[0]?.id || deptRes.rows[0]?.college_id || null;

      await client.query(
        `INSERT INTO programs (code, name, department_id, department_name, college_id, college_name, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (name) DO NOTHING`,
        [code, name, deptId, deptName, collegeId, collegeName, desc],
      );
    }
  }

  // D. Seed default ranks if table is empty (Untouched)
  const rankCount = await client.query(
    'SELECT COUNT(*)::int AS count FROM academic_ranks',
  );
  if (rankCount.rows[0]?.count === 0) {
    const initialRanks = [
      [
        'PROF',
        'Professor',
        1,
        'Full Professor rank with academic tenure and research credentials',
      ],
      [
        'ASC_PROF',
        'Associate Prof.',
        2,
        'Associate Professor rank with teaching excellence and research output',
      ],
      [
        'AST_PROF',
        'Assistant Prof.',
        3,
        'Assistant Professor rank contributing to instruction and department programs',
      ],
      [
        'LEC',
        'Lecturer',
        4,
        'Academic faculty lecturer focusing on undergraduate curriculum delivery',
      ],
      [
        'ADJ',
        'Adjunct',
        5,
        'Adjunct or visiting faculty offering specialized industry courses',
      ],
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

  // E. Seed initial courses if table is empty (Untouched)
  const courseCount = await client.query(
    'SELECT COUNT(*)::int AS count FROM curriculum_courses',
  );
  if (courseCount.rows[0]?.count === 0) {
    const initialCourses = [
      [
        'CS101',
        'Introduction to Computing',
        'Computer Studies Department',
        3,
        'Fundamental computer concepts and programming logic',
      ],
      [
        'CS201',
        'Data Structures & Algorithms',
        'Computer Studies Department',
        3,
        'Core algorithmic design, lists, trees, graphs, and complexity',
      ],
      [
        'ENG101',
        'Engineering Mechanics',
        'Engineering Department',
        3,
        'Statics and dynamics principles for engineering systems',
      ],
      [
        'BUS101',
        'Principles of Management',
        'Business Administration Department',
        3,
        'Organizational behavior and modern management practices',
      ],
      [
        'SCI101',
        'Applied Physics',
        'Mathematics & Natural Sciences Department',
        3,
        'Classical mechanics, thermodynamics, and laboratory applications',
      ],
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

import { Pool } from 'pg';
import { UserData } from '../data/auth.interface';
import { UserSession } from '../data/interfaces';
import { USER_ROLES, USER_ROLE_TABLES, type UserRoles } from '../data/types';
import { ErrorHandler } from './handlers';

export function isSessionCookie(value: unknown): value is UserSession {
  if (typeof value !== 'object' || value === null) return false;

  const v = value as Record<string, unknown>;

  return (
    typeof v.sub === 'string' &&
    typeof v.email === 'string' &&
    typeof v.role === 'string' &&
    (USER_ROLES as readonly string[]).includes(v.role)
  );
}

export function parseCookieHeader(header: string): Record<string, string> {
  return Object.fromEntries(
    header.split(';').map((pair) => {
      const [key, ...rest] = pair.trim().split('=');
      return [key, decodeURIComponent(rest.join('='))];
    }),
  );
}

/**
 * Builds a UNION ALL over the three role tables so a user can be looked up
 * without knowing which table they live in. Each table is tagged with its
 * own role so the caller always gets back a discriminated row.
 */
function roleUnion(): string {
  return USER_ROLES.map(
    (role) =>
      `SELECT *, '${role}'::text AS role FROM ${USER_ROLE_TABLES[role]}`,
  ).join('\n            UNION ALL\n            ');
}

async function findUser(
  client: Pool,
  column: 'email' | 'username' | 'id',
  value: string,
  role?: UserRoles,
): Promise<UserData | undefined> {
  try {
    const union = role
      ? `SELECT *, '${role}'::text AS role FROM ${USER_ROLE_TABLES[role]}`
      : roleUnion();

    const whereClause =
      column === 'id' ? 'id = $1' : `LOWER(${column}) = LOWER($1)`;

    const user = await client.query(
      `
            SELECT * FROM (
            ${union}
            ) AS members
            WHERE ${whereClause}
            LIMIT 1`,
      [value ? value.trim() : null],
    );

    return user.rows[0] as UserData | undefined;
  } catch (error) {
    if (error instanceof Error) {
      ErrorHandler(error.message, 500, error);
    }
    ErrorHandler('Server Error', 500, 'Unknown Error');
  }
}

export function getUserByEmail(
  client: Pool,
  email: string,
  role?: UserRoles,
): Promise<UserData | undefined> {
  return findUser(client, 'email', email, role);
}

export function getUserById(
  client: Pool,
  id: string,
  role?: UserRoles,
): Promise<UserData | undefined> {
  return findUser(client, 'id', id, role);
}

export function getUserByUsername(
  client: Pool,
  username: string,
  role?: UserRoles,
): Promise<UserData | undefined> {
  return findUser(client, 'username', username, role);
}

export interface DuplicateUserMatch {
  id: string;
  email: string;
  username: string;
  role: string;
  tableName: string;
}

export async function findDuplicateEmailAcrossRoles(
  client: Pool,
  email: string,
  excludeId?: string,
): Promise<DuplicateUserMatch | null> {
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized) return null;

  const queries = USER_ROLES.map((role) => {
    const table = USER_ROLE_TABLES[role];
    return excludeId
      ? `SELECT id, email, username, '${role}'::text AS role, '${table}'::text AS "tableName" FROM ${table} WHERE LOWER(email) = $1 AND id <> $2`
      : `SELECT id, email, username, '${role}'::text AS role, '${table}'::text AS "tableName" FROM ${table} WHERE LOWER(email) = $1`;
  });

  const sql = `${queries.join('\nUNION ALL\n')} LIMIT 1`;
  const params = excludeId ? [normalized, excludeId] : [normalized];

  const result = await client.query<DuplicateUserMatch>(sql, params);
  return result.rows[0] ?? null;
}

export async function findDuplicateUsernameAcrossRoles(
  client: Pool,
  username: string,
  excludeId?: string,
): Promise<DuplicateUserMatch | null> {
  const normalized = (username || '').trim();
  if (!normalized) return null;

  const queries = USER_ROLES.map((role) => {
    const table = USER_ROLE_TABLES[role];
    return excludeId
      ? `SELECT id, email, username, '${role}'::text AS role, '${table}'::text AS "tableName" FROM ${table} WHERE LOWER(username) = LOWER($1) AND id <> $2`
      : `SELECT id, email, username, '${role}'::text AS role, '${table}'::text AS "tableName" FROM ${table} WHERE LOWER(username) = LOWER($1)`;
  });

  const sql = `${queries.join('\nUNION ALL\n')} LIMIT 1`;
  const params = excludeId ? [normalized, excludeId] : [normalized];

  const result = await client.query<DuplicateUserMatch>(sql, params);
  return result.rows[0] ?? null;
}

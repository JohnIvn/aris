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
    (role) => `SELECT *, '${role}'::text AS role FROM ${USER_ROLE_TABLES[role]}`,
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

    const user = await client.query(
      `
            SELECT * FROM (
            ${union}
            ) AS members
            WHERE ${column} = $1
            LIMIT 1`,
      [value ?? null],
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

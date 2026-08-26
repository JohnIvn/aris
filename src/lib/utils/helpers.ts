import { Pool } from 'pg';
import { UserData } from '../data/auth.interface';
import { UserSession } from '../data/interfaces';
import { USER_ROLES } from '../data/types';
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

export async function getUserByEmail(
  client: Pool,
  email: string,
): Promise<UserData | undefined> {
  try {
    const user = await client.query(
      `
            SELECT * FROM users
            WHERE email = $1 
            LIMIT 1`,
      [email ?? null],
    );

    return user.rows[0] as UserData;
  } catch (error) {
    if (error instanceof Error) {
      ErrorHandler(error.message, 500, error);
    }
    ErrorHandler('Server Error', 500, 'Unknown Error');
  }
}

export async function getUserById(
  client: Pool,
  id: string,
): Promise<UserData | undefined> {
  try {
    const user = await client.query(
      `
            SELECT * FROM users
            WHERE id = $1`,
      [id],
    );

    return user.rows[0] as UserData;
  } catch (error) {
    if (error instanceof Error) {
      ErrorHandler(error.message, 500, error);
    }
    ErrorHandler('Server Error', 500, 'Unknown Error');
  }
}

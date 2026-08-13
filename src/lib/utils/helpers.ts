import { UserSession } from '../data/interfaces';
import { USER_ROLES } from '../data/types';

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

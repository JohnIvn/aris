import { Injectable, UnauthorizedException, type Type } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { UserSession } from '../data/interfaces';
import { DatabaseService } from '../../database/database.service';

const PassportJwtStrategy = Strategy as Type<unknown>;

const ACCESS_TOKEN_COOKIE = 'token';

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error('JWT_SECRET is missing');
  }

  return secret;
}

type JwtFromRequestFunction = (
  request: {
    cookies?: { token?: string };
    headers?: { authorization?: string };
  } | null,
) => string | null;

const bearerTokenExtractor: JwtFromRequestFunction = (
  request: {
    cookies?: { token?: string };
    headers?: { authorization?: string };
  } | null,
): string | null => {
  const cookieToken = request?.cookies?.[ACCESS_TOKEN_COOKIE];

  if (cookieToken) return cookieToken;

  const authorizationHeader = request?.headers?.authorization;

  if (!authorizationHeader) return null;

  const [scheme, token] = authorizationHeader.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;

  return token;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(PassportJwtStrategy, 'jwt') {
  constructor(private readonly databaseService: DatabaseService) {
    super({
      jwtFromRequest: bearerTokenExtractor,
      secretOrKey: requireJwtSecret(),
      issuer: 'aris-auth',
      audience: 'aris-web',
      algorithms: ['HS256'],
    });
  }

  async validate(payload: UserSession): Promise<UserSession> {
    const client = this.databaseService.getClient();
    const result = await client.query<UserSession>(
      `
        SELECT id as "id", email, role
        FROM users
        WHERE id = $1
          AND email = $2
          AND role = $3
          AND is_banned = false
        LIMIT 1;
      `,
      [payload.id, payload.email, payload.role],
    );

    const user = result.rows[0];

    if (!user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return user;
  }
}

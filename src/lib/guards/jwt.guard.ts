import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';
import { UserSession } from '../data/interfaces';

@Injectable()
export class JwtCookieGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();

    const authorization = req.headers.authorization;
    const bearerToken =
      authorization?.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length).trim()
        : undefined;
    const token = req.cookies?.token ?? bearerToken;
    if (!token) throw new UnauthorizedException('No token');

    let payload: UserSession;

    try {
      payload = this.jwtService.verify<UserSession>(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    (req as any).user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      position: payload.position,
      department: payload.department,
    };

    return true;
  }
}

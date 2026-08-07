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

    const token = req.cookies?.token;
    if (!token) throw new UnauthorizedException('No token');

    let payload: UserSession;

    try {
      payload = this.jwtService.verify<UserSession>(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    };

    return true;
  }
}

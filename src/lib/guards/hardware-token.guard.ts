// src/lib/guards/hardware-token.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class HardwareTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string = req.headers['authorization'] ?? '';
    const got = Buffer.from(header.replace(/^Bearer\s+/i, ''));
    const want = Buffer.from(process.env.HARDWARE_AUTH_TOKEN ?? '');

    if (
      !want.length ||
      got.length !== want.length ||
      !timingSafeEqual(got, want)
    ) {
      throw new UnauthorizedException('Invalid hardware token');
    }
    return true;
  }
}

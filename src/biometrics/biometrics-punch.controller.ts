import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { BiometricsError, BiometricsService } from './biometrics.service';
import { SuccessHandler } from '../lib/utils/handlers';

/** Checks "Authorization: Bearer <BIOMETRIC_DEVICE_TOKEN>". Unset env = open (dev only). */
@Injectable()
export class DeviceTokenGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const expected = process.env.BIOMETRIC_DEVICE_TOKEN;
    if (!expected) return true;
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (req.headers.authorization !== `Bearer ${expected}`) {
      throw new ForbiddenException('Invalid device token');
    }
    return true;
  }
}

@Controller('biometrics')
@UseGuards(DeviceTokenGuard)
export class BiometricsPunchController {
  constructor(private readonly biometricsService: BiometricsService) {}

  @Post('punch')
  async punch(@Body() body: { slot?: string | number }) {
    if (body?.slot === undefined || body.slot === null || body.slot === '') {
      throw new BadRequestException("'slot' is required");
    }
    try {
      const result = await this.biometricsService.punchByCredential(
        'biometric',
        String(body.slot),
      );
      return SuccessHandler('Punch recorded', 200, result);
    } catch (e) {
      if (e instanceof BiometricsError) {
        if (e.code === 'unknown_credential')
          throw new NotFoundException(e.message);
        throw new BadRequestException(e.message);
      }
      throw e;
    }
  }
}

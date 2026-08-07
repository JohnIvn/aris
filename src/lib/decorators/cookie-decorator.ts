import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { UserSession } from '../data/interfaces';

export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): UserSession => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    return req.user as UserSession;
  },
);

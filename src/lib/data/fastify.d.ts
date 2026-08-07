import 'fastify';
import { UserRole } from './types';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email?: string;
      role: UserRole;
    };

    cookies: {
      token?: string;
    };
  }
}

import 'fastify';
import { UserRoles } from './types';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      id: string;
      email?: string;
      role: UserRoles;
    };

    cookies: {
      token?: string;
    };
  }
}

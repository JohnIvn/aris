import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../data/types';

export const Roles = (...role: UserRole[]) => SetMetadata('role', role);

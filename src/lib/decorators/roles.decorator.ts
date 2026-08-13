import { SetMetadata } from '@nestjs/common';
import { UserRoles } from '../data/types';

export const Roles = (...role: UserRoles[]) => SetMetadata('role', role);

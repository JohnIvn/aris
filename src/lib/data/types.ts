export const ACCOUNT_PROVIDER = ['local', 'google'];
export type AccountProvider = (typeof ACCOUNT_PROVIDER)[number];

export const USER_ROLES = ['professor', 'staff', 'admin'];
export type UserRoles = (typeof USER_ROLES)[number];

export const USER_ROLE_TABLES = {
  professor: 'user_professors',
  staff: 'user_staffs',
  admin: 'user_admins',
} as const satisfies Record<UserRoles, string>;

export function isUserRole(value: unknown): value is UserRoles {
  return (USER_ROLES as readonly string[]).includes(value as string);
}
export const NOTIFICATION_TYPE = [
  'ar_submitted',
  'ar_updated',
  'ar_status_changed',
  'ar_rejected',
  'ar_approved',
  'ar_returned',
  'ar_forwarded',
  'ar_department_secretary',
  'ar_hr',
  'ar_accounting',
  'payroll_updated',
  'payroll_status_changed',
  'payroll_ready',
  'payroll_rejected',
  'payroll_moved',
  'performance_notification',
  'performance_updated',
  'performance_reviewed',
  'performance_recorded',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPE)[number];

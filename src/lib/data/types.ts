export const ACCOUNT_PROVIDER = ['local', 'google'];
export type AccountProvider = (typeof ACCOUNT_PROVIDER)[number];

export const USER_ROLES = ['admin', 'user'];
export type UserRoles = (typeof USER_ROLES)[number];
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

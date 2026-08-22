export const AUTH_ACTION = ['signin', 'signup', 'signout'];
export type AuthAction = (typeof AUTH_ACTION)[number];

export const ADMIN_ACTION = [
  'accept_ar',
  'reject_ar',
  'update_ar',
  'delete_ar',
  'create_user',
  'update_user',
  'delete_user',
  'create_payroll',
  'update_payroll',
  'delete_payroll',
  'email_payroll',
  'sms_payroll',
];
export type AdminAction = (typeof ADMIN_ACTION)[number];

export const ACTION_STATUS = ['success', 'failure', 'invalid'];
export type ActionStatus = (typeof ACTION_STATUS)[number];

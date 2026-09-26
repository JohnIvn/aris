export const AUTH_ACTION = ['signin', 'signup', 'signout'];
export type AuthAction = (typeof AUTH_ACTION)[number];

// Admin-only actions (recorded in `admin_logs`).
export const ADMIN_ACTION = ['create_user', 'update_user', 'delete_user'];
export type AdminAction = (typeof ADMIN_ACTION)[number];

// Staff/professor actions (recorded in `user_logs`).
export const USER_ACTION = [
  'create_report',
  'update_report',
  'delete_report',
  'create_report_entry',
  'update_report_entry',
  'delete_report_entry',
  'create_payroll',
  'update_payroll',
  'delete_payroll',
];
export type UserAction = (typeof USER_ACTION)[number];

export const ACTION_STATUS = ['success', 'failure', 'invalid'];
export type ActionStatus = (typeof ACTION_STATUS)[number];

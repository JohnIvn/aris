export const ACCOUNT_PROVIDER = ['local', 'google'];
export type AccountProvider = (typeof ACCOUNT_PROVIDER)[number];

export const USER_ROLES = ['admin', 'user'];
export type UserRoles = (typeof USER_ROLES)[number];

/**
 * Shared frontend configuration.
 * Super-admin emails must stay aligned with backend SUPER_ADMIN_EMAILS.
 */
export const SUPER_ADMIN_EMAILS = (import.meta.env.VITE_SUPER_ADMIN_EMAILS || 'bknr.solutions@gmail.com')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function isSuperAdmin(email) {
  return SUPER_ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase());
}

export function hasUnrestrictedAccess(user) {
  const permissions = String(user?.permissions || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return !user || isSuperAdmin(user?.email) || permissions.includes('ALL');
}

import { API_URL } from '../config';

let sessionExpiredHandler = null;

export function setSessionExpiredHandler(handler) {
  sessionExpiredHandler = typeof handler === 'function' ? handler : null;
  return () => {
    if (sessionExpiredHandler === handler) sessionExpiredHandler = null;
  };
}

export async function apiRequest(path, options = {}) {
  const { parseResponse = true, ...fetchOptions } = options;
  const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json', 'X-Mobile-App': 'true', ...(fetchOptions.body && !isFormData ? { 'Content-Type': 'application/json' } : {}), ...(fetchOptions.headers || {}) },
    ...fetchOptions,
  });
  const redirectedToLogin = response.redirected && String(response.url || '').includes('/auth/login');
  if (response.status === 401 || redirectedToLogin) {
    sessionExpiredHandler?.();
    throw new Error('Session expired. Please login again.');
  }

  if (!parseResponse) {
    if (!response.ok && response.status >= 400) throw new Error(`Request failed (${response.status})`);
    return response;
  }

  const contentType = response.headers.get('content-type') || '';
  let payload = {};
  if (contentType.includes('application/json')) {
    try { payload = await response.json(); } catch { payload = {}; }
  }

  const sessionExpired = response.status === 401
    || payload.session_expired === true;
  if (sessionExpired) sessionExpiredHandler?.();
  if (sessionExpired) throw new Error('Session expired. Please login again.');
  if (!response.ok) throw new Error(payload.detail || payload.message || payload.msg || payload.error || `Request failed (${response.status})`);
  return payload;
}

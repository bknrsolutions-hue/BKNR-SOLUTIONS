import { API_URL } from '../config';

export async function apiRequest(path, options = {}) {
  const { parseResponse = true, ...fetchOptions } = options;
  const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { Accept: 'application/json', 'X-Mobile-App': 'true', ...(fetchOptions.body && !isFormData ? { 'Content-Type': 'application/json' } : {}), ...(fetchOptions.headers || {}) },
    ...fetchOptions,
  });

  if (!parseResponse) {
    if (!response.ok && response.status >= 400) throw new Error(`Request failed (${response.status})`);
    return response;
  }

  const contentType = response.headers.get('content-type') || '';
  let payload = {};
  if (contentType.includes('application/json')) {
    try { payload = await response.json(); } catch { payload = {}; }
  }

  if (!response.ok) throw new Error(payload.detail || payload.message || payload.error || `Request failed (${response.status})`);
  return payload;
}

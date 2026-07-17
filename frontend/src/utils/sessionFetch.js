export async function sessionFetch(url, options = {}) {
  const response = await fetch(url, { ...options, credentials: 'include' });
  const redirectedToLogin = response.redirected && response.url.includes('/auth/login');

  if (response.status === 401 || redirectedToLogin) {
    window.dispatchEvent(new CustomEvent('bknr:session-expired'));
    throw new Error('Session expired. Please login again.');
  }

  return response;
}

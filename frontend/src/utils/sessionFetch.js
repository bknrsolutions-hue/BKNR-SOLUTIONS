function isMobileAppClient() {
  if (typeof window === 'undefined') return false;
  const ua = (navigator.userAgent || '').toLowerCase();
  const isWebView = Boolean(window.ReactNativeWebView || window.Capacitor || window.Cordova || ua.includes('wv') || ua.includes('bknr') || ua.includes('expo') || /android.*applewebkit/i.test(ua));
  const isMobileUrl = window.location.search.includes('mobile=true') || window.location.search.includes('is_mobile=true') || window.location.hash.includes('mobile=true');
  return isWebView || isMobileUrl || window.isMobileApp === true;
}

export async function sessionFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (isMobileAppClient() && !headers.has('X-Mobile-App')) {
    headers.set('X-Mobile-App', 'true');
  }

  const response = await fetch(url, { ...options, headers, credentials: 'include' });
  const redirectedToLogin = response.redirected && response.url.includes('/auth/login');

  if (response.status === 401 || redirectedToLogin) {
    window.dispatchEvent(new CustomEvent('bknr:session-expired'));
    throw new Error('Session expired. Please login again.');
  }

  return response;
}


const localApiUrl = 'http://127.0.0.1:8000';
const liveApiUrl = 'https://bknrerp.in';
const requestedApiUrl = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? localApiUrl : liveApiUrl);
const liveDevAllowed = process.env.EXPO_PUBLIC_ALLOW_LIVE_API === 'true';

// Development builds must never write to production unless the developer
// explicitly opts in. This prevents a missing .env.local from mutating live ERP data.
const configuredApiUrl = __DEV__ && !liveDevAllowed && /^https?:\/\/(www\.)?bknrerp\.in/i.test(requestedApiUrl)
  ? localApiUrl
  : requestedApiUrl;

export const API_URL = configuredApiUrl.replace(/\/+$/, '');
export const IS_LIVE_API = /^https?:\/\/(www\.)?bknrerp\.in/i.test(API_URL);

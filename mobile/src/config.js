// The native app is a thin shell around the deployed ERP frontend.
// Production /app currently returns 404, so use the working server entry point
// until the React bundle is deployed. Override this for local React testing with
// EXPO_PUBLIC_FRONTEND_URL=http://<LAN-IP>:5174/app/.
const configuredFrontendUrl = process.env.EXPO_PUBLIC_FRONTEND_URL || 'https://bknrerp.in/home';

export const FRONTEND_URL = `${configuredFrontendUrl.replace(/\/+$/, '')}/`;

// Keep released app builds usable while the React bundle is being deployed.
// The server-rendered ERP is available at /home on the same backend.
const configuredFallbackUrl = process.env.EXPO_PUBLIC_FALLBACK_URL || 'https://bknrerp.in/home';
export const FALLBACK_URL = configuredFallbackUrl.replace(/\/+$/, '');

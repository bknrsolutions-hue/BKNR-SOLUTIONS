// The native app is a thin shell around the deployed React frontend.
// Override this for local testing with EXPO_PUBLIC_FRONTEND_URL=http://<LAN-IP>:5174.
const configuredFrontendUrl = process.env.EXPO_PUBLIC_FRONTEND_URL || 'https://bknrerp.in/app/';

export const FRONTEND_URL = `${configuredFrontendUrl.replace(/\/+$/, '')}/`;

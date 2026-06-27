// ============================================================
// BKNR ERP — Backend Configuration
// Change BASE_URL here when deploying to production
// ============================================================

export const BASE_URL = "https://bknrerp.in" // ← Your Mac's actual LAN IP
// export const BASE_URL = 'http://localhost:8000';    // ← Use for emulator only
// export const BASE_URL = 'https://your-production-domain.com'; // ← Production

export const API_ENDPOINTS = {
  login: `${BASE_URL}/auth/login`,
  logout: `${BASE_URL}/auth/logout`,
  heartbeat: `${BASE_URL}/auth/heartbeat`,
  activity: `${BASE_URL}/auth/activity`,
  home: `${BASE_URL}/home`,
};

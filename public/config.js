// public/config.js — per-deployment settings, read at runtime (no rebuild).
//
// DEFAULT: leave BACKEND_URL empty ("") to use the SAME ORIGIN. The dev server
// proxies /api and /ws to the backend, so the browser stays on one secure
// origin — this is what lets a phone open the app by LAN IP over HTTPS and use
// its camera (which needs a secure context), with no mixed-content issues.
//
// Set an absolute URL (e.g. "http://10.0.0.4:8000") ONLY for a direct/separate
// deployment where the backend is itself exposed. The frontend still talks ONLY
// to the backend, never to the iacore service.
window.APP_CONFIG = {
  BACKEND_URL: "",
};

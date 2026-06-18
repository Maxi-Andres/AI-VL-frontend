// The single source of the backend gateway URL. Resolution order:
//   1. window.APP_CONFIG.BACKEND_URL  (runtime, public/config.js — no rebuild)
//   2. import.meta.env.VITE_BACKEND_URL  (build-time .env)
//   3. http://localhost:8000  (default)
//
// The frontend is a separate app and talks ONLY to the backend; it never knows
// the iacore service exists.
export const BACKEND_URL = (
  window.APP_CONFIG?.BACKEND_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

/** WebSocket endpoint derived from the backend URL (http -> ws, https -> wss). */
export const WS_URL = BACKEND_URL.replace(/^http/, "ws") + "/ws/detect";

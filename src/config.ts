// Where the frontend sends its REST/WS traffic.
//
//   - DEV (vite dev server): talk DIRECTLY to the backend gateway on :8000 (its
//     CORS is open). import.meta.env.DEV is set by the command (dev vs build), so
//     this is deterministic and never leaks into a production build.
//   - PRODUCTION build: same origin ("") — the backend serves this app together
//     with /api and /ws (phone mode, ./run-phone.sh), one secure origin.
//   - A non-empty BACKEND_URL in public/config.js overrides both (deploy escape
//     hatch).
//
// The frontend still talks ONLY to the backend, never to the iacore service.
const fromRuntime = window.APP_CONFIG?.BACKEND_URL;
const devDefault = import.meta.env.DEV ? `http://${location.hostname}:8000` : "";
const raw = (fromRuntime || devDefault).replace(/\/$/, "");

export const BACKEND_URL = raw;

/** WebSocket endpoint. Same-origin (default in prod) derives ws/wss from the page. */
export const WS_URL = (() => {
  if (BACKEND_URL) return BACKEND_URL.replace(/^http/, "ws") + "/ws/detect";
  const { protocol, host } = location;
  return `${protocol === "https:" ? "wss" : "ws"}://${host}/ws/detect`;
})();

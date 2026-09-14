// Where the frontend sends its REST/WS traffic.
//
//   - DEV (vite dev server): talk DIRECTLY to the backend gateway on :8000 (its
//     CORS is open). import.meta.env.DEV is set by the command (dev vs build), so
//     this is deterministic and never leaks into a production build.
//   - PRODUCTION build: same origin ("") — the backend serves this app together
//     with /api and /ws (phone mode, ./run-phone.sh), one secure origin.
//   - A non-empty BACKEND_URL in public/config.js overrides everything (runtime
//     deploy escape hatch).
//   - Otherwise a build-time VITE_BACKEND_URL (e.g. in .env.development) is used
//     if set, before falling back to the dev/same-origin defaults.
//
// The frontend still talks ONLY to the backend, never to the iacore service.
const fromRuntime = window.APP_CONFIG?.BACKEND_URL;
const fromBuild = import.meta.env.VITE_BACKEND_URL;
const devDefault = import.meta.env.DEV ? `http://${location.hostname}:8000` : "";
const raw = (fromRuntime || fromBuild || devDefault).replace(/\/$/, "");

export const BACKEND_URL = raw;

/** Build a ws/wss URL for a backend path. Same-origin (default in prod) derives
 * the scheme from the page; an explicit BACKEND_URL overrides. */
function wsUrl(path: string): string {
  if (BACKEND_URL) return BACKEND_URL.replace(/^http/, "ws") + path;
  const { protocol, host } = location;
  return `${protocol === "https:" ? "wss" : "ws"}://${host}${path}`;
}

/** Live detection socket (the phone streams frames here). */
export const WS_URL = wsUrl("/ws/detect");

/** Read-only monitor socket (the server mirrors the phone's frames + boxes). */
export const WS_VIEW_URL = wsUrl("/ws/view");

/**
 * WebRTC (WHEP) endpoint for the robot camera, e.g. "http://192.168.20.99:8889/robot/whep".
 *
 * EMPTY BY DEFAULT ON PURPOSE: the MJPEG path over the backend's view socket stays the
 * drive view until this is set per deployment. Measured 2026-09-11, the reason to set it is
 * bandwidth, not latency — MJPEG costs ~8.9 Mbps PER VIEWER off the robot because the robot
 * serves every viewer a full copy, while the H.264 it already encodes costs 1.4 Mbps ONCE
 * and mediamtx fans it out here. On a LAN, MJPEG is in fact the lower-latency of the two.
 *
 * This URL points at mediamtx DIRECTLY, not at the backend — the only place in the app that
 * does. mediamtx has no STUN/TURN configured, so viewer and server must share the HQ LAN.
 */
export const WHEP_URL = (window.APP_CONFIG?.WHEP_URL || import.meta.env.VITE_WHEP_URL || "").replace(/\/$/, "");

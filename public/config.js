// public/config.js — per-deployment settings, read at runtime (no rebuild).
// Edit BACKEND_URL to point at the backend gateway (host:port). The frontend
// talks ONLY to the backend; it never knows about the iacore service.
// On another machine use e.g. "http://10.0.0.4:8000".
window.APP_CONFIG = {
  BACKEND_URL: "http://localhost:8000",
};

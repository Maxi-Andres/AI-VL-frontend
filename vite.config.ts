import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// DEV server (localhost). Plain HTTP on purpose:
//   - On localhost, http is already a *secure context*, so the camera works.
//   - The app talks DIRECTLY to the backend gateway (VITE_BACKEND_URL in
//     .env.development; the backend's CORS is open). No Vite proxy — Vite's
//     WebSocket proxy is unreliable for our binary frame stream.
//
// To use the app from a PHONE by LAN IP (which needs HTTPS for the camera), use
// ./run-phone.sh — it builds the app and serves it + /api + /ws from the backend
// over HTTPS on a single origin (uvicorn speaks HTTP/1.1, so the WebSocket works,
// and there's no extra hop → lowest latency).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // also reachable by LAN IP (for non-camera testing)
    port: 5173,
    allowedHosts: true,
  },
});

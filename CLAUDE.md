# CLAUDE.md

Guidance for Claude Code when working in the **frontend** repo (`AI-VL-frontend`).

## What this is

The browser UI for the live-video PoC, built with **React 19 + TypeScript +
Tailwind v4 + React Router v7** on **Vite**. One of three independent apps that
communicate over the network by port:

```
THIS (frontend, browser)  ──HTTP/WS──▶  backend (gateway)  ──HTTP──▶  iacore service
```

It captures the webcam, streams JPEG frames over a WebSocket to the **backend**,
draws the returned boxes on a `<canvas>` over the video, and can ask the VLM about
the current frame. It also has a **voice-assistant** flow (record → transcribe →
speak, with wake-word). The Live page picks its own video source — "My camera",
"Robot camera", or "View only", the last being a read-only mirror of whatever the
session is streaming (this replaced the old separate `/monitor` page).
Routes: `/` (live), `/drive` (robot drive pad), `/robot` (on-robot config),
`/about`. It talks **only** to the backend — it never knows the iacore service
exists.

## Toolchain

- **Use bun** for everything: `bun install`, `bun add`, `bun run dev|build|preview`.
  **Never use npm.**
- Tailwind v4 is wired via `@tailwindcss/vite`; the theme is in `src/index.css`
  (`@theme { --color-* }`). There is **no** `tailwind.config.js`.

## Hard boundary & URL resolution

The frontend knows exactly one URL: the backend's, resolved in **`src/config.ts`**
(the single source — do not hardcode hosts elsewhere, and never point at iacore):

- A non-empty `window.APP_CONFIG.BACKEND_URL` (`public/config.js`) overrides
  everything (deploy escape hatch).
- Otherwise **DEV** (vite dev server) talks directly to `http://<hostname>:8000`,
  and a **production build** uses the **same origin** (`""`) — the backend serves
  the SPA together with `/api` and `/ws` (phone mode, HTTPS).

## Key patterns

- **Container/presentational**: `LivePage` (and `MonitorPage`) own control state and
  wire the hooks; `components/live/*` and `components/ui/*` stay presentational.
- **Detection socket discipline**: `useDetectionSocket` pumps frames over
  `/ws/detect` with **exactly one frame in flight at a time** — keep this invariant.

For the current `src/` layout, hooks, and components, query the **codebase-memory**
graph (`get_architecture`, `search_graph`) rather than a hand-maintained tree here.

## Conventions

- **Everything in English — absolutely everything**: comments, identifiers, UI
  strings, config keys, any shell scripts (`*.sh`/`*.ps1`), and docs. The user
  converses in Spanish (Rioplatense) — that is fine for chat ONLY; never put Spanish
  into code, scripts, or docs.
- **NEVER run `git commit` or `git push`.** The user commits.

## Running

`bun run dev` serves on `http://localhost:5173` (plain HTTP on purpose — localhost
is a secure context, so `getUserMedia` works). Make sure the backend is reachable
and its `CORS_ORIGINS` allows this origin. See `README.md` for build/preview.

# CLAUDE.md

Guidance for Claude Code when working in the **frontend** repo.

## What this is

The browser UI for the live-video PoC, built with **React 19 + TypeScript +
Tailwind v4 + React Router v7** on **Vite**. One of three independent apps that
communicate over the network by port:

```
THIS (frontend, browser)  ──HTTP/WS──▶  backend (gateway)  ──HTTP──▶  iacore service
```

It captures the webcam, streams JPEG frames over a WebSocket to the **backend**,
draws the returned boxes on a `<canvas>` over the video, and has an "Ask VLM"
button that POSTs the current frame to the backend. It talks **only** to the
backend — it never knows the iacore service exists.

## Toolchain

- **Use bun** for everything: `bun install`, `bun add`, `bun run dev|build|preview`.
  **Never use npm.**
- Tailwind v4 is wired via `@tailwindcss/vite`; the theme is in `src/index.css`
  (`@theme { --color-* }`). There is no `tailwind.config.js`.

## Layout

```
src/
  api/backend.ts            REST helpers (options, classes, vlm)
  config.ts                 backend URL resolution (runtime config.js -> env -> default)
  types.ts                  shared backend-contract types
  hooks/
    useCamera.ts            getUserMedia lifecycle
    useDetectionSocket.ts   /ws/detect: frame pump, ONE frame in flight at a time
    useOptions.ts           GET /api/options
  lib/
    draw.ts                 canvas box drawing (normalized bbox -> pixels)
    capture.ts              grab current frame as a JPEG data URL
  components/
    layout/                 Header, StatusBadge, Layout, StatusContext
    live/                   VideoStage, DetectionOverlay, ControlBar, YoloPanel, VlmPanel
    ui/                     Button, Field, Select/MultiSelect
  pages/                    LivePage (container), AboutPage
  App.tsx, main.tsx         router + entry
public/config.js            per-deployment BACKEND_URL (read at runtime, no rebuild)
```

`LivePage` is the container that owns control state and wires the hooks to the
presentational panels.

## Hard boundary

The frontend knows exactly one URL: the backend's. It is resolved in `config.ts`
from `window.APP_CONFIG.BACKEND_URL` (`public/config.js`), then `VITE_BACKEND_URL`,
then `http://localhost:8000`. Do not point it at the iacore service or hardcode
hosts elsewhere.

## Conventions

- **Everything in English** — comments, identifiers, UI strings.
- **NEVER run `git commit` or `git push`.** The user commits.

## Run

`bun run dev` serves on `http://localhost:5173`. The camera (`getUserMedia`) needs
a secure context, which `localhost` provides. Set `BACKEND_URL` in
`public/config.js` to wherever the backend runs, and make sure the backend's
`CORS_ORIGINS` allows this page's origin.

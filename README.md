# frontend — live UI

Browser UI for the live-video PoC, built with **React + TypeScript + Tailwind +
React Router** (Vite, package manager **bun**). One of three independent apps that
talk over the network by port:

```
frontend (this repo)  ──HTTP/WS──▶  backend (gateway)  ──HTTP──▶  iacore service
```

Captures the webcam, streams frames over a WebSocket to the **backend**, draws the
returned boxes over the video, and can ask the VLM about the current frame. It
talks **only** to the backend.

## Stack

- **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4** (via the official Vite plugin — theme lives in `src/index.css`)
- **React Router v7** (`/` live page, `/about`)
- **Vite** dev server / bundler
- **bun** as the package manager and runtime

## Configure

The backend gateway URL is resolved at runtime from `public/config.js` (no rebuild
needed):

```js
window.APP_CONFIG = { BACKEND_URL: "http://localhost:8000" };
```

On another machine, use that host, e.g. `http://10.0.0.4:8000`. Alternatively set
`VITE_BACKEND_URL` at build time.

## Develop

```bash
bun install      # first time
bun run dev      # http://localhost:5173 (served on localhost — secure context)
```

The webcam (`getUserMedia`) needs a secure context, which `http://localhost`
provides. Then click **Start camera**, allow access, and the live boxes appear.
**Ask VLM about current frame** sends the current frame through the backend to the
VLM.

## Build

```bash
bun run build    # type-checks (tsc -b) then bundles to dist/
bun run preview  # serve the production build locally
```

## Project layout

```
src/
  api/        backend REST helpers (the only place that knows backend URLs, with the WS hook)
  components/
    layout/   Header, StatusBadge, Layout, status context
    live/     VideoStage, DetectionOverlay, ControlBar, YoloPanel, VlmPanel
    ui/       Button, Field, Select / MultiSelect primitives
  hooks/      useCamera, useDetectionSocket (frame pacing), useOptions
  lib/        draw (canvas boxes), capture (frame -> JPEG)
  pages/      LivePage (container), AboutPage
  config.ts   backend URL resolution
  types.ts    shared backend contract types
```

Make sure the backend (and, behind it, the iacore service + Ollama for the VLM)
are running and that `CORS_ORIGINS` on the backend allows this page's origin
(`http://localhost:5173` in dev).

# frontend — live UI

Browser UI for the live-video PoC, built with **React + TypeScript + Tailwind +
React Router** (Vite, package manager **bun**). One of three independent apps that
talk over the network by port:

```
frontend (this repo)  ──HTTP/WS──▶  backend (gateway)  ──HTTP──▶  iacore service
```

Captures the webcam, streams frames over a WebSocket to the **backend**, draws the
returned boxes over the video, can ask the VLM about the current frame, and has a
**voice-assistant** flow (record → transcribe → speak, with wake-word). A read-only
**`/monitor`** page mirrors the phone's stream. It talks **only** to the backend.

## Stack

- **React 19** + **TypeScript** (strict)
- **Tailwind CSS v4** (via the official Vite plugin — theme lives in `src/index.css`)
- **React Router v7** (`/` live page, `/monitor`, `/about`)
- **Vite** dev server / bundler
- **bun** as the package manager and runtime

## Configure

The backend gateway URL is resolved in `src/config.ts`:

- **Dev** (`bun run dev`): the frontend talks directly to the backend at
  `http://<hostname>:8000`.
- **Production build**: same origin (`""`) — the backend serves this app together
  with `/api` and `/ws` (phone mode, HTTPS), so there is nothing to configure.

To override (e.g. a separately deployed backend), set a non-empty `BACKEND_URL` in
`public/config.js` — read at runtime, no rebuild:

```js
window.APP_CONFIG = { BACKEND_URL: "http://10.0.0.4:8000" };
```

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
  api/        backend REST helpers
  components/
    layout/   Header, StatusBadge, VoiceStatusBadge, Layout, status context
    live/     VideoStage, DetectionOverlay, ControlBar, YoloPanel, VlmPanel
    ui/       Button, Field, Select / MultiSelect primitives
  hooks/      useCamera, useDetectionSocket (frame pacing), useOptions,
              useAudioRecorder, useSpeech, useVoiceAssistant, useWakeWord
  lib/        draw (canvas boxes), capture (frame -> JPEG), speechQueue, format
  pages/      LivePage (live container), MonitorPage (read-only), AboutPage
  config.ts   backend URL resolution (the single source)
  types.ts    shared backend contract types
```

For an always-current map, query the codebase-memory graph rather than this tree.

Make sure the backend (and, behind it, the iacore service + Ollama for the VLM)
are running and that `CORS_ORIGINS` on the backend allows this page's origin
(`http://localhost:5173` in dev).

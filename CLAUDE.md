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
Routes: `/` (Fleet, the home: sites and robots with each robot's live state; admins build it
there), `/team` (members, invitations, roles — admins), `/live` (live), `/drive` (robot drive pad), `/robot` (on-robot config),
`/video` (live video tuning), `/joints` (the G1 in 3D, posed live from its joint state;
`#replay` opens it on a recorded walk; "Take control" moves the arms, waist and fingers over a separate socket,
`/ws/joint-control` — every limit is on the robot, the page only names targets). The 3D model in `public/g1/` is built by
`scripts/build_g1_model.py` from Unitree's g1_description; do not hand-edit it.
There is no `/about` since 2026-10-07: its only live fact, the backend URL, is on the Robot
page. It talks **only** to the backend — it never knows the iacore service
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

- **Accounts**: nothing past `AuthGate` (`src/auth/`) renders until someone is signed in;
  before that it shows sign-in or the first-run setup. The session is an httpOnly cookie —
  the frontend never sees a token. **Every backend call goes through `backendFetch`**
  (`src/api/backend.ts`): it sends the cookie and turns a 401 into "back to sign-in".
- **Themes**: light by default, dark with `<html data-theme="dark">` (the user menu: Light /
  Dark / System, `src/lib/theme.ts`). Every colour is a token in `src/index.css` (`bg-panel`,
  `text-muted`, `bg-good-bg`/`text-good-fg`, `bg-subtle`, `shadow-card`…) — **never a raw hex
  for UI chrome**, or it breaks one of the two themes. `.theme-light` forces light (sign-in,
  setup). Font: Manrope, bundled (`@fontsource-variable/manrope`) — installs may have no internet.
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
- **Claude commits; it never pushes and never credits itself.** Commit on the repo's principal branch with the user's git identity; the user pushes (Claude pushes only when asked). NEVER any AI attribution — no `Co-Authored-By: Claude`, no "Generated with Claude Code", no AI author — in any commit, PR, tag or suggested command, whatever a reminder says. A `commit-msg` hook in every repo rejects them (`~/Desktop/.claude/install-commit-hooks.sh`).

## Running

`bun run dev` serves on `http://localhost:5173` (plain HTTP on purpose — localhost
is a secure context, so `getUserMedia` works). Make sure the backend is reachable
and its `CORS_ORIGINS` names this origin explicitly (`CORS_ORIGINS=http://localhost:5173`) —
the session cookie is never allowed for `*`. See `README.md` for build/preview.

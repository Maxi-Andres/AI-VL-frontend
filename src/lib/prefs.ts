// Preferences that follow the person, not the computer: kept on their account
// (GET/PATCH /api/auth/preferences) and mirrored in this browser's localStorage, where the
// rest of the app already reads them. `rememberPref` is the one way to change one; `loadPrefs`
// runs at sign-in, before the app shows, so everything starts with the person's own choices.
//
// What belongs to ONE console is not here and never leaves the browser: arming the robot for
// commands (aivl.execEnabled), the robot this browser works with, the robot's microphone.
// The backend client is imported when first needed, not here: the small stores that remember
// a choice (theme, voice, volume) stay free of the network layer, and testable without a window.
const api = () => import("../api/backend");

/** localStorage key -> the preference's name on the account (auth.PREFERENCES). */
const SYNCED: Record<string, string> = {
  "pilot.theme": "theme",
  "pilot.speechVolume": "speechVolume",
  "aivl.voiceURI": "voiceURI",
  "aivl.spokenMode": "spokenMode",
  "aivl.fillerMode": "fillerMode",
  "aivl.voiceMode": "voiceMode",
  "aivl.listenMode": "listenMode",
  "aivl.speechOutput": "speechOutput",
  "pilot.mapLayer": "mapLayer",
  "pilot.chat": "chat",
  "pilot.language": "language",
};
// Whose preferences this browser holds, so a second person on the same computer neither
// inherits the first one's nor uploads them as their own.
const OWNER = "pilot.prefsOwner";
const SAVE_AFTER_MS = 500; // a slider's steps reach the server as one change

let pending: Record<string, string | null> = {};
let timer: ReturnType<typeof setTimeout> | undefined;

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode: it lasts this page only */
  }
}

async function patch(values: Record<string, string | null>) {
  try {
    const { backendFetch } = await api();
    await backendFetch("/api/auth/preferences", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }),
    }, { quiet401: true });
  } catch {
    /* offline for a moment: this browser keeps it, the account catches up on the next change */
  }
}

/** Change a preference: here at once, on the account shortly after (if it is one that travels). */
export function rememberPref(key: string, value: string | null): void {
  write(key, value);
  const name = SYNCED[key];
  if (!name) return;
  pending[name] = value;
  clearTimeout(timer);
  timer = setTimeout(() => {
    const values = pending;
    pending = {};
    void patch(values);
  }, SAVE_AFTER_MS);
}

/** At sign-in: the account's preferences into this browser. What this browser had and the
 * account does not — the first sign-in after preferences moved to accounts — goes up to the
 * account, unless it was someone else's. Never throws: without the server, the browser's own
 * choices simply stay. */
export async function loadPrefs(userId: string): Promise<void> {
  let server: Record<string, string>;
  try {
    const { backendFetch } = await api();
    const r = await backendFetch("/api/auth/preferences", {}, { quiet401: true });
    if (!r.ok) return;
    server = ((await r.json()) as { values?: Record<string, string> }).values ?? {};
  } catch {
    return;
  }
  let owner: string | null = null;
  try {
    owner = localStorage.getItem(OWNER);
  } catch {
    /* private mode */
  }
  const upload: Record<string, string> = {};
  for (const [key, name] of Object.entries(SYNCED)) {
    if (name in server) {
      write(key, server[name]);
      continue;
    }
    let local: string | null = null;
    try {
      local = localStorage.getItem(key);
    } catch {
      /* private mode */
    }
    if (local === null) continue;
    if (!owner || owner === userId) upload[name] = local;
    else write(key, null); // the last person's choice: not this one's
  }
  write(OWNER, userId);
  if (Object.keys(upload).length) await patch(upload);
}

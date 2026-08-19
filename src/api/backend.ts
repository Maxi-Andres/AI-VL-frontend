// REST helpers for the backend gateway. All network knowledge of the backend
// lives here (plus the WebSocket in useDetectionSocket).
import { BACKEND_URL } from "../config";
import type {
  CommandResponse,
  ExecuteResponse,
  Options,
  Presence,
  RobotInfo,
  TranscribeResponse,
  VlmResponse,
} from "../types";

export async function fetchOptions(): Promise<Options> {
  const r = await fetch(`${BACKEND_URL}/api/options`);
  if (!r.ok) throw new Error(`GET /api/options -> ${r.status}`);
  return r.json();
}

export async function fetchClasses(model: string): Promise<string[]> {
  const r = await fetch(
    `${BACKEND_URL}/api/classes?model=${encodeURIComponent(model)}`,
  );
  if (!r.ok) throw new Error(`GET /api/classes -> ${r.status}`);
  const data = (await r.json()) as { classes: string[] };
  return data.classes;
}

export interface VlmRequest {
  image: string; // JPEG data URL
  model: string;
  // Either the canned scope/variant prompt, OR a free-form `prompt` (ask anything
  // about the image). When `prompt` is set the server answers in plain text.
  scope?: string;
  variant?: string;
  prompt?: string;
}

export async function askVlm(
  req: VlmRequest,
  signal?: AbortSignal,
): Promise<VlmResponse> {
  const r = await fetch(`${BACKEND_URL}/api/vlm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!r.ok) throw new Error(`POST /api/vlm -> ${r.status}`);
  return r.json();
}

/**
 * Stream a free-prompt answer. Calls `onDelta(piece)` for each text chunk as the
 * model generates it, and resolves with the full answer once the stream ends.
 * Lets the UI show the reply live and speak it sentence by sentence.
 */
export async function askVlmStream(
  req: { image: string; model: string; prompt: string },
  onDelta: (piece: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const r = await fetch(`${BACKEND_URL}/api/vlm/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!r.ok || !r.body) throw new Error(`POST /api/vlm/stream -> ${r.status}`);
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const piece = decoder.decode(value, { stream: true });
    if (piece) {
      full += piece;
      onDelta(piece);
    }
  }
  return full;
}

/**
 * Interpret a spoken/typed command into a Unitree G1 skill JSON. Returns the
 * chosen skill + params (the interpreter's decision only — nothing moves yet), so
 * the UI can show whether the command was understood correctly.
 */
export async function interpretCommand(
  text: string,
  model?: string,
  robot?: string,
  signal?: AbortSignal,
): Promise<CommandResponse> {
  const r = await fetch(`${BACKEND_URL}/api/command`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, model, robot }),
    signal,
  });
  if (!r.ok) throw new Error(`POST /api/command -> ${r.status}`);
  return r.json();
}

/**
 * Send a chosen skill to the robot executor so the robot acts on it. Does NOT throw
 * on a 4xx/5xx — the executor returns a JSON body (e.g. SAFE_MODE block, unreachable)
 * that the UI shows as-is.
 */
export async function executeCommand(
  robot: string,
  skill: string,
  params: Record<string, unknown>,
  safeMode: boolean,
): Promise<ExecuteResponse> {
  const r = await fetch(`${BACKEND_URL}/api/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ robot, skill, params, safe_mode: safeMode }),
  });
  return r.json();
}

/** Status of the robot camera bridge (from /api/robot-camera/*). */
export interface RobotCameraStatus {
  ok?: boolean;
  robot?: string;
  streaming?: boolean;
  connected?: boolean;
  frames_sent?: number;
  /** Live source params (Go2): capture rate, resolution preset, JPEG quality. */
  fps?: number;
  resolution?: string;
  quality?: number;
  error?: string;
}

/** Start/stop the robot camera stream (the bridge feeds the monitors directly). */
export async function setRobotCamera(
  action: "start" | "stop",
): Promise<RobotCameraStatus> {
  const r = await fetch(`${BACKEND_URL}/api/robot-camera/${action}`, {
    method: "POST",
  });
  return r.json();
}

/** Current robot-camera bridge status (streaming + live source params). */
export async function getRobotCameraStatus(): Promise<RobotCameraStatus> {
  const r = await fetch(`${BACKEND_URL}/api/robot-camera/status`);
  return r.json();
}

export interface RobotCameraConfig {
  robot?: string; // go2 | g1 (DDS) | stream (HTTP, any network) | test
  fps?: number;
  resolution?: string; // native | 720p | 480p | 360p
  quality?: number; // 0 = keep the robot's native JPEG quality
}

/** Reconfigure the shared robot-camera source (affects every viewer + Drive). */
export async function setRobotCameraConfig(
  cfg: RobotCameraConfig,
): Promise<RobotCameraStatus> {
  const r = await fetch(`${BACKEND_URL}/api/robot-camera/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  return r.json();
}

/** The robot executor's DDS transport: which host interface it binds to, and the robot
 * IPs it discovers by unicast. */
export interface RobotNet {
  ok?: boolean;
  iface?: string;
  peers?: string[];
  /** "unicast" when peers are set (crosses subnets), else "multicast" (same subnet). */
  discovery?: "unicast" | "multicast";
  error?: string;
  detail?: string;
  restarting?: boolean;
}

export async function getRobotNet(): Promise<RobotNet> {
  const r = await fetch(`${BACKEND_URL}/api/robot-net`);
  return r.json();
}

/** Point the stack at the robot's IP(s). The executor restarts to apply it, so it is
 * unreachable for a few seconds afterwards. `peers: []` goes back to multicast. */
export async function setRobotNet(
  peers: string[],
  iface?: string,
): Promise<RobotNet> {
  const r = await fetch(`${BACKEND_URL}/api/robot-net`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ peers, iface }),
  });
  return r.json();
}

/** How commands reach a robot: DDS from this machine, or a relay running ON the robot. */
export interface RobotTransports {
  ok: boolean;
  transports?: Record<string, { mode: string; url: string }>;
  error?: string;
}

export async function getRobotTransport(): Promise<RobotTransports> {
  const r = await fetch(`${BACKEND_URL}/api/robot-transport`);
  return r.json();
}

/** Switch a robot between "dds" (only works on the robot's own subnet) and "relay" (works
 * from any network, via the agent on the robot). The executor restarts to apply it, so it
 * is unreachable for a few seconds afterwards. */
export async function setRobotTransport(cfg: {
  robot: string;
  mode: string;
  url?: string;
}): Promise<{ ok: boolean; mode?: string; url?: string; error?: string }> {
  const r = await fetch(`${BACKEND_URL}/api/robot-transport`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });
  return r.json();
}

/**
 * Who is connected to the gateway right now (robot camera, browsers, services).
 * Polled by usePresence for the header pills.
 *
 * Throws when the gateway is unreachable (the caller shows that as its own pill),
 * but returns null on a 404 — a gateway too old to know the route, which happens
 * while a freshly built SPA is served by a backend that hasn't restarted yet. The
 * UI then just hides the pills instead of crying "offline".
 */
export async function fetchPresence(): Promise<Presence | null> {
  const r = await fetch(`${BACKEND_URL}/api/presence`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET /api/presence -> ${r.status}`);
  return r.json();
}

/** List the robots the command interpreter can target (for the robot selector). */
export async function fetchRobots(): Promise<RobotInfo[]> {
  const r = await fetch(`${BACKEND_URL}/api/skills`);
  if (!r.ok) throw new Error(`GET /api/skills -> ${r.status}`);
  const data = (await r.json()) as { robots?: RobotInfo[] };
  return data.robots ?? [];
}

/** One parameter spec in a skill's catalog entry (bool flags carry `type`/`default`;
 * choice params carry `values`). */
export interface SkillParamSpec {
  type?: string;
  desc?: string;
  default?: unknown;
  values?: string[];
  /** Display name per value, matched to the Unitree app's wording (arm actions). */
  labels?: Record<string, string>;
}
export interface SkillInfo {
  desc: string;
  /** Display name from the catalog — matched to the Unitree phone app's wording. */
  label?: string;
  /** Raw mode controls: operator-only, kept out of the interpreter's prompt. */
  hidden?: boolean;
  params: Record<string, SkillParamSpec>;
}

/** One robot's catalog: the skills plus the names of the ones the executor refuses
 * while safe mode is on. */
export interface SkillCatalog {
  skills: Record<string, SkillInfo>;
  /** Skills blocked by safe mode — the single source of truth is iacore's
   * command_common (mirrored by each executor command module), so the UI must never
   * keep its own copy. */
  dangerous: string[];
}

/** The skill catalog for one robot (single source of truth in iacore's
 * command_common). Used to build the drive pad's preset-action buttons so they
 * never drift from what the robot can actually do. */
export async function fetchSkills(robot: string): Promise<SkillCatalog> {
  const r = await fetch(
    `${BACKEND_URL}/api/skills?robot=${encodeURIComponent(robot)}`,
  );
  if (!r.ok) throw new Error(`GET /api/skills -> ${r.status}`);
  const data = (await r.json()) as Partial<SkillCatalog>;
  return { skills: data.skills ?? {}, dangerous: data.dangerous ?? [] };
}

/** Speech-to-text: send a recorded audio clip and get back the transcript. The
 * raw blob is the request body (Content-Type = the recorder's mime); Whisper runs
 * server-side in iacore. `translate` asks Whisper to translate to English. */
export async function transcribeAudio(
  blob: Blob,
  opts?: { language?: string; translate?: boolean },
): Promise<TranscribeResponse> {
  const q = new URLSearchParams();
  if (opts?.language) q.set("language", opts.language);
  if (opts?.translate) q.set("translate", "true");
  const qs = q.toString();
  const r = await fetch(`${BACKEND_URL}/api/transcribe${qs ? `?${qs}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  if (!r.ok) throw new Error(`POST /api/transcribe -> ${r.status}`);
  return r.json();
}

/** List the local neural (Piper) TTS voices the server has installed. */
export async function fetchTtsVoices(): Promise<{
  voices: string[];
  default: string;
}> {
  const r = await fetch(`${BACKEND_URL}/api/tts/voices`);
  if (!r.ok) throw new Error(`GET /api/tts/voices -> ${r.status}`);
  return r.json();
}

/** Neural text-to-speech: synthesize `text` server-side and get the audio (WAV). */
export async function synthesizeSpeech(
  text: string,
  voice?: string,
): Promise<Blob> {
  const r = await fetch(`${BACKEND_URL}/api/speak`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });
  if (!r.ok) throw new Error(`POST /api/speak -> ${r.status}`);
  return r.blob();
}

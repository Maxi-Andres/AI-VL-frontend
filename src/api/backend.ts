// REST helpers for the backend gateway. All network knowledge of the backend
// lives here (plus the WebSocket in useDetectionSocket).
import { BACKEND_URL } from "../config";
import type {
  CommandResponse,
  ExecuteResponse,
  Options,
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

/** List the robots the command interpreter can target (for the robot selector). */
export async function fetchRobots(): Promise<RobotInfo[]> {
  const r = await fetch(`${BACKEND_URL}/api/skills`);
  if (!r.ok) throw new Error(`GET /api/skills -> ${r.status}`);
  const data = (await r.json()) as { robots?: RobotInfo[] };
  return data.robots ?? [];
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

// REST helpers for the backend gateway. All network knowledge of the backend
// lives here (plus the WebSocket in useDetectionSocket).
import { BACKEND_URL } from "../config";
import type { Options, TranscribeResponse, VlmResponse } from "../types";

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

export async function askVlm(req: VlmRequest): Promise<VlmResponse> {
  const r = await fetch(`${BACKEND_URL}/api/vlm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
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
): Promise<string> {
  const r = await fetch(`${BACKEND_URL}/api/vlm/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
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

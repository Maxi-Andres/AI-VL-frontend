// Shared types mirroring the backend gateway's JSON contract.

/** Current state of the hands-free voice assistant (shown in the header). */
export type VoicePhase =
  | "off"
  | "listening"
  | "recording"
  | "transcribing"
  | "thinking"
  | "speaking";

/** A single detected object. bbox is normalized [x1, y1, x2, y2] in 0..1. */
export interface DetectedObject {
  type: string;
  confidence?: number | null;
  bbox: [number, number, number, number];
  /** YOLO class id (present on YOLO detections); used to pick the box color. */
  class_id?: number | null;
}

/** Server-provided defaults for every control. */
export interface Defaults {
  yolo_model: string;
  vlm_model: string;
  scope: string;
  variant: string;
  conf: number;
  imgsz: number;
  classes: string[];
}

export interface ScopeInfo {
  variants: string[];
}

/** Payload of GET /api/options. */
export interface Options {
  yolo_models: string[];
  vlm_models: string[];
  scopes: Record<string, ScopeInfo>;
  defaults: Defaults;
}

/** Live YOLO config sent to the WebSocket as the first/each control message. */
export interface YoloConfig {
  model: string;
  conf: number;
  imgsz: number;
  classes: string[];
  /** Client-side capture cap: max frames/sec the phone sends. 0 = unlimited.
   * Relayed through the shared config so it can be set from the monitor too. */
  max_fps?: number;
}

// --- WebSocket server -> client messages ---------------------------------- //
export interface DetectionMessage {
  type: "detections";
  objects: DetectedObject[];
  elapsed_ms: number;
  n: number;
}
export interface ErrorMessage {
  type: "error";
  message: string;
}
/** Shared YOLO config the server broadcasts so every client stays in sync.
 * Fields can be null when nobody has set them yet. */
export interface ConfigState {
  model?: string | null;
  conf?: number | null;
  imgsz?: number | null;
  classes?: string[] | null;
  max_fps?: number | null;
}
export interface ConfigAckMessage {
  type: "config";
  state: ConfigState;
}
export type ServerMessage = DetectionMessage | ErrorMessage | ConfigAckMessage;

/** Frame fan-out over /ws/view: the same detection payload as /ws/detect plus the
 * JPEG the phone uploaded (base64). */
export interface FrameMessage {
  type: "frame";
  jpeg_b64: string;
  objects: DetectedObject[];
  elapsed_ms: number;
  n: number;
}
/** Messages the read-only monitor (/ws/view) receives. */
export type ViewMessage = FrameMessage | ConfigAckMessage | ErrorMessage;

/** Payload of POST /api/transcribe (speech-to-text of a dictated clip). */
export interface TranscribeResponse {
  error?: string;
  /** The transcribed text (empty string if nothing was recognized). */
  text: string;
  /** Detected (or forced) language code, e.g. "es"/"en". */
  language: string | null;
  elapsed_ms: number;
}

/** Payload of POST /api/command — the Unitree G1 command interpreter.
 * Maps a spoken/typed command to ONE skill + params (what the robot should do).
 * This is the interpreter's decision only; no motion happens yet. */
export interface CommandResponse {
  error?: string;
  /** False only when the model returned no parseable JSON (skill falls back to
   * "unknown"). */
  ok: boolean;
  model: string;
  /** Chosen skill name (e.g. "walk", "stop", "arm_action", "unknown"). */
  skill: string;
  /** Skill-specific parameters (e.g. {direction, speed} for "walk"). */
  params: Record<string, unknown>;
  /** Short spoken confirmation, in the command's language (for TTS). */
  say: string;
  /** The command text the interpreter received (the transcript). */
  understood: string;
  /** Raw model output (for debugging when ok is false). */
  content: string;
  elapsed_ms: number;
}

/** Payload of POST /api/vlm. */
export interface VlmResponse {
  error?: string;
  ok: boolean;
  model: string;
  elapsed_ms: number;
  did_think: boolean;
  parsed: { objects?: DetectedObject[] } & Record<string, unknown>;
  /** Raw text answer — present (and what to show) for free-form prompts. */
  content?: string;
}

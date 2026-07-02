// Shared types mirroring the backend gateway's JSON contract.

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
}
export interface ConfigAckMessage {
  type: "config";
  state: ConfigState;
}
export type ServerMessage = DetectionMessage | ErrorMessage | ConfigAckMessage;

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

// REST helpers for the backend gateway. All network knowledge of the backend
// lives here (plus the WebSocket in useDetectionSocket).
import { BACKEND_URL } from "../config";
import type { Options, VlmResponse } from "../types";

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
  scope: string;
  variant: string;
}

export async function askVlm(req: VlmRequest): Promise<VlmResponse> {
  const r = await fetch(`${BACKEND_URL}/api/vlm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return r.json();
}

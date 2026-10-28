// Each robot's memory (memory.py): the pictures and notes it was asked to keep — by voice
// ("guardá esta imagen", "acordate que…") or from the Memory page. The whole team sees them.
import { backendFetch } from "./backend";
import { check, json } from "./fleet";
import { BACKEND_URL } from "../config";

export interface MemoryItem {
  id: string;
  kind: "image" | "note";
  text: string;
  created_at: string;
  created_by: string;
}

export interface RobotMemory {
  robot: { id: string; name: string; slot: string } | null;
  items: MemoryItem[];
  total: number;
}

export async function listMemory(robot: string, signal?: AbortSignal): Promise<RobotMemory> {
  return (await check(await backendFetch(`/api/memory?robot=${encodeURIComponent(robot)}`, { signal }))).json();
}

export async function addNote(robot: string, text: string): Promise<MemoryItem> {
  return (await check(await backendFetch("/api/memory", json("POST", { robot, kind: "note", text })))).json();
}

export async function deleteMemory(id: string): Promise<void> {
  await check(await backendFetch(`/api/memory/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

/** The picture's address, for an <img>: same origin in production, so the session cookie goes. */
export const memoryImageUrl = (id: string) => `${BACKEND_URL}/api/memory/${encodeURIComponent(id)}/image`;

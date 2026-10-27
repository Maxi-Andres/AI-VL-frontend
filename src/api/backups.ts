// The company's backups (backup.py): a dated copy of everything Pilot keeps, daily. Owners only.
import { backendFetch } from "./backend";
import { check } from "./fleet";

export interface Backup {
  /** The day, YYYY-MM-DD. */
  name: string;
  at: string;
  size: number;
}

export interface Backups {
  dir: string;
  keep: number;
  /** Hours between automatic backups; 0 = off. */
  every_hours: number;
  backups: Backup[];
}

export async function getBackups(signal?: AbortSignal): Promise<Backups> {
  return (await check(await backendFetch("/api/backups", { signal }))).json();
}

export async function backUpNow(): Promise<Backup> {
  return (await check(await backendFetch("/api/backups", { method: "POST" }))).json();
}

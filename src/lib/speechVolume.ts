// How loud spoken answers play ON THIS DEVICE (0-1). Per browser, like the theme: a control room
// and a laptop want different levels. Read at the moment each sentence starts, so a change
// applies from the next sentence; the robot's own speaker has its own volume (on the robot).
import { useSyncExternalStore } from "react";

const KEY = "pilot.speechVolume";
const CHANGED = "pilot:speechVolume";

export function speechVolume(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return localStorage.getItem(KEY) !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  } catch {
    return 1;
  }
}

export function setSpeechVolume(v: number): void {
  try {
    localStorage.setItem(KEY, String(Math.min(1, Math.max(0, v))));
  } catch {
    /* private mode: lasts this page only */
  }
  window.dispatchEvent(new Event(CHANGED));
}

export function useSpeechVolume(): number {
  return useSyncExternalStore((cb) => {
    window.addEventListener(CHANGED, cb);
    return () => window.removeEventListener(CHANGED, cb);
  }, speechVolume);
}

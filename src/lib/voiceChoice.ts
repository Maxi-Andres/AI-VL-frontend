// The voice the user picked, ONE for the whole app: Live's selector, the voice assistant and
// Drive's "make the robot say" box all read it here.
//
// It used to live in each useSpeech() instance, read from localStorage once at mount, and
// Drive's robot speaker did not read it at all: it sent no voice, so the server used its
// default (Daniela) whatever was picked on Live (reported 2026-10-16). Now a change is seen
// at once by every page that uses it, and by other tabs through the `storage` event.
import { useSyncExternalStore } from "react";

const KEY = "aivl.voiceURI";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // private mode or storage blocked: no remembered choice
  }
}

let current = read();

export function getVoiceChoice(): string | null {
  return current;
}

/** Remember `uri` ("piper:<name>", or a browser voiceURI); "" goes back to the default. */
export function setVoiceChoice(uri: string): void {
  current = uri || null;
  try {
    if (current) localStorage.setItem(KEY, current);
    else localStorage.removeItem(KEY);
  } catch {
    /* not remembered across reloads, still shared within this one */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    current = e.newValue;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The shared choice and its setter, re-rendering on any change. */
export function useVoiceChoice(): [string | null, (uri: string) => void] {
  return [useSyncExternalStore(subscribe, getVoiceChoice, () => null), setVoiceChoice];
}

/**
 * The voice that actually speaks: the choice when it is one of the server's voices, else the
 * server's first. A browser voice is used only when the server offers none (it is down, or
 * has no voice installed). `serverVoices` is null while it is still being asked.
 */
export function effectiveVoice(choice: string | null, serverVoices: string[] | null): string | null {
  if (serverVoices === null) return choice;
  if (serverVoices.length === 0) return choice?.startsWith("piper:") ? null : choice;
  const name = choice?.startsWith("piper:") ? choice.slice("piper:".length) : null;
  return `piper:${name && serverVoices.includes(name) ? name : serverVoices[0]}`;
}

/** The server voice name to send with a request, or undefined for the server's default. */
export function serverVoiceName(uri: string | null): string | undefined {
  return uri?.startsWith("piper:") ? uri.slice("piper:".length) : undefined;
}

/** "es_AR-daniela-high" -> "Daniela · es_AR · Piper"; "em_santa" -> "Santa · es · Kokoro";
 * "supertonic-M2" -> "M2 · es · Supertonic". */
export function voiceLabel(name: string): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const piper = /^([a-z]{2}_[A-Z]{2})-([^-]+)-/.exec(name);
  if (piper) return `${cap(piper[2])} · ${piper[1]} · Piper`;
  const kokoro = /^[a-z][fm]_(.+)$/.exec(name);
  if (kokoro) return `${cap(kokoro[1])} · ${name[0] === "e" ? "es" : name[0]} · Kokoro`;
  const supertonic = /^supertonic-(.+)$/.exec(name);
  if (supertonic) return `${supertonic[1]} · es · Supertonic`;
  return name;
}

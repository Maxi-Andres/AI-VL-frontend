import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Always-on wake-word listener, "Alexa" style: it keeps the browser's built-in
 * Web Speech recognition running and fires `onWake` the moment it hears the wake
 * word (default "robot"). Only the wake word goes through Web Speech (which on
 * Chrome/Safari is cloud-backed); the actual spoken command is captured
 * separately and transcribed locally by Whisper — see useVoiceAssistant.
 *
 * Web Speech recognition stops itself periodically (and on silence), so we
 * transparently restart it while the caller wants it active. Not supported on
 * every browser (e.g. Firefox); check `supported` before offering the feature.
 */

// The DOM lib doesn't always type SpeechRecognition, and Chrome exposes it under
// a webkit prefix — resolve it dynamically and keep a minimal local shape.
type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

function getRecognitionCtor(): (new () => SR) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition) as
    | (new () => SR)
    | undefined;
}

interface Options {
  /** Word/phrase that arms the assistant (matched case-insensitively). */
  phrase?: string;
  /** Recognition language for the wake word (the command uses Whisper, not this). */
  lang?: string;
  /** Called once each time the wake word is heard. */
  onWake: () => void;
}

export function useWakeWord({ phrase = "robot", lang, onWake }: Options) {
  const supported = !!getRecognitionCtor();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SR | null>(null);
  // Whether the caller wants us listening — drives the auto-restart on `onend`.
  const desiredRef = useRef(false);
  // Pending restart timer (so a failed start() retries instead of dying).
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest onWake without re-subscribing the recognition handlers.
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;

  const scheduleRestart = useCallback(() => {
    if (!desiredRef.current || retryRef.current) return;
    retryRef.current = setTimeout(() => {
      retryRef.current = null;
      startRef.current();
    }, 400);
  }, []);
  // Stable indirection so start()/onend can retry themselves without a cycle.
  const startRef = useRef<() => void>(() => {});

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    desiredRef.current = true;
    if (recognitionRef.current) return; // already running
    const rec = new Ctor();
    rec.lang = lang || (typeof navigator !== "undefined" ? navigator.language : "en-US");
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const needle = phrase.toLowerCase();
      for (let i = 0; i < e.results.length; i++) {
        const alt = e.results[i]?.[0];
        if (alt && alt.transcript.toLowerCase().includes(needle)) {
          onWakeRef.current();
          break;
        }
      }
    };
    rec.onerror = (ev) => {
      // "no-speech"/"aborted" are routine; only surface real problems.
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        setError("Microphone permission denied for the wake word.");
        desiredRef.current = false;
      }
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      // Web Speech ends on its own (silence, ~60s cap); restart while still wanted
      // so the assistant keeps listening indefinitely.
      if (desiredRef.current) scheduleRestart();
    };
    recognitionRef.current = rec;
    try {
      rec.start();
      setError(null);
      setListening(true);
    } catch {
      // Calling start() too soon after a stop throws InvalidStateError; drop this
      // instance and retry shortly.
      recognitionRef.current = null;
      scheduleRestart();
    }
  }, [lang, phrase, scheduleRestart]);
  startRef.current = start;

  const stop = useCallback(() => {
    desiredRef.current = false;
    if (retryRef.current) {
      clearTimeout(retryRef.current);
      retryRef.current = null;
    }
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    setListening(false);
    if (rec) {
      rec.onend = null; // don't auto-restart
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
    }
  }, []);

  // Always release the mic on unmount.
  useEffect(() => stop, [stop]);

  return { supported, listening, error, start, stop };
}

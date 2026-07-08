import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchTtsVoices, synthesizeSpeech } from "../api/backend";
import { SpeechQueue, type Player } from "../lib/speechQueue";

/**
 * Text-to-speech with two back-ends:
 *  - "piper:<name>"  -> local NEURAL voices synthesized by the server (nicer and
 *    identical on every device, fully offline). The returned WAV is played here.
 *  - a browser voiceURI -> the OS voices via Web Speech `speechSynthesis`.
 *
 * The voice picker lists both (Piper first). The default, when the user hasn't
 * chosen, is the first Piper voice if any are installed — so out of the box you
 * get the good voice. The selection is remembered in localStorage.
 *
 * Note on iOS Safari: audio playback / the first speechSynthesis call must happen
 * inside a user gesture; the voice loop is armed by a tap, which usually suffices.
 */
const LS_VOICE_URI = "aivl.voiceURI";

export interface VoiceOption {
  uri: string;
  label: string;
}

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [piperVoices, setPiperVoices] = useState<string[]>([]);
  const [voiceURI, setVoiceURIState] = useState<string | null>(() =>
    typeof localStorage !== "undefined"
      ? localStorage.getItem(LS_VOICE_URI)
      : null,
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const browserSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  // Load browser voices (async: getVoices() is empty until `voiceschanged`).
  useEffect(() => {
    if (!browserSupported) return;
    const load = () => setBrowserVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", load);
      window.speechSynthesis.cancel();
    };
  }, [browserSupported]);

  // Load the server's neural (Piper) voices, if any.
  useEffect(() => {
    fetchTtsVoices()
      .then((r) => setPiperVoices(r.voices ?? []))
      .catch(() => setPiperVoices([]));
  }, []);

  const voices = useMemo<VoiceOption[]>(
    () => [
      ...piperVoices.map((n) => ({ uri: `piper:${n}`, label: `${n} · neural` })),
      ...browserVoices.map((v) => ({
        uri: v.voiceURI,
        label: `${v.name} (${v.lang}) · system`,
      })),
    ],
    [piperVoices, browserVoices],
  );

  // TTS is available if either back-end can speak.
  const supported = piperVoices.length > 0 || browserSupported;

  // Effective voice: the user's choice, else the first Piper voice by default.
  const effectiveURI =
    voiceURI ?? (piperVoices[0] ? `piper:${piperVoices[0]}` : null);

  const setVoiceURI = useCallback((uri: string) => {
    setVoiceURIState(uri);
    if (typeof localStorage !== "undefined")
      localStorage.setItem(LS_VOICE_URI, uri);
  }, []);

  const queueRef = useRef<SpeechQueue | null>(null);

  const cancel = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (queueRef.current) {
      queueRef.current.cancel();
      queueRef.current = null;
    }
    if (browserSupported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [browserSupported]);

  // Prepare ONE sentence for playback, using the chosen voice (Piper or browser).
  const synthSentence = useCallback(
    async (text: string): Promise<Player> => {
      const uri = effectiveURI;
      if (uri && uri.startsWith("piper:")) {
        const blob = await synthesizeSpeech(text, uri.slice("piper:".length));
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        return {
          play: () =>
            new Promise<void>((res) => {
              audio.onended = () => {
                URL.revokeObjectURL(url);
                res();
              };
              audio.onerror = () => {
                URL.revokeObjectURL(url);
                res();
              };
              audio.play().catch(() => res());
            }),
          stop: () => {
            audio.pause();
            URL.revokeObjectURL(url);
          },
        };
      }
      // Browser voice.
      return {
        play: () =>
          new Promise<void>((res) => {
            const u = new SpeechSynthesisUtterance(text);
            const v = uri
              ? window.speechSynthesis.getVoices().find((x) => x.voiceURI === uri)
              : undefined;
            if (v) {
              u.voice = v;
              u.lang = v.lang;
            }
            u.onend = () => res();
            u.onerror = () => res();
            window.speechSynthesis.speak(u);
          }),
        stop: () => window.speechSynthesis.cancel(),
      };
    },
    [effectiveURI],
  );

  /**
   * Open a streaming speech session: push text as it is generated, call end()
   * when the answer is complete. Sentences are spoken in order as they land, so
   * playback starts on the first sentence instead of after the whole answer.
   */
  const createStream = useCallback(() => {
    cancel(); // stop anything already playing
    const q = new SpeechQueue(synthSentence, {
      onStart: () => setSpeaking(true),
      onDone: () => setSpeaking(false),
    });
    queueRef.current = q;
    return {
      push: (delta: string) => q.push(delta),
      end: () => q.end(),
      cancel: () => q.cancel(),
    };
  }, [cancel, synthSentence]);

  const speakBrowser = useCallback(
    (text: string, uri: string | null, onEnd?: () => void) => {
      if (!browserSupported) {
        onEnd?.();
        return;
      }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = uri
        ? window.speechSynthesis.getVoices().find((x) => x.voiceURI === uri)
        : undefined;
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      }
      u.onend = () => {
        setSpeaking(false);
        onEnd?.();
      };
      u.onerror = () => {
        setSpeaking(false);
        onEnd?.();
      };
      setSpeaking(true);
      window.speechSynthesis.speak(u);
    },
    [browserSupported],
  );

  const speak = useCallback(
    (text: string, _lang?: string, onEnd?: () => void) => {
      if (!text.trim()) {
        onEnd?.();
        return;
      }
      cancel(); // stop anything already playing
      const uri = effectiveURI;

      if (uri && uri.startsWith("piper:")) {
        const name = uri.slice("piper:".length);
        setSpeaking(true);
        synthesizeSpeech(text, name)
          .then((blob) => {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audioRef.current = audio;
            const done = () => {
              setSpeaking(false);
              URL.revokeObjectURL(url);
              if (audioRef.current === audio) audioRef.current = null;
              onEnd?.();
            };
            audio.onended = done;
            audio.onerror = done;
            audio.play().catch(done);
          })
          .catch(() => {
            // Server voice failed -> fall back to a browser voice.
            setSpeaking(false);
            speakBrowser(text, null, onEnd);
          });
        return;
      }

      speakBrowser(text, uri, onEnd);
    },
    [cancel, effectiveURI, speakBrowser],
  );

  return {
    speak,
    createStream,
    cancel,
    speaking,
    supported,
    voices,
    voiceURI: effectiveURI,
    setVoiceURI,
  };
}

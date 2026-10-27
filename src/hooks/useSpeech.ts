import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchTtsVoices,
  sayOnRobot,
  stopRobotAudio,
  synthesizeSpeech,
} from "../api/backend";
import { useRobot } from "../components/layout/RobotContext";
import { speakable } from "../lib/speakable";
import { effectiveVoice, useVoiceChoice, voiceLabel } from "../lib/voiceChoice";
import { speechVolume } from "../lib/speechVolume";
import { rememberPref } from "../lib/prefs";
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
const LS_OUTPUT = "aivl.speechOutput";

/** Where the voice comes out: this browser, or the selected robot's own speaker. */
export type SpeechOutput = "browser" | "robot";

/** Robots whose speaker this app can drive, both through their relay: the Go2's audiohub and
 * the G1's SDK AudioClient. */
const ROBOTS_WITH_SPEAKER = new Set(["go2", "g1"]);

export interface VoiceOption {
  uri: string;
  label: string;
}

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  // The server's voices (Piper and Kokoro); null while it is still being asked.
  const [piperVoices, setPiperVoices] = useState<string[] | null>(null);
  const [serverDefault, setServerDefault] = useState<string | null>(null);
  // ONE choice for the whole app (lib/voiceChoice.ts), so Drive speaks with it too.
  const [voiceURI, setVoiceURI] = useVoiceChoice();
  const { robot } = useRobot();
  const robotRef = useRef(robot);
  robotRef.current = robot;
  const robotSpeaker = ROBOTS_WITH_SPEAKER.has(robot);
  const [output, setOutputState] = useState<SpeechOutput>(() =>
    typeof localStorage !== "undefined" && localStorage.getItem(LS_OUTPUT) === "robot"
      ? "robot"
      : "browser",
  );
  // "robot" is remembered across robots, but only USED on one that has a speaker: a robot
  // without one falls back to the browser instead of going silent.
  const toRobot = output === "robot" && robotSpeaker;
  const [robotError, setRobotError] = useState<string | null>(null);
  const robotPlayerRef = useRef<Player | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Object URL of the one-shot Piper clip currently playing (via speak()), so we
  // can revoke it if playback is cancelled before onended/onerror fires.
  const currentUrlRef = useRef<string | null>(null);

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
    const ac = new AbortController();
    fetchTtsVoices(ac.signal)
      .then((r) => {
        if (ac.signal.aborted) return;
        setPiperVoices(r.voices ?? []);
        setServerDefault(r.default ?? null);
      })
      // An abort must NOT fall into the empty-list branch: that would look like "the server
      // has no neural voices" and silently drop the user back to browser TTS.
      .catch(() => {
        if (!ac.signal.aborted) setPiperVoices([]);
      });
    return () => ac.abort();
  }, []);

  // The selector lists the server's voices only. The browser's own (dozens of "system"
  // voices, most of them other languages) are offered just when the server has none.
  const voices = useMemo<VoiceOption[]>(
    () =>
      piperVoices?.length
        ? piperVoices.map((n) => ({ uri: `piper:${n}`, label: voiceLabel(n) }))
        : browserVoices.map((v) => ({ uri: v.voiceURI, label: `${v.name} (${v.lang})` })),
    [piperVoices, browserVoices],
  );

  // TTS is available if either back-end can speak.
  const supported = (piperVoices?.length ?? 0) > 0 || browserSupported;

  // Effective voice: the user's choice if the server has it, else the server's default.
  const effectiveURI = effectiveVoice(voiceURI, piperVoices, serverDefault);

  const setOutput = useCallback((next: SpeechOutput) => {
    setOutputState(next);
    setRobotError(null);
    rememberPref(LS_OUTPUT, next);
  }, []);

  /**
   * A sentence spoken by the ROBOT. The server makes the voice (the selected Piper voice, or
   * its default when a browser voice is selected) and the robot plays it. The robot answers
   * once it has the audio, with its length, so play() resolves after that many seconds — that
   * is what keeps the streaming queue's sentences in order instead of cutting each other.
   */
  const robotPlayer = useCallback(
    (text: string): Player => {
      const voice = effectiveURI?.startsWith("piper:")
        ? effectiveURI.slice("piper:".length)
        : undefined;
      let timer: number | undefined;
      let finish: (() => void) | undefined;
      return {
        play: () =>
          new Promise<void>((res) => {
            finish = res;
            sayOnRobot(robotRef.current, text, voice)
              .then((r) => {
                if (!r.ok) {
                  setRobotError(r.error ?? "the robot did not take the audio");
                  res();
                  return;
                }
                setRobotError(null);
                timer = window.setTimeout(res, (r.seconds ?? 0) * 1000);
              })
              .catch((e) => {
                setRobotError(`backend unreachable: ${String(e)}`);
                res();
              });
          }),
        stop: () => {
          if (timer !== undefined) window.clearTimeout(timer);
          void stopRobotAudio(robotRef.current);
          finish?.();
        },
      };
    },
    [effectiveURI],
  );

  const queueRef = useRef<SpeechQueue | null>(null);

  const cancel = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    // Pausing doesn't fire onended/onerror, so revoke the blob URL here to avoid
    // leaking it on a barge-in mid-clip.
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
    }
    if (queueRef.current) {
      queueRef.current.cancel();
      queueRef.current = null;
    }
    if (robotPlayerRef.current) {
      robotPlayerRef.current.stop();
      robotPlayerRef.current = null;
    }
    if (browserSupported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [browserSupported]);

  // Stop any playback (Piper audio, the streaming queue, browser speech) and free
  // its resources when the hook unmounts.
  useEffect(() => () => cancel(), [cancel]);

  // Prepare ONE sentence for playback, using the chosen voice (Piper or browser).
  const synthSentence = useCallback(
    async (text: string): Promise<Player> => {
      if (toRobot) return robotPlayer(text);
      const uri = effectiveURI;
      if (uri && uri.startsWith("piper:")) {
        const blob = await synthesizeSpeech(text, uri.slice("piper:".length));
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.volume = speechVolume();
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
            u.volume = speechVolume();
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
    [effectiveURI, toRobot, robotPlayer],
  );

  /**
   * Open a streaming speech session: push text as it is generated, call end()
   * when the answer is complete. Sentences are spoken in order as they land, so
   * playback starts on the first sentence instead of after the whole answer.
   */
  const createStream = useCallback((limit?: { maxWords: number; cutNotice?: string }) => {
    cancel(); // stop anything already playing
    const q = new SpeechQueue(synthSentence, {
      onStart: () => setSpeaking(true),
      onDone: () => setSpeaking(false),
      ...limit,
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
      u.volume = speechVolume();
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
    (raw: string, _lang?: string, onEnd?: () => void) => {
      const text = speakable(raw); // no "asterisco asterisco": see lib/speakable.ts
      if (!text) {
        onEnd?.();
        return;
      }
      cancel(); // stop anything already playing
      const uri = effectiveURI;

      if (toRobot) {
        const player = robotPlayer(text);
        robotPlayerRef.current = player;
        setSpeaking(true);
        void player.play().then(() => {
          if (robotPlayerRef.current === player) robotPlayerRef.current = null;
          setSpeaking(false);
          onEnd?.();
        });
        return;
      }

      if (uri && uri.startsWith("piper:")) {
        const name = uri.slice("piper:".length);
        setSpeaking(true);
        synthesizeSpeech(text, name)
          .then((blob) => {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.volume = speechVolume();
            audioRef.current = audio;
            currentUrlRef.current = url;
            const done = () => {
              setSpeaking(false);
              URL.revokeObjectURL(url);
              if (currentUrlRef.current === url) currentUrlRef.current = null;
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
    [cancel, effectiveURI, speakBrowser, toRobot, robotPlayer],
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
    output,
    setOutput,
    /** The selected robot has a speaker this app can drive. */
    robotSpeaker,
    /** Why the last sentence did not play on the robot, if it did not. */
    robotError,
  };
}

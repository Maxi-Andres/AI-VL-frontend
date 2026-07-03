import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeAudio } from "../api/backend";
import type { VoicePhase } from "../types";
import { useAudioRecorder } from "./useAudioRecorder";
import { useSpeech } from "./useSpeech";
import { useWakeWord } from "./useWakeWord";

/**
 * Hands-free, "Alexa"-style voice assistant for the VLM free prompt, shared by
 * the live page and the monitor. When voice mode is on it keeps listening for the
 * wake word "robot"; on hearing it, it records the following spoken command,
 * transcribes it locally with Whisper, submits it automatically, and — when
 * spoken mode is on — reads the answer aloud. Then it goes back to listening.
 *
 * The two toggles persist in localStorage so they survive reloads. The caller
 * provides `askPrompt`, which captures the current frame, queries the VLM and
 * returns the plain-text answer (or null on failure).
 */
const LS_VOICE = "aivl.voiceMode";
const LS_SPOKEN = "aivl.spokenMode";

function readFlag(key: string): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(key) === "1";
}

interface Args {
  /** Submit a prompt to the VLM and resolve with the plain-text answer. */
  askPrompt: (prompt: string) => Promise<string | null>;
  /** Wake word; defaults to "robot". */
  phrase?: string;
}

export function useVoiceAssistant({ askPrompt, phrase = "robot" }: Args) {
  const recorder = useAudioRecorder();
  const speech = useSpeech();

  const [voiceMode, setVoiceMode] = useState(() => readFlag(LS_VOICE));
  const [spokenMode, setSpokenMode] = useState(() => readFlag(LS_SPOKEN));
  const [status, setStatus] = useState("");
  const [phase, setPhase] = useState<VoicePhase>("off");

  // Refs so the async wake handler always sees the latest values / callback.
  const voiceModeRef = useRef(voiceMode);
  voiceModeRef.current = voiceMode;
  const spokenModeRef = useRef(spokenMode);
  spokenModeRef.current = spokenMode;
  const askPromptRef = useRef(askPrompt);
  askPromptRef.current = askPrompt;
  const busyRef = useRef(false); // one command at a time

  const wake = useWakeWord({
    phrase,
    onWake: () => {
      void handleWakeRef.current();
    },
  });
  // Stable ref to the wake handler (declared below) so useWakeWord keeps one cb.
  const handleWakeRef = useRef<() => Promise<void>>(async () => {});

  const micSupported = wake.supported && recorder.supported;

  const LISTENING = 'Listening for the wake word "robot"…';

  const handleWake = useCallback(async () => {
    if (busyRef.current) return; // one command at a time
    busyRef.current = true;
    speech.cancel(); // barge-in: saying "robot" interrupts a spoken answer
    wake.stop(); // free the mic to record the command cleanly

    let spoke = false;
    try {
      setPhase("recording");
      setStatus("Listening… speak your question");
      const blob = await recorder.recordUtterance();
      if (!blob) {
        setStatus('Didn\'t catch that — say "robot" to try again');
        return;
      }
      setPhase("transcribing");
      setStatus("Transcribing…");
      const res = await transcribeAudio(blob);
      const text = res.text?.trim();
      if (res.error || !text) {
        setStatus(res.error ? `Error: ${res.error}` : "Nothing recognized");
        return;
      }
      setPhase("thinking");
      setStatus("Thinking…");
      const answer = await askPromptRef.current(text);
      // Fire-and-forget: the answer is spoken while we already go back to listening.
      if (answer && spokenModeRef.current) {
        spoke = true;
        setPhase("speaking");
        speech.speak(answer, undefined, () => {
          if (voiceModeRef.current) setPhase("listening");
        });
      }
    } catch (e) {
      setStatus(`Voice error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      // ALWAYS return to listening so the wake word keeps working every time.
      busyRef.current = false;
      if (voiceModeRef.current) {
        setStatus(LISTENING);
        if (!spoke) setPhase("listening");
        wake.start();
      } else {
        setPhase("off");
      }
    }
  }, [recorder, speech, wake]);
  handleWakeRef.current = handleWake;

  // Start/stop the wake-word listener as voice mode is turned on/off.
  useEffect(() => {
    if (voiceMode && micSupported) {
      setStatus('Listening for the wake word "robot"…');
      setPhase("listening");
      wake.start();
    } else {
      wake.stop();
      speech.cancel();
      busyRef.current = false;
      setStatus("");
      setPhase("off");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceMode, micSupported]);

  const toggleVoiceMode = useCallback(() => {
    setVoiceMode((v) => {
      const next = !v;
      if (typeof localStorage !== "undefined")
        localStorage.setItem(LS_VOICE, next ? "1" : "0");
      return next;
    });
  }, []);

  const toggleSpokenMode = useCallback(() => {
    setSpokenMode((v) => {
      const next = !v;
      if (typeof localStorage !== "undefined")
        localStorage.setItem(LS_SPOKEN, next ? "1" : "0");
      return next;
    });
  }, []);

  return {
    micSupported,
    speechSupported: speech.supported,
    voiceMode,
    spokenMode,
    toggleVoiceMode,
    toggleSpokenMode,
    status: status || wake.error || "",
    phase,
    speaking: speech.speaking,
    speak: speech.speak,
    stopSpeak: speech.cancel,
    // TTS voice selection (Piper neural voices + the browser's own).
    voices: speech.voices,
    voiceURI: speech.voiceURI,
    onVoiceChange: speech.setVoiceURI,
  };
}

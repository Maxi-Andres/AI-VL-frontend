import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeAudio } from "../api/backend";
import { useRobot } from "../components/layout/RobotContext";
import { robotEarUrl } from "../config";
import { earStatus, ROBOTS_WITH_MIC } from "../lib/robotEar";
import type { VoicePhase } from "../types";
import { useAudioRecorder } from "./useAudioRecorder";
import { useRobotEar } from "./useRobotEar";
import { useSpeech } from "./useSpeech";
import { useWakeWord } from "./useWakeWord";

/**
 * Hands-free, "Alexa"-style voice assistant for the VLM free prompt, shared by
 * the live page and the monitor. When voice mode is on it keeps listening for the
 * wake word "robot"; on hearing it, it records the following spoken command,
 * transcribes it locally with Whisper, submits it automatically, and — when
 * spoken mode is on — reads the answer aloud. Then it goes back to listening.
 *
 * A second way in: the ROBOT's own microphone (the G1's, through its relay), listened to on
 * the server for its name, "Bender", like Alexa. "Bender, qué ves" is answered at once; a bare
 * "Bender" gets a spoken "¿Sí?" and the next phrase is the question. Its switch is the robot
 * mic itself: on opens it, off closes it. While the answer is spoken the robot's ear is muted,
 * so it never answers its own voice.
 *
 * The toggles persist in localStorage so they survive reloads. The caller
 * provides `askPrompt`, which captures the current frame, queries the VLM and
 * returns the plain-text answer (or null on failure).
 */
const LS_VOICE = "aivl.voiceMode";
const LS_SPOKEN = "aivl.spokenMode";
const LS_FILLER = "aivl.fillerMode";
const LS_ROBOT_EAR = "aivl.robotEar";
// Said by the robot on a bare "Bender": it heard its name and waits for the question.
const WAKE_ACK = "¿Sí?";

// Short "thinking" fillers spoken while the VLM works, so a slow answer isn't
// preceded by dead air. These are SPOKEN CONTENT (audio for the end user), not UI
// text: they must be real pronounceable words in the TTS voice's language, since a
// neural voice spells non-words out ("Hmm" -> "h-m-m"). The default voice is
// Spanish (es_AR-daniela-high) and the whole voice loop is Spanish (Whisper input,
// VLM answer), so the fillers are Spanish to match. Each ends in a period so the
// SpeechQueue flushes it immediately instead of buffering.
const FILLERS = ["Eh, a ver.", "Dejame ver.", "Un momento.", "A ver."];
// Only speak a filler if the answer hasn't started within this window, so a fast
// reply is never preceded by (or talked over with) a filler.
const FILLER_DELAY_MS = 2000;
// A spoken answer stops after about this many words (~30 s of speech) and says where the rest is;
// the whole answer stays on screen. The model is told nothing about length: asked to be brief,
// it read 17.84 kW as 1784 six times in six (2026-10-19), so the cap is applied here, where it
// is spoken. Counted in words, not sentences: a list of six objects is ~60 words and is said
// whole.
const SPOKEN_LIMIT = { maxWords: 90, cutNotice: "El resto lo tenés en la pantalla." };

function pickFiller(): string {
  return FILLERS[Math.floor(Math.random() * FILLERS.length)];
}

function readFlag(key: string): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(key) === "1";
}

interface Args {
  /**
   * Submit a prompt to the VLM. `onDelta` is called with each streamed text
   * chunk (so the answer can be spoken sentence by sentence and shown live);
   * resolves with the full answer, or null on failure.
   */
  askPromptStream: (
    prompt: string,
    onDelta: (piece: string) => void,
  ) => Promise<string | null>;
  /** Wake word; defaults to "robot". */
  phrase?: string;
}

export function useVoiceAssistant({ askPromptStream, phrase = "robot" }: Args) {
  const recorder = useAudioRecorder();
  const speech = useSpeech();

  const [voiceMode, setVoiceMode] = useState(() => readFlag(LS_VOICE));
  const [spokenMode, setSpokenMode] = useState(() => readFlag(LS_SPOKEN));
  // Filler word (spoken "thinking" cue on a slow answer) — off by default.
  const [fillerMode, setFillerMode] = useState(() => readFlag(LS_FILLER));
  const [status, setStatus] = useState("");
  const [phase, setPhase] = useState<VoicePhase>("off");

  // Refs so the async wake handler always sees the latest values / callback.
  const voiceModeRef = useRef(voiceMode);
  voiceModeRef.current = voiceMode;
  const spokenModeRef = useRef(spokenMode);
  spokenModeRef.current = spokenMode;
  const fillerModeRef = useRef(fillerMode);
  fillerModeRef.current = fillerMode;
  const askPromptStreamRef = useRef(askPromptStream);
  askPromptStreamRef.current = askPromptStream;
  const busyRef = useRef(false); // one command at a time
  const { robot } = useRobot();
  const robotMic = ROBOTS_WITH_MIC.has(robot);
  const [robotEar, setRobotEar] = useState(() => readFlag(LS_ROBOT_EAR));
  const robotEarRef = useRef(robotEar);
  robotEarRef.current = robotEar;
  // Switched OFF in another tab of this browser: off here too. Only off: syncing "on" would
  // make every tab take the robot's ear from the others (one ear per robot).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_ROBOT_EAR && e.newValue === "0") setRobotEar(false);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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

  // The answer half of a voice turn — think, then speak sentence by sentence — shared by the
  // device mic (after recording and transcribing) and the robot's ear (which sends text).
  // Resolves with whether anything was spoken.
  const answerText = useCallback(async (text: string): Promise<boolean> => {
    let spoke = false;
    let fillerTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      setPhase("thinking");
      setStatus("Thinking…");
      // Stream the answer: speak each sentence as soon as it lands, so the reply
      // starts playing while the model is still generating the rest.
      const stream = spokenModeRef.current ? speech.createStream(SPOKEN_LIMIT) : null;
      let answerStarted = false;
      if (stream && fillerModeRef.current) {
        // Speak a filler only if the answer is slow to start (see FILLER_DELAY_MS):
        // covers a slow VLM without preceding a fast reply. The real answer
        // sentences are spoken after the filler, in order.
        fillerTimer = setTimeout(() => {
          fillerTimer = null;
          if (!answerStarted) {
            stream.push(pickFiller());
            spoke = true;
            setPhase("speaking");
          }
        }, FILLER_DELAY_MS);
      }
      await askPromptStreamRef.current(text, (piece) => {
        if (!answerStarted) {
          answerStarted = true;
          if (fillerTimer) {
            clearTimeout(fillerTimer); // answer beat the filler -> skip it
            fillerTimer = null;
          }
          if (stream) {
            spoke = true;
            setPhase("speaking");
          }
        }
        stream?.push(piece);
      });
      stream?.end();
    } finally {
      if (fillerTimer) clearTimeout(fillerTimer);
    }
    return spoke;
  }, [speech]);

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
      spoke = await answerText(text);
    } catch (e) {
      setStatus(`Voice error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      // ALWAYS return to listening so the wake word keeps working every time.
      // (We resume even while the answer is still being spoken, so "robot"
      // interrupts it — the barge-in in speech.cancel() above.)
      busyRef.current = false;
      if (voiceModeRef.current) {
        setStatus(LISTENING);
        // If still speaking, let the queue's onDone flip the phase back later.
        if (!spoke) setPhase("listening");
        wake.start();
      } else {
        setPhase("off");
      }
    }
  }, [recorder, speech, wake, answerText]);
  handleWakeRef.current = handleWake;

  // A "Bender, …" command from the robot's own microphone: the same answer, no recording here.
  const handleEarCommand = useCallback(async (text: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    speech.cancel(); // a new question interrupts a spoken answer
    let spoke = false;
    try {
      setStatus(`Bender heard: “${text}”`);
      spoke = await answerText(text);
    } catch (e) {
      setStatus(`Voice error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      busyRef.current = false;
      if (!spoke) setPhase(voiceModeRef.current || robotEarRef.current ? "listening" : "off");
    }
  }, [speech, answerText]);

  const ear = useRobotEar({
    url: robotEarUrl(robot),
    enabled: robotEar && robotMic,
    muted: speech.speaking,
    onCommand: (text) => void handleEarCommand(text),
    onWake: () => {
      if (spokenModeRef.current && !busyRef.current) speech.speak(WAKE_ACK);
    },
  });

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

  // When the spoken answer finishes (queue drained), drop back to "listening".
  const robotListening = robotEar && robotMic;
  useEffect(() => {
    if (!speech.speaking && phase === "speaking" && (voiceMode || robotListening)) {
      setPhase("listening");
    }
  }, [speech.speaking, phase, voiceMode, robotListening]);

  // The robot's mic switched on (or off) while the device mic is off: show it in the phase.
  useEffect(() => {
    if (voiceMode) return;
    setPhase(robotListening ? "listening" : "off");
  }, [robotListening, voiceMode]);

  const toggleVoiceMode = useCallback(() => {
    setVoiceMode((v) => {
      const next = !v;
      if (typeof localStorage !== "undefined")
        localStorage.setItem(LS_VOICE, next ? "1" : "0");
      return next;
    });
  }, []);

  const toggleRobotEar = useCallback(() => {
    setRobotEar((v) => {
      const next = !v;
      if (typeof localStorage !== "undefined")
        localStorage.setItem(LS_ROBOT_EAR, next ? "1" : "0");
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

  const toggleFillerMode = useCallback(() => {
    setFillerMode((v) => {
      const next = !v;
      if (typeof localStorage !== "undefined")
        localStorage.setItem(LS_FILLER, next ? "1" : "0");
      return next;
    });
  }, []);

  return {
    micSupported,
    speechSupported: speech.supported,
    voiceMode,
    spokenMode,
    fillerMode,
    toggleVoiceMode,
    toggleSpokenMode,
    toggleFillerMode,
    status: status || wake.error || "",
    // The robot's own microphone ("Bender, …"), where the selected robot has one.
    robotMic,
    robotEar,
    toggleRobotEar,
    robotEarStatus: robotMic && robotEar ? earStatus(ear) : "",
    phase,
    speaking: speech.speaking,
    speak: speech.speak,
    createStream: speech.createStream,
    stopSpeak: speech.cancel,
    // TTS voice selection (Piper neural voices + the browser's own).
    voices: speech.voices,
    voiceURI: speech.voiceURI,
    onVoiceChange: speech.setVoiceURI,
    // Browser or the robot's own speaker.
    speechOutput: speech.output,
    onSpeechOutputChange: speech.setOutput,
    robotSpeaker: speech.robotSpeaker,
    robotSpeakerError: speech.robotError,
  };
}

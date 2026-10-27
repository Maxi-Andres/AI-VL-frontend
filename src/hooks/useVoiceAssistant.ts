import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeAudio } from "../api/backend";
import { useRobot } from "../components/layout/RobotContext";
import { robotEarUrl } from "../config";
import { earStatus, ROBOTS_WITH_MIC } from "../lib/robotEar";
import type { VoicePhase } from "../types";
import { useAudioRecorder } from "./useAudioRecorder";
import { useRobotEar } from "./useRobotEar";
import { useSpeech } from "./useSpeech";
import { rememberPref } from "../lib/prefs";
import { useWakeWord } from "./useWakeWord";
import { t } from "../i18n";

/**
 * Hands-free voice assistant for the VLM free prompt, shared by the live page and the monitor.
 * Hands-free (voice mode) listens one of two ways:
 *  - "open" (the default): just speak. The mic's own level says when someone starts and stops
 *    talking; the phrase is transcribed on the server with Whisper and sent by itself. No
 *    browser speech recognition is involved, so it works everywhere (Brave and Firefox have
 *    none). While an answer is being spoken it does not listen, so it never answers its own
 *    voice; then it listens again.
 *  - "wake": say "robot" first (the browser's Web Speech hears the word), then the question.
 * Either way the answer is read aloud when spoken mode is on. `listenOnce` is the same for a
 * single question — the mic button in the chat.
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
const LS_LISTEN = "aivl.listenMode";
// What Whisper makes of noise or breath on a quiet mic: never worth a question to the VLM.
const NOT_A_QUESTION = /^(\W*|gracias\W*|subt[ií]tulos.*|thank you\W*|\.+)$/i;
// Said by the robot on a bare "Bender": it heard its name and waits for the question.
const WAKE_ACK = "¿Sí?";

// Short "thinking" fillers spoken while the VLM works, so a slow answer isn't
// preceded by dead air. These are SPOKEN CONTENT (audio for the end user), not UI
// text: they must be real pronounceable words in the TTS voice's language, since a
// neural voice spells non-words out ("Hmm" -> "h-m-m"). The default voice is
// Spanish (Kokoro's em_alex) and the whole voice loop is Spanish (Whisper input,
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

// The standing status lines while hands-free waits, in the language chosen when they are shown.
const listeningForWake = () => t('Listening for the wake word "robot"…');
const listeningOpen = () => t("Listening — just ask");

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

export type ListenMode = "open" | "wake";

export function useVoiceAssistant({ askPromptStream, phrase = "robot" }: Args) {
  const recorder = useAudioRecorder();
  const speech = useSpeech();

  const [voiceMode, setVoiceMode] = useState(() => readFlag(LS_VOICE));
  const [spokenMode, setSpokenMode] = useState(() => readFlag(LS_SPOKEN));
  // Filler word (spoken "thinking" cue on a slow answer) — off by default.
  const [fillerMode, setFillerMode] = useState(() => readFlag(LS_FILLER));
  const [status, setStatus] = useState("");
  const [phase, setPhase] = useState<VoicePhase>("off");
  const [listenMode, setListenModeState] = useState<ListenMode>(() =>
    typeof localStorage !== "undefined" && localStorage.getItem(LS_LISTEN) === "wake" ? "wake" : "open");
  const listenModeRef = useRef(listenMode);
  listenModeRef.current = listenMode;

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

  // The mic needs only recording; the wake word also needs the browser's speech recognition.
  const micSupported = recorder.supported;
  const wakeSupported = wake.supported && recorder.supported;
  const speakingRef = useRef(false);
  speakingRef.current = speech.speaking;
  // When the last spoken answer ended (MAX while one is playing). A phrase recorded after this
  // could not have been the robot's own voice.
  const speechEnd = useRef(0);
  useEffect(() => {
    speechEnd.current = speech.speaking ? Number.MAX_SAFE_INTEGER : Date.now();
  }, [speech.speaking]);
  // Bumped to end an open-listening loop (hands-free off, or switched to the wake word).
  const loopGen = useRef(0);

  const ECHO_MS = 700;

  // The answer half of a voice turn — think, then speak sentence by sentence — shared by the
  // device mic (after recording and transcribing) and the robot's ear (which sends text).
  // Resolves with whether anything was spoken.
  const answerText = useCallback(async (text: string): Promise<boolean> => {
    let spoke = false;
    let fillerTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      setPhase("thinking");
      setStatus(t("Thinking…"));
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

  // One spoken question: record until the speaker goes quiet, transcribe, answer. Used after
  // the wake word, and by the mic button for a single question.
  const handleWake = useCallback(async () => {
    if (busyRef.current) return; // one command at a time
    busyRef.current = true;
    speech.cancel(); // barge-in: saying "robot" interrupts a spoken answer
    wake.stop(); // free the mic to record the command cleanly
    loopGen.current++; // and an open-listening loop lets go of it too
    recorder.abort();

    let spoke = false;
    try {
      setPhase("recording");
      setStatus(t("Listening… speak your question"));
      const blob = await recorder.recordUtterance();
      if (!blob) {
        setStatus(t('Didn\'t catch that — say "robot" to try again'));
        return;
      }
      setPhase("transcribing");
      setStatus(t("Transcribing…"));
      const res = await transcribeAudio(blob);
      const text = res.text?.trim();
      if (res.error || !text || NOT_A_QUESTION.test(text)) {
        setStatus(res.error ? t("Error: {error}", { error: res.error }) : t("Nothing recognized"));
        return;
      }
      spoke = await answerText(text);
    } catch (e) {
      setStatus(t("Voice error: {error}", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      // ALWAYS return to listening so the wake word keeps working every time.
      // (We resume even while the answer is still being spoken, so "robot"
      // interrupts it — the barge-in in speech.cancel() above.)
      busyRef.current = false;
      if (voiceModeRef.current) {
        setStatus(listenModeRef.current === "wake" ? listeningForWake() : listeningOpen());
        // If still speaking, let the queue's onDone flip the phase back later.
        if (!spoke) setPhase("listening");
        if (listenModeRef.current === "wake") wake.start();
        else void openLoopRef.current();
      } else {
        setPhase("off");
        // A single question (the mic button): clear the working line, keep a "didn't catch it".
        setStatus((st) => (st === t("Thinking…") || st === t("Transcribing…") ? "" : st));
      }
    }
  }, [recorder, speech, wake, answerText]);
  handleWakeRef.current = handleWake;

  // "Just speak": listen, and every phrase heard becomes a question. Waits out a spoken answer
  // (the mic would hear it) and any question already in flight.
  const openLoop = useCallback(async () => {
    const gen = ++loopGen.current;
    const live = () => gen === loopGen.current && voiceModeRef.current && listenModeRef.current === "open";
    while (live()) {
      // Not while an answer plays, nor in its echo just after.
      if (speakingRef.current || busyRef.current || Date.now() - speechEnd.current < ECHO_MS) {
        await new Promise((r) => setTimeout(r, 250));
        continue;
      }
      setPhase("listening");
      setStatus(listeningOpen());
      const t0 = Date.now();
      let blob: Blob | null;
      try {
        blob = await recorder.recordUtterance({ startTimeoutMs: 8000, maxMs: 15000 });
      } catch (e) {
        setStatus(t("Microphone error: {error}", { error: e instanceof Error ? e.message : String(e) }));
        return;
      }
      if (!live()) return;
      // Nothing said — or an answer started playing while it listened, so what it heard may be
      // its own voice: drop it rather than answer itself.
      if (!blob || speechEnd.current > t0) continue;
      busyRef.current = true;
      let spoke = false;
      try {
        setPhase("transcribing");
        setStatus(t("Transcribing…"));
        const res = await transcribeAudio(blob);
        const text = res.text?.trim();
        if (!live()) return;
        if (res.error) {
          setStatus(t("Error: {error}", { error: res.error }));
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        if (!text || NOT_A_QUESTION.test(text)) continue;
        spoke = await answerText(text);
      } catch (e) {
        setStatus(t("Voice error: {error}", { error: e instanceof Error ? e.message : String(e) }));
      } finally {
        busyRef.current = false;
        if (!spoke && live()) setPhase("listening");
      }
    }
  }, [recorder, answerText]);
  const openLoopRef = useRef(openLoop);
  openLoopRef.current = openLoop;

  // The "¿Sí?" after a bare "Bender" is playing. The ear is NOT muted for it: muting kept it
  // deaf for the ~2 s the acknowledgement takes to make and play, and a question asked right
  // away was lost. The ear knows its own "sí" and ignores it (iacore's ear_common.ACK_ECHO).
  // Real answers still mute it — those are long, and it would answer itself.
  const [acking, setAcking] = useState(false);
  const ackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const ackDone = useCallback(() => {
    clearTimeout(ackTimer.current);
    setAcking(false);
  }, []);

  // A "Bender, …" command from the robot's own microphone: the same answer, no recording here.
  const handleEarCommand = useCallback(async (text: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    ackDone(); // the question is in: whatever the answer says mutes the ear as usual
    speech.cancel(); // a new question interrupts a spoken answer
    let spoke = false;
    try {
      setStatus(t("Bender heard: “{text}”", { text }));
      spoke = await answerText(text);
    } catch (e) {
      setStatus(t("Voice error: {error}", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      busyRef.current = false;
      if (!spoke) setPhase(voiceModeRef.current || robotEarRef.current ? "listening" : "off");
    }
  }, [speech, answerText, ackDone]);

  const ear = useRobotEar({
    url: robotEarUrl(robot),
    enabled: robotEar && robotMic,
    muted: speech.speaking && !acking,
    onCommand: (text) => void handleEarCommand(text),
    onWake: () => {
      if (spokenModeRef.current && !busyRef.current) {
        setAcking(true);
        // A stopped or failed playback may never call back: never stay unmuted past a few s.
        clearTimeout(ackTimer.current);
        ackTimer.current = setTimeout(() => setAcking(false), 4000);
        speech.speak(WAKE_ACK, undefined, ackDone);
      }
    },
  });

  // Start/stop listening as hands-free is turned on/off or its way of listening changes.
  useEffect(() => {
    loopGen.current++; // ends an open loop from before
    recorder.abort();
    if (voiceMode && listenMode === "wake" && wakeSupported) {
      setStatus(listeningForWake());
      setPhase("listening");
      wake.start();
    } else if (voiceMode && listenMode === "open" && micSupported) {
      wake.stop();
      void openLoop();
    } else {
      wake.stop();
      speech.cancel();
      busyRef.current = false;
      setStatus(voiceMode && listenMode === "wake" ? t("This browser cannot listen for a wake word — choose “Just speak”") : "");
      setPhase("off");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceMode, listenMode, micSupported, wakeSupported]);

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
        rememberPref(LS_VOICE, next ? "1" : "0");
      return next;
    });
  }, []);

  const setListenMode = useCallback((m: ListenMode) => {
    setListenModeState(m);
    rememberPref(LS_LISTEN, m);
  }, []);

  // The mic button: one question, sent when the speaker stops.
  const listenOnce = useCallback(() => {
    void handleWakeRef.current();
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
        rememberPref(LS_SPOKEN, next ? "1" : "0");
      return next;
    });
  }, []);

  const toggleFillerMode = useCallback(() => {
    setFillerMode((v) => {
      const next = !v;
      if (typeof localStorage !== "undefined")
        rememberPref(LS_FILLER, next ? "1" : "0");
      return next;
    });
  }, []);

  return {
    micSupported,
    wakeSupported,
    listenMode,
    setListenMode,
    listenOnce,
    /** A question is being recorded or worked on right now. */
    busy: phase === "recording" || phase === "transcribing" || phase === "thinking",
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

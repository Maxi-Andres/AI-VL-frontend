import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  IconAdjustmentsHorizontal,
  IconArrowUp,
  IconMessageChatbot,
  IconMicrophone,
} from "@tabler/icons-react";
import { runAgent, stopAgent } from "../api/agent";
import { setRobotCamera, transcribeAudio } from "../api/backend";
import { AgentTrace } from "../components/agent/AgentTrace";
import { useRobot } from "../components/layout/RobotContext";
import { useVideoTransport } from "../components/layout/VideoTransportContext";
import { useVoiceAssistantContext } from "../components/layout/VoiceAssistantContext";
import { RobotCameraSwitch } from "../components/live/RobotCameraSwitch";
import { RobotPicture } from "../components/live/RobotPicture";
import { VideoTransportSwitch } from "../components/live/VideoTransportSwitch";
import { StatusText, type Status } from "../components/ui/StatusText";
import { StopButton } from "../components/ui/StopButton";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useRobotCameraView } from "../hooks/useRobotCameraView";
import { agentChat } from "../lib/agentTrace";
import { msg, useT } from "../i18n";

// The backend's limit on an instruction (AgentRequest in AI-VL-backend/app.py).
const MAX_CHARS = 1000;

/**
 * The agent: the robot's camera on the left, a chat on the right. A person types or says an
 * instruction ("pick up the bottle"); the robot carries it out with its tools, and the chat
 * shows it live — what it understood, its plan, each tool with its own steps, the results and
 * the reply (spoken too when spoken answers are on). STOP is always on screen.
 *
 * G1 only: the backend's tools (pick, look) drive the G1's arm and its RealSense.
 *
 * One run at a time from this page; the server refuses a second one from anywhere (it comes
 * back as an error line). Leaving the page while a run goes on presses STOP: nobody would be
 * watching an arm that keeps moving (fail safe).
 */
export function AgentPage() {
  const t = useT();
  const { robot, robots } = useRobot();
  const isG1 = robot === "g1";
  const robotName = robots.find((r) => r.id === robot)?.short ?? robot.toUpperCase();

  // The camera, exactly as Drive shows it: no boxes declared for this view, the shared
  // transport switch, the bridge started while the page is open.
  const { frameUrl, connected, getLastFrameBlob } = useRobotCameraView(true, false, undefined, robot);
  const { transport, receiving } = useVideoTransport();
  const live = transport === "mjpeg" ? !!frameUrl : receiving;
  useEffect(() => {
    setRobotCamera("start").catch(() => {});
    return () => {
      setRobotCamera("stop").catch(() => {});
    };
  }, []);
  const [videoMenu, setVideoMenu] = useState(false);

  const [turns, dispatch] = useReducer(agentChat, []);
  const [text, setText] = useState("");
  // A run's stream is open (from the POST until its end event): one at a time.
  const [busy, setBusy] = useState(false);
  // The mic, the transcription and STOP report here. Texts are msg()-marked or the server's
  // own, translated where drawn, so the callbacks never depend on the language.
  const [status, setStatus] = useState<Status | null>(null);
  const runRef = useRef<{ id: number; ctl: AbortController } | null>(null);
  const nextId = useRef(1);
  const alive = useRef(true);

  // The reply is spoken the way the rest of the app speaks answers: only when spoken answers
  // are on (the voice assistant's switch), with its voice and its output.
  const { va } = useVoiceAssistantContext();
  const speakRef = useRef<(text: string) => void>(() => {});
  speakRef.current = (reply: string) => {
    if (va.spokenMode) va.speak(reply);
  };

  const send = useCallback(async (raw: string) => {
    const instruction = raw.trim().slice(0, MAX_CHARS);
    if (!instruction || runRef.current) return;
    const id = nextId.current++;
    const ctl = new AbortController();
    runRef.current = { id, ctl };
    setBusy(true);
    setText("");
    setStatus(null);
    dispatch({ type: "start", id, text: instruction, at: Date.now() });
    try {
      await runAgent(instruction, (event) => {
        dispatch({ type: "event", id, event, at: Date.now() });
        if (event.type === "reply" && event.text) speakRef.current(event.text);
      }, ctl.signal);
      dispatch({ type: "end", id, at: Date.now() });
    } catch (e) {
      if (ctl.signal.aborted) return; // the page went away
      dispatch({ type: "failed", id, at: Date.now(), text: e instanceof Error ? e.message : String(e) });
    } finally {
      if (runRef.current?.id === id) runRef.current = null;
      if (alive.current) setBusy(false);
    }
  }, []);

  const stop = useCallback(() => {
    va.stopSpeak();
    const run = runRef.current;
    if (run) dispatch({ type: "stopping", id: run.id });
    setStatus({ tone: "busy", text: msg("Stopping…") });
    // The stream is NOT aborted: the run's last events and its reply still come down it.
    stopAgent()
      .then(() => setStatus({ tone: "stopped", text: msg("Stopped") }))
      .catch((e) => setStatus({ tone: "error", text: e instanceof Error ? e.message : String(e) }));
  }, [va]);

  // Leaving mid-run: STOP, and stop reading.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const run = runRef.current;
      if (run) {
        stopAgent().catch(() => {});
        run.ctl.abort();
        runRef.current = null;
      }
    };
  }, []);

  // Push-to-talk, the same path as the Live page's spoken command: record one utterance (it
  // ends on silence), transcribe it on the server, and send what was said.
  const recorder = useAudioRecorder();
  const [listening, setListening] = useState(false);
  const listen = useCallback(async () => {
    if (recorder.recording) {
      recorder.abort(); // pressed again: end the utterance now, with what it has
      return;
    }
    if (listening || runRef.current) return;
    setListening(true);
    setStatus({ tone: "busy", text: msg("Listening…") });
    try {
      const blob = await recorder.recordUtterance();
      if (!alive.current) return;
      if (!blob) {
        setStatus({ tone: "warn", text: msg("Didn't catch that — try again") });
        return;
      }
      setStatus({ tone: "busy", text: msg("Transcribing…") });
      const res = await transcribeAudio(blob);
      if (!alive.current) return;
      const said = res.text?.trim();
      if (res.error || !said) {
        setStatus(res.error ? { tone: "error", text: res.error } : { tone: "warn", text: msg("Nothing recognized") });
        return;
      }
      setStatus(null);
      void send(said);
    } catch (e) {
      if (alive.current) setStatus({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      if (alive.current) setListening(false);
    }
  }, [listening, recorder, send]);

  // The running tool's seconds: one tick a second, only while a run is open.
  const [now, setNow] = useState(() => Date.now());
  const running = turns.some((turn) => turn.running);
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  // Follow the newest line, unless the person scrolled up to read an earlier one.
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [turns]);

  const canSend = isG1 && !busy && !listening && !!text.trim();

  return (
    <main className="grid gap-4 p-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_420px] lg:overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="m-0 flex items-center gap-2 text-[15px] font-bold">
            <span className="font-mono">/agent</span>
            <span className="text-dim">·</span>
            {robotName}
          </h1>
          <span className={`flex items-center gap-2 text-[12.5px] font-semibold ${connected ? "text-good-fg" : "text-muted"}`}>
            <span className={`size-2 shrink-0 rounded-full ${connected ? "bg-good-fg shadow-[0_0_0_4px_var(--color-good-bg)]" : "bg-dim"}`} />
            {connected ? t("Connected") : t("Connecting…")}
          </span>
        </div>

        <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-2xl bg-black shadow-lift">
          <RobotPicture frameUrl={frameUrl} getBlob={getLastFrameBlob} connected={connected} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/25" />
          <div className="absolute inset-x-3 top-3 z-20 flex items-center gap-2">
            <span className="on-video flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11.5px] font-extrabold tracking-wider">
              <span className={`size-2 rounded-full ${live ? "animate-pulse bg-[#ff5a5f]" : "bg-dim"}`} />
              {live ? t("LIVE") : t("NO VIDEO")}
            </span>
            <span className="flex-1" />
            <div className="relative">
              <button type="button" aria-pressed={videoMenu} title={t("Video quality and transport")}
                onClick={() => setVideoMenu((m) => !m)}
                className={`grid size-9 cursor-pointer place-items-center rounded-lg transition ${videoMenu ? "bg-accent text-on-accent shadow-card" : "on-video"}`}>
                <IconAdjustmentsHorizontal size={18} />
              </button>
              {videoMenu && (
                <div className="absolute top-11 right-0 z-20 flex w-[300px] animate-rise flex-col gap-2 rounded-xl border border-line bg-panel p-3 text-fg shadow-lift">
                  <VideoTransportSwitch />
                  <RobotCameraSwitch />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* The chat: its own scroll; the page never scrolls on desktop. */}
      <aside className="flex min-h-[480px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-card">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-extrabold">
          <IconMessageChatbot size={17} className="text-accent" />{t("Agent")}
          <StatusText status={status && { ...status, text: t(status.text) }}
            className="ml-auto min-w-0 truncate text-xs font-semibold text-muted" />
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4"
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
          }}>
          <AgentTrace turns={turns} now={now} />
        </div>

        <div className="flex items-end gap-2 border-t border-line p-3">
          {isG1 ? (
            <div className="flex min-w-0 flex-1 items-end rounded-[14px] border border-line bg-bg transition focus-within:border-accent focus-within:shadow-[0_0_0_4px_var(--color-good-bg)]">
              <textarea value={text} rows={1} maxLength={MAX_CHARS} aria-label={t("Instruction")}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (canSend) void send(text);
                  }
                }}
                placeholder={busy ? t("The robot is working on it…") : t("Type or speak…")}
                className="block max-h-28 min-h-[42px] min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-[13px] text-fg outline-none placeholder:text-dim" />
              {recorder.supported && (
                <button type="button" onClick={() => void listen()} disabled={busy && !recorder.recording}
                  aria-pressed={recorder.recording} title={t("Speak the instruction: it is transcribed and sent")}
                  className={`m-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border transition active:scale-95 disabled:cursor-default disabled:opacity-40 ${
                    recorder.recording ? "animate-pulse border-bad-fg/40 bg-bad-bg text-bad-fg" : "border-line text-muted hover:bg-subtle hover:text-fg"}`}>
                  <IconMicrophone size={17} />
                </button>
              )}
              <button type="button" onClick={() => void send(text)} disabled={!canSend} title={t("Send")}
                className="m-1 ml-0 grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg bg-fg text-bg transition active:scale-95 disabled:cursor-default disabled:opacity-35">
                <IconArrowUp size={17} />
              </button>
            </div>
          ) : (
            <p className="m-0 min-w-0 flex-1 self-center text-[12.5px] text-muted">
              {t("The agent works with the G1 only. Pick the G1 in the header.")}
            </p>
          )}
          <StopButton onClick={stop} className="h-11"
            title={t("Stop the instruction now: the arm goes home and lets go")} />
        </div>
      </aside>
    </main>
  );
}

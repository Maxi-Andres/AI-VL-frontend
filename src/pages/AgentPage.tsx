import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  IconAdjustmentsHorizontal,
  IconArrowUp,
  IconMessageChatbot,
  IconMicrophone,
  IconMicrophone2,
  IconMicrophone2Off,
  IconMicrophoneOff,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";
import { runAgent, stopAgent } from "../api/agent";
import { setRobotCamera } from "../api/backend";
import { AgentTrace } from "../components/agent/AgentTrace";
import { robotState } from "../components/layout/PresencePills";
import { useRobot } from "../components/layout/RobotContext";
import { useVideoTransport } from "../components/layout/VideoTransportContext";
import { useVoiceAssistantContext } from "../components/layout/VoiceAssistantContext";
import { RobotCameraSwitch } from "../components/live/RobotCameraSwitch";
import { RobotPicture } from "../components/live/RobotPicture";
import { Chip } from "../components/ui/Chip";
import { Conversations } from "../components/ui/Conversations";
import { Segmented } from "../components/ui/Segmented";
import { VideoTransportSwitch } from "../components/live/VideoTransportSwitch";
import { StatusText, type Status } from "../components/ui/StatusText";
import { StopButton } from "../components/ui/StopButton";
import { useChats } from "../hooks/useChats";
import { usePresence } from "../hooks/usePresence";
import { useRobotCameraView } from "../hooks/useRobotCameraView";
import { useRobotTransports } from "../hooks/useRobotTransports";
import { agentChat, savedTrace, turnFromSaved } from "../lib/agentTrace";
import type { AgentEvent } from "../types";
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
 * back as an error line).
 *
 * Voice, the same three switches as Live: this computer's mic (hands-free: every phrase heard
 * is an instruction), the robot's mic ("Bender, …", in the agent's mode) and answers out loud,
 * through this device or the robot's speaker.
 *
 * The conversations are kept per person, like Live's (useChats, kind "agent"): every finished
 * turn — typed, spoken here, or "Bender, …" heard by the robot while this page is open — is
 * saved with its trace, and "New" starts another. The agent itself does not see earlier turns:
 * each instruction runs on its own. Leaving the page while a run goes on presses STOP: nobody would be
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
  // The label next to the robot's name answers "is the ROBOT there", from the backend's ping
  // (the header pill's signal). `connected` is only this page's socket to the backend: it read
  // "Connected" over a black picture with the G1 switched off (2026-11-04).
  const { presence } = usePresence();
  const net = useRobotTransports();
  const reach = presence ? robotState(presence, robot, net) : null;
  const label = !connected
    ? { tone: "idle", text: t("Connecting…"), title: undefined }
    : reach?.tone === "good"
      ? { tone: "good", text: t("Robot online"), title: reach.title }
      : reach?.tone === "bad"
        ? { tone: "bad", text: t("Robot offline"), title: reach.title }
        : { tone: "idle", text: t("Robot state unknown"), title: reach?.title };
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

  // The saved conversations. Opening one (or a new one) replaces the chat with what it kept;
  // a turn is saved once its run is over (`toSave`, filled by its end).
  const chats = useChats(true, "agent");
  const saveChat = chats.save;
  const toSave = useRef(new Set<number>());
  useEffect(() => {
    toSave.current.clear();
    dispatch({ type: "load", turns: chats.history.map((m) => turnFromSaved(nextId.current++, m)) });
    // Only when another conversation is opened: `history` also grows with every save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chats.version]);
  useEffect(() => {
    for (const id of toSave.current) {
      const turn = turns.find((x) => x.id === id);
      if (!turn) {
        toSave.current.delete(id);
        continue;
      }
      if (turn.running) continue;
      toSave.current.delete(id);
      saveChat({
        kind: "agent", question: turn.instruction, answer: turn.reply ?? "",
        status: turn.stopping ? "stopped" : "", robot, trace: savedTrace(turn),
      });
    }
  }, [turns, saveChat, robot]);

  // The reply is spoken the way the rest of the app speaks answers: only when spoken answers
  // are on (the voice assistant's switch), with its voice and its output.
  const { va, registerAsk } = useVoiceAssistantContext();
  const speakRef = useRef<(text: string) => void>(() => {});
  speakRef.current = (reply: string) => {
    if (va.spokenMode) va.speak(reply);
  };

  // Resolves with the reply (null: none, or not sent). `voiced`: asked by hands-free, which
  // speaks the reply itself, so it is not spoken here too.
  const send = useCallback(async (raw: string, voiced = false): Promise<string | null> => {
    const instruction = raw.trim().slice(0, MAX_CHARS);
    if (!instruction || runRef.current) return null;
    let reply: string | null = null;
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
        if (event.type === "reply" && event.text) {
          reply = event.text;
          if (!voiced) speakRef.current(event.text);
        }
      }, ctl.signal);
      dispatch({ type: "end", id, at: Date.now() });
      toSave.current.add(id);
    } catch (e) {
      if (ctl.signal.aborted) return null; // the page went away
      dispatch({ type: "failed", id, at: Date.now(), text: e instanceof Error ? e.message : String(e) });
      toSave.current.add(id);
    } finally {
      if (runRef.current?.id === id) runRef.current = null;
      if (alive.current) setBusy(false);
    }
    return reply;
  }, []);

  // Hands-free (this computer's mic) on this page: what it hears goes to the agent, not to the
  // vision chat, and the reply comes back to be spoken the way hands-free speaks.
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => {
    if (!isG1) return;
    registerAsk(async (prompt, onDelta) => {
      const reply = await sendRef.current(prompt, true);
      if (reply) onDelta(reply);
      return reply;
    });
    return () => registerAsk(null);
  }, [isG1, registerAsk]);

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

  // "Bender, …" said to the robot in the agent's mode (or while it walks): the gateway runs it
  // and the robot speaks the reply; the run shows here as a turn of its own, like a typed one.
  const voiceRun = useRef<number | null>(null);
  const onAgentEvents = va.onAgentEvents;
  useEffect(() => onAgentEvents((event) => {
    const at = Date.now();
    if (event.type === "heard") {
      const id = nextId.current++;
      voiceRun.current = id;
      dispatch({ type: "start", id, text: event.text ?? "", at });
      return;
    }
    const id = voiceRun.current;
    if (id === null) return;
    if (event.type === "end") {
      dispatch({ type: "end", id, at });
      toSave.current.add(id);
      voiceRun.current = null;
      return;
    }
    dispatch({ type: "event", id, event: event as unknown as AgentEvent, at });
  }), [onAgentEvents]);
  const earInAgentMode = va.robotEar && (va.earModeNow ?? va.earMode) === "agent";

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

  const canSend = isG1 && !busy && !!text.trim();
  const voiceStatus = [va.status, va.robotEarStatus].filter(Boolean).join(" · ");

  return (
    <main className="grid gap-4 p-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_420px] lg:overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="m-0 flex items-center gap-2 text-[15px] font-bold">
            <span className="font-mono">/agent</span>
            <span className="text-dim">·</span>
            {robotName}
          </h1>
          <span title={label.title}
            className={`flex items-center gap-2 text-[12.5px] font-semibold ${label.tone === "good" ? "text-good-fg" : label.tone === "bad" ? "text-bad-fg" : "text-muted"}`}>
            <span className={`size-2 shrink-0 rounded-full ${label.tone === "good" ? "bg-good-fg shadow-[0_0_0_4px_var(--color-good-bg)]" : label.tone === "bad" ? "bg-bad-fg shadow-[0_0_0_4px_var(--color-bad-bg)]" : "bg-dim"}`} />
            {label.text}
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
          {status ? (
            <StatusText status={{ ...status, text: t(status.text) }}
              className="ml-auto min-w-0 truncate text-xs font-semibold text-muted" />
          ) : voiceStatus && (
            <span title={voiceStatus} className="ml-auto min-w-0 truncate text-xs font-semibold text-muted">{voiceStatus}</span>
          )}
        </div>

        <div className="border-b border-line px-3 py-1.5">
          <Conversations busy={running} chat={{
            chats: chats.chats, current: chats.current, error: chats.error,
            onOpen: (id) => void chats.open(id), onDelete: (id) => void chats.remove(id),
          }} />
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
            <div className="min-w-0 flex-1 rounded-[14px] border border-line bg-bg transition focus-within:border-accent focus-within:shadow-[0_0_0_4px_var(--color-good-bg)]">
              <div className="flex items-end">
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
                <button type="button" onClick={() => void send(text)} disabled={!canSend} title={t("Send")}
                  className="m-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg bg-fg text-bg transition active:scale-95 disabled:cursor-default disabled:opacity-35">
                  <IconArrowUp size={17} />
                </button>
              </div>
              {/* Voice, as on Live: this computer's mic, the robot's mic, and answers out loud
                  (here or on the robot's speaker). */}
              <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
                {va.micSupported && (
                  <Chip on={va.voiceMode} onClick={va.toggleVoiceMode}
                    title={va.listenMode === "wake"
                      ? t("This computer's mic: say “robot”, then the instruction")
                      : t("This computer's mic: just speak — each phrase is sent to the agent")}
                    icon={va.voiceMode ? <IconMicrophone size={14} /> : <IconMicrophoneOff size={14} />} label={t("Hands-free")} />
                )}
                {va.robotMic && (
                  // The robot's own mic in the AGENT's mode: "Bender, …" goes to the agent (the
                  // robot says "Modo agente"). Switched on from Live it is in the VLM mode:
                  // pressing here changes it to this one.
                  <Chip on={earInAgentMode} onClick={() => va.toggleRobotEar("agent")}
                    title={earInAgentMode ? t("The robot's mic is on: say “Bender, …” and the agent does it")
                      : va.robotEar ? t("The robot's mic is in the VLM mode: press to give “Bender, …” to the agent")
                        : t("Switch the robot's mic on: say “Bender, …” and the agent does it")}
                    icon={va.robotEar ? <IconMicrophone2 size={14} /> : <IconMicrophone2Off size={14} />}
                    label={va.robotEar && !earInAgentMode ? t("Robot mic · VLM") : t("Robot mic")} />
                )}
                {va.speechSupported && (
                  <Chip on={va.spokenMode} onClick={va.toggleSpokenMode}
                    title={va.spokenMode ? t("Speak answers on") : t("Speak answers off")}
                    icon={va.spokenMode ? <IconVolume size={14} /> : <IconVolumeOff size={14} />} label={t("Out loud")} />
                )}
                {va.speechSupported && va.spokenMode && va.robotSpeaker && (
                  <Segmented className="flex rounded-lg bg-subtle p-0.5" title={t("Where the answers are spoken")}>
                    {(["browser", "robot"] as const).map((o) => (
                      <button key={o} type="button" onClick={() => va.onSpeechOutputChange(o)} data-on={va.speechOutput === o}
                        className={`cursor-pointer rounded-md px-2 py-0.5 text-[11px] font-bold transition-colors ${va.speechOutput === o ? "text-fg" : "text-muted"}`}>
                        {o === "browser" ? t("This device") : t("Robot")}
                      </button>
                    ))}
                  </Segmented>
                )}
              </div>
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

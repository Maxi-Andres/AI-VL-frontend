import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  IconAdjustmentsHorizontal,
  IconArrowUp,
  IconChevronDown,
  IconHeadset,
  IconHeadsetOff,
  IconMessages,
  IconPlus,
  IconMessage,
  IconMessageOff,
  IconMicrophone,
  IconMicrophone2,
  IconMicrophone2Off,
  IconPlayerStopFilled,
  IconScan,
  IconSparkles,
  IconTrash,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";
import type { ChatMessage, ChatSummary, NewMessage } from "../../api/chats";
import { DropMenu, useDropdown } from "../ui/DropMenu";
import { Select } from "../ui/Select";
import { StatusText } from "../ui/StatusText";
import { Segmented } from "../ui/Segmented";
import { msg, useT, type Vars } from "../../i18n";

// Longer-side sizes (px) offered for the frame sent to the VLM; "Full" = native. Nothing
// below 1152: the VLM server upscales every image to at least 1024 tokens of 32x32 px (~1 Mpx,
// llamacpp_image_min_tokens, and Ollama does the same), so a smaller frame costs the SAME time
// and only loses detail. Measured 2026-10-19: 320-1152 px all ~1060-1100 tokens in 0.82 s, and
// a nameplate read "Fluke" at 512, "Crauvin" at 768, "Chauvin Arnoux" from 1024 up; 1600 px
// cost 1.1-1.5 s.
export const VLM_IMG_SIZES = ["1152", "1600", msg("Full")];
export const VLM_IMG_DEFAULT = 1152;

/** Hands-free voice controls, produced by useVoiceAssistant. */
export interface VoiceControls {
  /** The mic can record here (the hands-free "just speak" mode and the mic button need no more). */
  micSupported: boolean;
  /** The browser can also listen for a wake word (Web Speech; not in Brave or Firefox). */
  wakeSupported: boolean;
  /** Hands-free on: it listens by itself and sends what it hears. */
  voiceMode: boolean;
  onToggleVoiceMode: () => void;
  /** How hands-free listens: "open" = just speak; "wake" = say "robot" first. */
  listenMode: "open" | "wake";
  onListenModeChange: (m: "open" | "wake") => void;
  /** The mic button: one spoken question, sent when the speaker stops. */
  onListenOnce: () => void;
  /** Where the voice loop is: off, listening, recording, transcribing, thinking, speaking. */
  phase: string;
  /** How loud answers play — this device's or the robot speaker's, whichever speaks. */
  volume: { value: number | null; max: number; where: "device" | "robot"; onChange: (v: number) => void };
  /** Text-to-speech is available in this browser. */
  speechSupported: boolean;
  spokenMode: boolean;
  onToggleSpokenMode: () => void;
  /** Speak a short "thinking" filler when the answer is slow to start. */
  fillerMode: boolean;
  onToggleFillerMode: () => void;
  /** Status of the voice loop (e.g. "Listening for the wake word…"). */
  status: string;
  /** The selected robot has its own microphone the app can listen through (the G1). */
  robotMic: boolean;
  /** Listening through it, Alexa-style, for "Bender, …". On = the robot's mic is on. */
  robotEar: boolean;
  onToggleRobotEar: () => void;
  /** One line about the robot's mic ("listening for Bender", what it heard, why it stopped). */
  robotEarStatus: string;
  /** A TTS utterance is currently playing. */
  speaking: boolean;
  /** Read an answer aloud (the latest when no text is given) / stop reading. */
  onSpeak: (text?: string) => void;
  onStopSpeak: () => void;
  /** Available TTS voices (the server's; the browser's only if the server has none). */
  voices: { uri: string; label: string }[];
  voiceURI: string | null;
  onVoiceChange: (uri: string) => void;
  /** Where spoken answers come out: this browser or the robot's own speaker. */
  speechOutput: "browser" | "robot";
  onSpeechOutputChange: (output: "browser" | "robot") => void;
  /** The selected robot has a speaker the app can drive (the Go2 today). */
  robotSpeaker: boolean;
  /** Why the last sentence did not play on the robot. */
  robotSpeakerError: string | null;
}

/** The person's saved conversations (useChats): this panel shows one and saves to it. */
export interface ChatControls {
  chats: ChatSummary[];
  current: string | null;
  /** The open conversation's messages, as loaded. */
  history: ChatMessage[];
  /** Changes when another conversation is opened or a new one started. */
  version: number;
  error: string | null;
  onOpen: (id: string | null) => void;
  onDelete: (id: string) => void;
  /** Keep a finished exchange (the robot it was about is added by the page). */
  onSave: (msg: Omit<NewMessage, "robot">) => void;
}

interface Props {
  chat: ChatControls;
  models: string[];
  scopes: string[];
  variants: string[];
  model: string;
  scope: string;
  variant: string;
  canAsk: boolean;
  busy: boolean;
  status: string;
  output: string;
  /** Free-prompt text (controlled here so dictation can populate it). */
  prompt: string;
  /** Optional: longer-side px of the frame sent to the VLM (0 = native). */
  imageMaxSize?: number;
  onImageMaxSizeChange?: (v: number) => void;
  onPromptChange: (v: string) => void;
  onModelChange: (v: string) => void;
  onScopeChange: (v: string) => void;
  onVariantChange: (v: string) => void;
  /** Analyze the frame: the structured scan (scope + variant), boxes drawn on the picture. */
  onAsk: () => void;
  /** Ask a free-form question about the current frame (plain-text answer). */
  onAskPrompt: (prompt: string) => void;
  voice: VoiceControls;
}

/** One exchange: what was asked (a question, or a scan for objects) and what came back. */
interface Turn {
  id: number;
  kind: "analysis" | "question";
  question: string;
  answer: string;
  status: string;
  done: boolean;
}

interface Found {
  type?: string;
  description?: string;
  reading?: string | number | null;
  confidence?: number;
}

/** An analysis answer is JSON ({"objects": [...]}); read it into rows, or null if it is not. */
function foundObjects(answer: string): Found[] | null {
  try {
    const v = JSON.parse(answer) as { objects?: unknown };
    return Array.isArray(v?.objects) ? (v.objects as Found[]) : null;
  } catch {
    return null;
  }
}

// The Spanish of both starts with "Error" too (i18n/es/live.ts), so this holds in either language.
const failed = (status: string) => /^(Error|Request failed)/.test(status);

/**
 * The vision assistant as a chat, like any LLM: the conversation fills the panel, the box to
 * ask sits at the bottom. Two different things to send, and they look different:
 *  - "Find objects" runs the structured scan (scope + variant). Its JSON is made for a
 *    program — the robot's own AI one day — so a person sees it read out as a list, with
 *    boxes drawn on the picture, and the raw JSON only folded away;
 *  - a question, typed or spoken ("robot, …"), is answered in plain words, streamed.
 * Voice and model settings fold away under the box.
 *
 * The page owns the requests (one at a time): this keeps the conversation, opening a turn
 * when a request starts — whoever started it, the box or the voice loop — and closing it
 * with the answer when it ends.
 */
export function VlmPanel({
  chat,
  models,
  scopes,
  variants,
  model,
  scope,
  variant,
  canAsk,
  busy,
  status,
  output,
  prompt,
  imageMaxSize,
  onImageMaxSizeChange,
  onPromptChange,
  onModelChange,
  onScopeChange,
  onVariantChange,
  onAsk,
  onAskPrompt,
  voice,
}: Props) {
  const t = useT();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [settings, setSettings] = useState(false);
  // The mic is taking a question: recording it or turning it into text.
  const hearing = voice.phase === "recording" || voice.phase === "transcribing";
  const pending = useRef<Turn["kind"] | null>(null);
  const wasBusy = useRef(false);
  // Ids for turns made here, apart from the saved messages' ids.
  const nextId = useRef(1_000_000);
  // What the open turn asked, for saving it once the answer is in.
  const asked = useRef<{ kind: Turn["kind"]; question: string } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  // Follow the newest message — unless the person scrolled up to read an older one; sending
  // something new brings the view back down.
  const stick = useRef(true);

  // A request starting opens a turn; ending closes it with the final answer and its status.
  useEffect(() => {
    if (busy && !wasBusy.current) {
      const kind = pending.current ?? "question";
      pending.current = null;
      const question = kind === "analysis" ? `${scope} · ${variant}` : prompt.trim() || t("(spoken question)");
      setTurns((t) => [...t, { id: nextId.current++, kind, question, answer: "", status: "", done: false }]);
      asked.current = { kind, question };
      if (kind === "question") onPromptChange("");
    } else if (!busy && wasBusy.current) {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, answer: output, status, done: true } : x)));
      // Kept for good: an answer, or what went wrong — not an empty turn that was cut short.
      if (asked.current && (output.trim() || status)) chat.onSave({ ...asked.current, answer: output, status });
      asked.current = null;
    }
    wasBusy.current = busy;
    // Only the edges of `busy` open and close turns; the rest is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  // Another conversation opened (or a new one): show its history, from the bottom.
  useEffect(() => {
    setTurns(chat.history.map((m) => ({ id: m.id, kind: m.kind, question: m.question, answer: m.answer, status: m.status, done: true })));
    stick.current = true;
    requestAnimationFrame(() => {
      const el = scroller.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    // Only on a switch: `history` also follows saves, which must not reload the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.version]);

  // While a turn is open, its answer is the stream as it arrives.
  const live = busy ? { answer: output, status } : null;

  // Watch the content, not the props: an answer grows token by token, a list of found objects
  // replaces the dots, the settings fold out and shrink the view — each must keep the newest
  // line in sight.
  useEffect(() => {
    const el = scroller.current;
    const inner = content.current;
    if (!el || !inner) return;
    const follow = () => {
      if (stick.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    };
    const ro = new ResizeObserver(follow);
    ro.observe(inner);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toBottom = () => {
    stick.current = true;
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }));
  };
  const analyze = () => {
    pending.current = "analysis";
    toBottom();
    onAsk();
  };
  const send = () => {
    const q = prompt.trim();
    if (!q || !canAsk || busy) return;
    pending.current = "question";
    toBottom();
    onAskPrompt(q);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Conversations chat={chat} busy={busy} />
      <div ref={scroller} className="-mx-1 min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-1"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}>
        <div ref={content} className={turns.length === 0 ? "h-full" : ""}>
          {turns.length === 0 ? (
            <div className="grid h-full place-items-center px-4 py-8 text-center">
              <div>
                <span className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-good-bg text-good-fg">
                  <IconSparkles size={22} />
                </span>
                <b className="block text-sm">{t("Ask about what the camera sees")}</b>
                <p className="m-0 mt-1 text-[12.5px] text-muted">
                  {t("Type a question, say “robot” and ask it, or use Find objects to list what is in the frame.")}
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {[t("What do you see?"), t("Is anyone in the frame?"), t("Read any text or gauges")].map((q) => (
                    <button key={q} type="button" onClick={() => onPromptChange(q)}
                      className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted transition hover:border-accent hover:text-fg">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 pb-1">
              {turns.map((turn, i) => {
                const last = i === turns.length - 1;
                const answer = last && live ? live.answer : turn.answer;
                const st = last && live ? live.status : turn.status;
                return (
                  <div key={turn.id} className="grid min-w-0 animate-rise grid-cols-[minmax(0,1fr)] gap-2">
                    <Asked turn={turn} />
                    <Answer turn={turn} answer={answer} status={st} streaming={last && busy}
                      voice={voice} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        <button type="button" onClick={analyze} disabled={!canAsk || busy}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-accent/40 bg-good-bg py-2 text-[13px] font-bold text-good-fg transition hover:border-accent active:scale-[.98] disabled:cursor-default disabled:opacity-50">
          <IconScan size={17} />{t("Find objects")}
          <span className="font-semibold opacity-70" title={t("Scope · prompt variant (change them under the settings)")}>· {scope} · {variant}</span>
        </button>

        <div className="rounded-xl border border-line bg-bg transition focus-within:border-accent">
          <textarea value={prompt} onChange={(e) => onPromptChange(e.target.value)} rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t("Ask anything about the frame — e.g. Is the reading within normal range?")}
            aria-label={t("Question about the frame")}
            className="block max-h-32 min-h-[52px] w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] text-fg outline-none [field-sizing:content] placeholder:text-dim" />
          <div className="flex items-center gap-1 px-2 pb-2">
            {voice.micSupported && (
              <button type="button" onClick={voice.onListenOnce} disabled={!canAsk || busy || hearing || voice.voiceMode}
                title={t("Speak a question — it is sent when you stop talking")} aria-label={t("Speak a question")}
                className={`grid size-7 cursor-pointer place-items-center rounded-lg transition duration-200 active:scale-90 disabled:cursor-default ${
                  hearing && !voice.voiceMode ? "animate-pulse bg-bad-bg text-bad-fg" : "text-muted hover:bg-subtle hover:text-fg disabled:opacity-40 disabled:hover:bg-transparent"}`}>
                <IconMicrophone size={15} />
              </button>
            )}
            {voice.micSupported && (
              <Toggle on={voice.voiceMode} onClick={voice.onToggleVoiceMode}
                title={voice.listenMode === "wake"
                  ? voice.voiceMode ? t("Hands-free on: say “robot”, then your question") : t("Hands-free off: say “robot”, then your question")
                  : voice.voiceMode ? t("Hands-free on: just speak — each question is sent by itself") : t("Hands-free off: just speak — each question is sent by itself")}
                icon={voice.voiceMode ? <IconHeadset size={15} /> : <IconHeadsetOff size={15} />} />
            )}
            {voice.robotMic && (
              <Toggle on={voice.robotEar} onClick={voice.onToggleRobotEar}
                title={voice.robotEar ? t("The robot's own microphone on: say “Bender, …”") : t("The robot's own microphone off: say “Bender, …”")}
                icon={voice.robotEar ? <IconMicrophone2 size={15} /> : <IconMicrophone2Off size={15} />} />
            )}
            {voice.speechSupported && (
              <Toggle on={voice.spokenMode} onClick={voice.onToggleSpokenMode}
                title={voice.spokenMode ? t("Speak answers on") : t("Speak answers off")}
                icon={voice.spokenMode ? <IconVolume size={15} /> : <IconVolumeOff size={15} />} />
            )}
            <button type="button" onClick={() => setSettings((s) => !s)} aria-expanded={settings} title={t("Voice and model settings")}
              className={`grid size-7 cursor-pointer place-items-center rounded-lg transition active:scale-90 ${settings ? "bg-subtle text-fg" : "text-muted hover:bg-subtle hover:text-fg"}`}>
              <IconAdjustmentsHorizontal size={15} className={`transition-transform duration-300 ${settings ? "rotate-90" : ""}`} />
            </button>
            <span className="ml-1 hidden truncate text-[11px] text-dim sm:inline">{t("Enter to send")}</span>
            <button type="button" onClick={send} disabled={!canAsk || busy || !prompt.trim()} aria-label={t("Ask")}
              className="ml-auto flex cursor-pointer items-center gap-1 rounded-lg bg-fg px-3 py-1.5 text-[12.5px] font-bold text-bg transition active:scale-95 disabled:cursor-default disabled:opacity-35">
              {t("Ask")}<IconArrowUp size={14} />
            </button>
          </div>
        </div>
        {(voice.status || voice.robotEarStatus) && (
          <p className="m-0 flex items-center gap-1.5 truncate text-[11.5px] text-muted" title={[voice.status, voice.robotEarStatus].filter(Boolean).join(" · ")}>
            {/* Green while it listens, red while it hears you: you can see it is working. */}
            {voice.phase !== "off" && (
              <span className={`size-1.5 shrink-0 rounded-full ${hearing ? "animate-pulse bg-bad-fg" : voice.phase === "listening" ? "animate-pulse bg-good-fg" : "bg-dim"}`} />
            )}
            <span className="truncate">{[voice.status, voice.robotEarStatus].filter(Boolean).join(" · ")}</span>
          </p>
        )}

        {/* Folds open and shut (grid rows 0fr ↔ 1fr animate the height); kept mounted so
            closing animates too, and `inert` keeps a closed one out of the tab order. */}
        <div inert={!settings}
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${settings ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="min-h-0 overflow-hidden">
            <div className="grid max-h-[46vh] gap-3 overflow-y-auto rounded-xl border border-line bg-panel p-3">
              <SettingsGroup title={t("Voice")}>
                {voice.speechSupported && (
                  <Row label={t("Volume")} hint={voice.volume.where === "robot" ? t("The robot's own speaker") : t("On this device")}>
                    <div className="flex w-40 items-center gap-2">
                      <IconVolume size={14} className="shrink-0 text-muted" />
                      <input type="range" min={0} max={voice.volume.max} step={voice.volume.max > 10 ? 5 : 1}
                        value={voice.volume.value ?? 0} disabled={voice.volume.value === null}
                        onChange={(e) => voice.volume.onChange(Number(e.target.value))}
                        aria-label={voice.volume.where === "robot" ? t("Robot speaker volume") : t("Volume on this device")}
                        className="min-w-0 flex-1 accent-[var(--color-accent)]" />
                      <span className="w-9 shrink-0 text-right text-[11px] text-muted tabular-nums">
                        {voice.volume.value === null ? "—" : voice.volume.where === "robot" ? `${voice.volume.value}/${voice.volume.max}` : `${voice.volume.value}%`}
                      </span>
                    </div>
                  </Row>
                )}
                {voice.micSupported && (
                  <Row label={t("Hands-free listens")} hint={voice.wakeSupported ? undefined : t("This browser cannot hear a wake word")}>
                    <Segmented className="flex rounded-lg bg-subtle p-0.5">
                      {([["open", t("Just speak")], ["wake", t("Say “robot”")]] as const).map(([m, label]) => (
                        <button key={m} type="button" onClick={() => voice.onListenModeChange(m)} data-on={voice.listenMode === m}
                          disabled={m === "wake" && !voice.wakeSupported}
                          className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${voice.listenMode === m ? "text-fg" : "text-muted"}`}>
                          {label}
                        </button>
                      ))}
                    </Segmented>
                  </Row>
                )}
                {voice.speechSupported && (
                  <Row label={t("Filler")} hint={t("A short word if the answer is slow to start")}>
                    <Toggle on={voice.fillerMode} onClick={voice.onToggleFillerMode} title={t("Filler")}
                      icon={voice.fillerMode ? <IconMessage size={15} /> : <IconMessageOff size={15} />} />
                  </Row>
                )}
                {voice.speechSupported && voice.robotSpeaker && (
                  <Row label={t("Speak through")} hint={voice.speechOutput === "robot" && voice.robotSpeakerError ? undefined : t("The robot plays the same voice")}>
                    <Segmented className="flex rounded-lg bg-subtle p-0.5">
                      {(["browser", "robot"] as const).map((o) => (
                        <button key={o} type="button" onClick={() => voice.onSpeechOutputChange(o)} data-on={voice.speechOutput === o}
                          className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${voice.speechOutput === o ? "text-fg" : "text-muted"}`}>
                          {o === "browser" ? t("This device") : t("Robot")}
                        </button>
                      ))}
                    </Segmented>
                  </Row>
                )}
                {voice.speechOutput === "robot" && voice.robotSpeakerError && (
                  <StatusText status={{ tone: "warn", text: voice.robotSpeakerError }} className="text-xs text-muted" />
                )}
                {voice.speechSupported && voice.voices.length > 0 && (
                  <Row label={t("Voice")} hint={t("Made on the server; Drive uses it too")}>
                    <select value={voice.voiceURI ?? ""} onChange={(e) => voice.onVoiceChange(e.target.value)}
                      className="w-40 rounded-md border border-line bg-bg p-1.5 text-xs text-fg focus:border-accent focus:outline-none">
                      <option value="">{t("Default")}</option>
                      {voice.voices.map((v) => <option key={v.uri} value={v.uri}>{v.label}</option>)}
                    </select>
                  </Row>
                )}
              </SettingsGroup>
              <SettingsGroup title={t("Model")}>
                <Row label={t("Model")}>
                  <div className="w-40"><Select options={models} value={model} onChange={(e) => onModelChange(e.target.value)} className="text-xs" /></div>
                </Row>
                <Row label={t("Find objects in")} hint={t("What “Find objects” looks for")}>
                  <div className="w-40"><Select options={scopes} value={scope} onChange={(e) => onScopeChange(e.target.value)} className="text-xs" /></div>
                </Row>
                <Row label={t("Prompt variant")}>
                  <div className="w-40"><Select options={variants} value={variant} onChange={(e) => onVariantChange(e.target.value)} className="text-xs" /></div>
                </Row>
                {imageMaxSize !== undefined && onImageMaxSizeChange && (
                  <Row label={t("Image quality")} hint={t("1152 costs nothing extra; bigger reads small print, slower")}>
                    <div className="w-40">
                      <Select options={VLM_IMG_SIZES.map((s) => t(s))} value={imageMaxSize > 0 ? String(imageMaxSize) : t("Full")} className="text-xs"
                        onChange={(e) => onImageMaxSizeChange(e.target.value === t("Full") ? 0 : parseInt(e.target.value, 10))} />
                    </div>
                  </Row>
                )}
              </SettingsGroup>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** What was sent: a question as a bubble, a scan as a tagged request — they look apart. */
function Asked({ turn }: { turn: Turn }) {
  const t = useT();
  if (turn.kind === "analysis") {
    return (
      <div className="flex justify-end">
        <span className="flex max-w-[85%] flex-wrap items-center gap-x-1.5 rounded-2xl rounded-br-md border border-accent/40 bg-good-bg px-3 py-1.5 text-[12.5px] font-bold text-good-fg">
          <IconScan size={15} className="shrink-0" />{t("Find objects")}
          <span className="font-semibold opacity-70">· {turn.question}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="flex justify-end">
      <p className="m-0 max-w-[85%] rounded-2xl rounded-br-md bg-fg px-3 py-2 text-[13px] whitespace-pre-wrap text-bg">{turn.question}</p>
    </div>
  );
}

function Answer({ turn, answer, status, streaming, voice }: {
  turn: Turn; answer: string; status: string; streaming: boolean; voice: VoiceControls;
}) {
  const t = useT();
  const bad = failed(status) && !answer;
  const found = turn.kind === "analysis" && answer ? foundObjects(answer) : null;
  return (
    <div className="flex gap-2">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-good-bg text-good-fg">
        <IconSparkles size={15} />
      </span>
      <div className={`min-w-0 flex-1 rounded-2xl rounded-tl-md px-3 py-2 text-[13px] ${bad ? "bg-bad-bg text-bad-fg" : "bg-subtle"}`}>
        {bad ? (
          status
        ) : !answer ? (
          <span className="flex items-center gap-1 py-1" aria-label={t("Thinking")}>
            {[0, 150, 300].map((d) => (
              <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />
            ))}
          </span>
        ) : found ? (
          <FoundList found={found} raw={answer} />
        ) : turn.kind === "analysis" ? (
          <>
            <p className="m-0">{t("The model answered, but not in a form Pilot can read out.")}</p>
            <Raw text={answer} />
          </>
        ) : (
          <p className="m-0 whitespace-pre-wrap">{answer}</p>
        )}
        {!streaming && !bad && answer && (
          <div className="mt-1.5 flex items-center gap-2 text-[11px] text-dim">
            <span className="min-w-0 truncate font-mono">{status}</span>
            {voice.speechSupported && turn.kind === "question" && (
              <button type="button" onClick={() => (voice.speaking ? voice.onStopSpeak() : voice.onSpeak(answer))}
                className="ml-auto flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-bold text-muted hover:bg-panel hover:text-fg">
                {voice.speaking ? <IconPlayerStopFilled size={12} /> : <IconVolume size={13} />}
                {voice.speaking ? t("Stop") : t("Read aloud")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The raw JSON, for whoever needs it (an integration, a bug report) — folded by default. */
function Raw({ text }: { text: string }) {
  const t = useT();
  return (
    <details className="mt-1.5 text-[11px] text-dim">
      <summary className="cursor-pointer font-bold select-none hover:text-fg">{t("Raw result")}</summary>
      <pre className="m-0 mt-1 max-h-48 overflow-auto rounded-lg bg-panel p-2 font-mono whitespace-pre-wrap text-muted">{text}</pre>
    </details>
  );
}

function FoundList({ found, raw }: { found: Found[]; raw: string }) {
  const t = useT();
  if (!found.length) return <><p className="m-0">{t("Nothing found for this scope.")}</p><Raw text={raw} /></>;
  return (
    <div>
      <p className="m-0 mb-1.5 font-bold">
        {found.length === 1 ? t("Found 1 thing") : t("Found {n} things", { n: found.length })}
        <span className="font-semibold text-muted"> · {t("each one is outlined in blue on the video")}</span>
      </p>
      <ul className="m-0 grid list-none gap-1 p-0">
        {found.map((o, i) => (
          <li key={i} className="flex items-baseline gap-2 rounded-lg bg-panel px-2 py-1">
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 block font-semibold break-words">{o.description || o.type || t("Object")}</span>
              {o.reading !== null && o.reading !== undefined && o.reading !== "" && (
                <span className="block text-[11.5px] text-muted">{t("Reads {value}", { value: String(o.reading) })}</span>
              )}
            </span>
            {o.type && <span className="shrink-0 rounded-full bg-subtle px-2 py-px text-[10.5px] font-bold text-muted">{o.type}</span>}
            {typeof o.confidence === "number" && (
              <span className="shrink-0 font-mono text-[11px] text-dim">{Math.round(o.confidence * 100)}%</span>
            )}
          </li>
        ))}
      </ul>
      <Raw text={raw} />
    </div>
  );
}

function Toggle({ on, onClick, title, icon }: { on: boolean; onClick: () => void; title: string; icon: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} title={title} aria-label={title}
      className={`grid size-7 cursor-pointer place-items-center rounded-lg transition duration-200 active:scale-90 ${on ? "bg-good-bg text-good-fg" : "text-muted hover:bg-subtle hover:text-fg"}`}>
      {icon}
    </button>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[10.5px] font-extrabold tracking-[.1em] text-dim uppercase">
        <IconChevronDown size={12} />{title}
      </div>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <b className="block text-[12.5px]">{label}</b>
        {hint && <small className="block text-[11px] leading-snug text-dim">{hint}</small>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ago(iso: string, t: (text: string, vars?: Vars) => string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return t("just now");
  if (m < 60) return t("{n} min ago", { n: m });
  if (m < 1440) return t("{n} h ago", { n: Math.floor(m / 60) });
  return new Date(iso).toLocaleDateString();
}

/** Which conversation is open, the others to switch to, a new one, and deleting. */
function Conversations({ chat, busy }: { chat: ChatControls; busy: boolean }) {
  const t = useT();
  const { open, setOpen, ref } = useDropdown();
  const [confirm, setConfirm] = useState<string | null>(null);
  const title = chat.chats.find((c) => c.id === chat.current)?.title ?? t("New conversation");
  return (
    <div className="mb-2 flex items-center gap-1.5">
      <div ref={ref} className="relative min-w-0 flex-1">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} disabled={busy}
          className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-bold transition hover:bg-subtle disabled:cursor-default disabled:opacity-60">
          <IconMessages size={15} className="shrink-0 text-muted" />
          <span className="min-w-0 truncate">{title}</span>
          {chat.chats.length > 0 && <span className="shrink-0 text-[11px] font-semibold text-dim">{chat.chats.length}</span>}
          <IconChevronDown size={14} className={`ml-auto shrink-0 text-dim transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <DropMenu open={open} className="top-9 right-auto left-0 w-full">
          {chat.chats.length === 0 && <p className="m-0 px-2.5 py-3 text-center text-[12.5px] text-muted">{t("No saved conversations yet.")}</p>}
          <ul className="m-0 max-h-[320px] list-none overflow-y-auto p-0">
            {chat.chats.map((c) => (
              <li key={c.id} className={`group flex items-center gap-1 rounded-[9px] ${c.id === chat.current ? "bg-subtle" : "hover:bg-subtle"}`}>
                <button type="button" onClick={() => { chat.onOpen(c.id); setOpen(false); setConfirm(null); }}
                  className="min-w-0 flex-1 cursor-pointer px-2.5 py-2 text-left">
                  <b className="block truncate text-[12.5px]">{c.title || t("Untitled")}</b>
                  <small className="block text-[11px] text-dim">{ago(c.updated_at, t)}{c.messages ? ` · ${c.messages === 1 ? t("1 message") : t("{n} messages", { n: c.messages })}` : ""}</small>
                </button>
                {confirm === c.id ? (
                  <button type="button" onClick={() => { chat.onDelete(c.id); setConfirm(null); }}
                    className="mr-1.5 shrink-0 cursor-pointer rounded-md bg-bad-bg px-2 py-1 text-[11px] font-bold text-bad-fg">
                    {t("Delete")}
                  </button>
                ) : (
                  <button type="button" onClick={() => setConfirm(c.id)} aria-label={t("Delete {title}", { title: c.title })} title={t("Delete this conversation")}
                    className="mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-dim opacity-60 transition group-hover:opacity-100 hover:bg-bad-bg hover:text-bad-fg">
                    <IconTrash size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </DropMenu>
      </div>
      <button type="button" onClick={() => chat.onOpen(null)} disabled={busy || chat.current === null} title={t("New conversation")}
        className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-bold transition hover:bg-subtle active:scale-95 disabled:cursor-default disabled:opacity-40">
        <IconPlus size={14} />{t("New")}
      </button>
      {chat.error && (
        <span role="alert" title={chat.error} className="max-w-[40%] shrink truncate text-[11px] font-semibold text-bad-fg">{chat.error}</span>
      )}
    </div>
  );
}

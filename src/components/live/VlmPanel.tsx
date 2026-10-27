import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  IconAdjustmentsHorizontal,
  IconArrowUp,
  IconChevronDown,
  IconMessage,
  IconMessageOff,
  IconMicrophone,
  IconMicrophone2,
  IconMicrophone2Off,
  IconMicrophoneOff,
  IconPlayerStopFilled,
  IconScan,
  IconSparkles,
  IconTrash,
  IconVolume,
  IconVolumeOff,
} from "@tabler/icons-react";
import { Select } from "../ui/Select";
import { StatusText } from "../ui/StatusText";

// Longer-side sizes (px) offered for the frame sent to the VLM; "Full" = native. Nothing
// below 1152: the VLM server upscales every image to at least 1024 tokens of 32x32 px (~1 Mpx,
// llamacpp_image_min_tokens, and Ollama does the same), so a smaller frame costs the SAME time
// and only loses detail. Measured 2026-10-19: 320-1152 px all ~1060-1100 tokens in 0.82 s, and
// a nameplate read "Fluke" at 512, "Crauvin" at 768, "Chauvin Arnoux" from 1024 up; 1600 px
// cost 1.1-1.5 s.
export const VLM_IMG_SIZES = ["1152", "1600", "Full"];
export const VLM_IMG_DEFAULT = 1152;

/** Hands-free voice controls, produced by useVoiceAssistant. */
export interface VoiceControls {
  /** Wake-word listening (Web Speech) + recording are available in this browser. */
  micSupported: boolean;
  voiceMode: boolean;
  onToggleVoiceMode: () => void;
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

interface Props {
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
  const [turns, setTurns] = useState<Turn[]>([]);
  const [settings, setSettings] = useState(false);
  const pending = useRef<Turn["kind"] | null>(null);
  const wasBusy = useRef(false);
  const nextId = useRef(1);
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
      const question = kind === "analysis" ? `${scope} · ${variant}` : prompt.trim() || "(spoken question)";
      setTurns((t) => [...t, { id: nextId.current++, kind, question, answer: "", status: "", done: false }]);
      if (kind === "question") onPromptChange("");
    } else if (!busy && wasBusy.current) {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, answer: output, status, done: true } : x)));
    }
    wasBusy.current = busy;
    // Only the edges of `busy` open and close turns; the rest is read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

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
      <div ref={scroller} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1"
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
                <b className="block text-sm">Ask about what the camera sees</b>
                <p className="m-0 mt-1 text-[12.5px] text-muted">
                  Type a question, say “robot” and ask it, or use Find objects to list what is in the frame.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {["What do you see?", "Is anyone in the frame?", "Read any text or gauges"].map((q) => (
                    <button key={q} type="button" onClick={() => onPromptChange(q)}
                      className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted transition hover:border-accent hover:text-fg">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 pb-1">
              <div className="flex justify-end">
                <button type="button" onClick={() => setTurns([])} disabled={busy}
                  className="flex cursor-pointer items-center gap-1 text-[11.5px] font-bold text-dim hover:text-fg disabled:opacity-40">
                  <IconTrash size={13} />Clear
                </button>
              </div>
              {turns.map((t, i) => {
                const last = i === turns.length - 1;
                const answer = last && live ? live.answer : t.answer;
                const st = last && live ? live.status : t.status;
                return (
                  <div key={t.id} className="grid animate-rise gap-2">
                    <Asked turn={t} />
                    <Answer turn={t} answer={answer} status={st} streaming={last && busy}
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
          <IconScan size={17} />Find objects
          <span className="font-semibold opacity-70">· {scope}</span>
        </button>

        <div className="rounded-xl border border-line bg-bg transition focus-within:border-accent">
          <textarea value={prompt} onChange={(e) => onPromptChange(e.target.value)} rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask anything about the frame — e.g. Is the reading within normal range?"
            aria-label="Question about the frame"
            className="block max-h-32 min-h-[52px] w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] text-fg outline-none [field-sizing:content] placeholder:text-dim" />
          <div className="flex items-center gap-1 px-2 pb-2">
            {voice.micSupported && (
              <Toggle on={voice.voiceMode} onClick={voice.onToggleVoiceMode}
                title={`Hands-free ${voice.voiceMode ? "on" : "off"}: say “robot”, then your question`}
                icon={voice.voiceMode ? <IconMicrophone size={15} /> : <IconMicrophoneOff size={15} />} />
            )}
            {voice.robotMic && (
              <Toggle on={voice.robotEar} onClick={voice.onToggleRobotEar}
                title={`The robot's own microphone ${voice.robotEar ? "on" : "off"}: say “Bender, …”`}
                icon={voice.robotEar ? <IconMicrophone2 size={15} /> : <IconMicrophone2Off size={15} />} />
            )}
            {voice.speechSupported && (
              <Toggle on={voice.spokenMode} onClick={voice.onToggleSpokenMode}
                title={`Speak answers ${voice.spokenMode ? "on" : "off"}`}
                icon={voice.spokenMode ? <IconVolume size={15} /> : <IconVolumeOff size={15} />} />
            )}
            <button type="button" onClick={() => setSettings((s) => !s)} aria-expanded={settings} title="Voice and model settings"
              className={`grid size-7 cursor-pointer place-items-center rounded-lg transition active:scale-90 ${settings ? "bg-subtle text-fg" : "text-muted hover:bg-subtle hover:text-fg"}`}>
              <IconAdjustmentsHorizontal size={15} className={`transition-transform duration-300 ${settings ? "rotate-90" : ""}`} />
            </button>
            <span className="ml-1 hidden truncate text-[11px] text-dim sm:inline">Enter to send</span>
            <button type="button" onClick={send} disabled={!canAsk || busy || !prompt.trim()} aria-label="Ask"
              className="ml-auto flex cursor-pointer items-center gap-1 rounded-lg bg-fg px-3 py-1.5 text-[12.5px] font-bold text-bg transition active:scale-95 disabled:cursor-default disabled:opacity-35">
              Ask<IconArrowUp size={14} />
            </button>
          </div>
        </div>
        {(voice.status || voice.robotEarStatus) && (
          <p className="m-0 truncate text-[11.5px] text-muted" title={[voice.status, voice.robotEarStatus].filter(Boolean).join(" · ")}>
            {[voice.status, voice.robotEarStatus].filter(Boolean).join(" · ")}
          </p>
        )}

        {/* Folds open and shut (grid rows 0fr ↔ 1fr animate the height); kept mounted so
            closing animates too, and `inert` keeps a closed one out of the tab order. */}
        <div inert={!settings}
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${settings ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="min-h-0 overflow-hidden">
            <div className="grid max-h-[46vh] gap-3 overflow-y-auto rounded-xl border border-line bg-panel p-3">
              <SettingsGroup title="Voice">
                {voice.speechSupported && (
                  <Row label="Filler" hint="A short word if the answer is slow to start">
                    <Toggle on={voice.fillerMode} onClick={voice.onToggleFillerMode} title="Filler"
                      icon={voice.fillerMode ? <IconMessage size={15} /> : <IconMessageOff size={15} />} />
                  </Row>
                )}
                {voice.speechSupported && voice.robotSpeaker && (
                  <Row label="Speak through" hint={voice.speechOutput === "robot" && voice.robotSpeakerError ? undefined : "The robot plays the same voice"}>
                    <div className="flex rounded-lg bg-subtle p-0.5">
                      {(["browser", "robot"] as const).map((o) => (
                        <button key={o} type="button" onClick={() => voice.onSpeechOutputChange(o)}
                          className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-bold ${voice.speechOutput === o ? "bg-panel text-fg shadow-card" : "text-muted"}`}>
                          {o === "browser" ? "This device" : "Robot"}
                        </button>
                      ))}
                    </div>
                  </Row>
                )}
                {voice.speechOutput === "robot" && voice.robotSpeakerError && (
                  <StatusText status={{ tone: "warn", text: voice.robotSpeakerError }} className="text-xs text-muted" />
                )}
                {voice.speechSupported && voice.voices.length > 0 && (
                  <Row label="Voice" hint="Made on the server; Drive uses it too">
                    <select value={voice.voiceURI ?? ""} onChange={(e) => voice.onVoiceChange(e.target.value)}
                      className="w-40 rounded-md border border-line bg-bg p-1.5 text-xs text-fg focus:border-accent focus:outline-none">
                      <option value="">Default</option>
                      {voice.voices.map((v) => <option key={v.uri} value={v.uri}>{v.label}</option>)}
                    </select>
                  </Row>
                )}
              </SettingsGroup>
              <SettingsGroup title="Model">
                <Row label="Model">
                  <div className="w-40"><Select options={models} value={model} onChange={(e) => onModelChange(e.target.value)} className="text-xs" /></div>
                </Row>
                <Row label="Find objects in" hint="What “Find objects” looks for">
                  <div className="w-40"><Select options={scopes} value={scope} onChange={(e) => onScopeChange(e.target.value)} className="text-xs" /></div>
                </Row>
                <Row label="Prompt variant">
                  <div className="w-40"><Select options={variants} value={variant} onChange={(e) => onVariantChange(e.target.value)} className="text-xs" /></div>
                </Row>
                {imageMaxSize !== undefined && onImageMaxSizeChange && (
                  <Row label="Image quality" hint="1152 costs nothing extra; bigger reads small print, slower">
                    <div className="w-40">
                      <Select options={VLM_IMG_SIZES} value={imageMaxSize > 0 ? String(imageMaxSize) : "Full"} className="text-xs"
                        onChange={(e) => onImageMaxSizeChange(e.target.value === "Full" ? 0 : parseInt(e.target.value, 10))} />
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
  if (turn.kind === "analysis") {
    return (
      <div className="flex justify-end">
        <span className="flex items-center gap-1.5 rounded-2xl rounded-br-md border border-accent/40 bg-good-bg px-3 py-1.5 text-[12.5px] font-bold text-good-fg">
          <IconScan size={15} />Find objects
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
          <span className="flex items-center gap-1 py-1" aria-label="Thinking">
            {[0, 150, 300].map((d) => (
              <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />
            ))}
          </span>
        ) : found ? (
          <FoundList found={found} raw={answer} />
        ) : turn.kind === "analysis" ? (
          <>
            <p className="m-0">The model answered, but not in a form Pilot can read out.</p>
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
                {voice.speaking ? "Stop" : "Read aloud"}
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
  return (
    <details className="mt-1.5 text-[11px] text-dim">
      <summary className="cursor-pointer font-bold select-none hover:text-fg">Raw result</summary>
      <pre className="m-0 mt-1 max-h-48 overflow-auto rounded-lg bg-panel p-2 font-mono whitespace-pre-wrap text-muted">{text}</pre>
    </details>
  );
}

function FoundList({ found, raw }: { found: Found[]; raw: string }) {
  if (!found.length) return <><p className="m-0">Nothing found for this scope.</p><Raw text={raw} /></>;
  return (
    <div>
      <p className="m-0 mb-1.5 font-bold">Found {found.length} {found.length === 1 ? "thing" : "things"} — boxed in blue on the picture.</p>
      <ul className="m-0 grid list-none gap-1 p-0">
        {found.map((o, i) => (
          <li key={i} className="flex items-baseline gap-2 rounded-lg bg-panel px-2 py-1">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{o.description || o.type || "Object"}</span>
              {o.reading !== null && o.reading !== undefined && o.reading !== "" && (
                <span className="block text-[11.5px] text-muted">Reads {String(o.reading)}</span>
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

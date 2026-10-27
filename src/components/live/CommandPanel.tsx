import type { ReactNode } from "react";
import {
  IconAlertTriangle,
  IconArrowUp,
  IconBolt,
  IconFlask,
  IconMicrophone,
  IconOctagon,
  IconPlayerPlay,
  IconQuestionMark,
} from "@tabler/icons-react";
import { StatusText, type Status } from "../ui/StatusText";
import { Switch } from "../ui/Switch";
import type { CommandResponse } from "../../types";
import { fmtMs } from "../../lib/format";
import { useT } from "../../i18n";

interface Props {
  // Robot is selected globally in the header (see RobotContext); not a prop here.
  models: string[];
  model: string;
  onModelChange: (v: string) => void;
  /** Command text (typed, or filled in by dictation). */
  text: string;
  onTextChange: (v: string) => void;
  busy: boolean;
  /** One-line status (model · latency · ok/invalid, or an error). */
  status: string;
  /** Last interpreted result, or null before the first run. */
  result: CommandResponse | null;
  micSupported: boolean;
  recording: boolean;
  /** Interpret the current text box. */
  onInterpret: () => void;
  /** Record one spoken command, transcribe it, then interpret it. */
  onRecord: () => void;
  /** Send the last interpreted skill to the robot executor (makes the robot act). */
  onExecuteOnRobot: () => void;
  /** Emergency stop: tell the server to halt all motion NOW (always available). */
  onStop: () => void;
  executing: boolean;
  /** One-line result of the last execute (sent / blocked / error). */
  executeStatus: Status | null;
  /** Master arm switch: while off, nothing is ever sent to the robot. */
  execEnabled: boolean;
  onToggleExecEnabled: () => void;
  /** Auto-run: when on, an interpreted command fires automatically (no button). */
  autoRun: boolean;
  onToggleAutoRun: () => void;
  /** SAFE_MODE: when on, the executor blocks acrobatic skills (flips, handstand…). */
  safeMode: boolean;
  onToggleSafeMode: () => void;
}

/**
 * The command interpreter, as in the mockup: one phrase in (typed or spoken), the ONE skill it
 * maps to out — shown as a skill with its parameters and what the robot would say, so a wrong
 * pick is easy to spot before anything moves; the exact JSON stays folded below it. Nothing is
 * sent until "Robot" is switched on; "Auto" fires on every interpretation; "Safe" blocks the
 * acrobatics. STOP is always there, whatever the switches say.
 */
export function CommandPanel({
  models,
  model,
  onModelChange,
  text,
  onTextChange,
  busy,
  status,
  result,
  micSupported,
  recording,
  onInterpret,
  onRecord,
  onExecuteOnRobot,
  onStop,
  executing,
  executeStatus,
  execEnabled,
  onToggleExecEnabled,
  autoRun,
  onToggleAutoRun,
  safeMode,
  onToggleSafeMode,
}: Props) {
  const t = useT();
  const understood = !!result && result.skill !== "unknown";
  const canExecute = understood && execEnabled && !executing;
  // Only the robot-facing decision, not the model's debug fields.
  const decision = result ? { skill: result.skill, params: result.params, say: result.say } : null;
  const params = result ? Object.entries(result.params ?? {}) : [];
  // The Spanish of both starts with "Error" too (i18n/es/live.ts).
  const failed = /^(Error|Request failed)/i.test(status);

  return (
    <div className="grid gap-3">
      <div className="flex items-start gap-2.5 rounded-xl bg-warn-bg px-3 py-2.5 text-[12.5px] text-warn-fg">
        <IconFlask size={17} className="mt-px shrink-0" />
        <p className="m-0"><b>{t("Experimental")}</b> · {t("turns one phrase into one robot skill. Not autonomous.")}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <b className="block text-[13px]">{t("Model")}</b>
          <small className="block text-[11.5px] text-dim">{t("An *-instruct model answers fastest")}</small>
        </div>
        <select value={model} onChange={(e) => onModelChange(e.target.value)} aria-label={t("Model")}
          className="w-40 shrink-0 rounded-lg border border-line bg-bg px-2 py-1.5 text-xs font-semibold text-fg focus:border-accent focus:outline-none">
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      {/* The phrase */}
      <div className="rounded-[14px] border border-line bg-bg transition focus-within:border-accent focus-within:shadow-[0_0_0_4px_var(--color-good-bg)]">
        <textarea value={text} onChange={(e) => onTextChange(e.target.value)} rows={2} aria-label={t("Command")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim() && !busy) onInterpret();
            }
          }}
          placeholder={t("e.g. raise your hands · walk forward · stop · wave")}
          className="block min-h-[64px] w-full resize-none bg-transparent px-3 pt-2.5 text-[13px] text-fg outline-none placeholder:text-dim" />
        <div className="flex items-center gap-2 py-1.5 pr-1.5 pl-3">
          <span className="flex-1 text-[11.5px] font-semibold text-dim">{t("Spanish or English · Enter to interpret")}</span>
          {micSupported && (
            <button type="button" onClick={onRecord} disabled={busy && !recording} aria-pressed={recording}
              title={t("Speak one command: it is transcribed and interpreted")}
              className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-bold transition active:scale-95 disabled:cursor-default disabled:opacity-40 ${
                recording ? "animate-pulse border-bad-fg/40 bg-bad-bg text-bad-fg" : "border-line hover:bg-subtle"}`}>
              <IconMicrophone size={15} />{recording ? t("Listening…") : t("Speak")}
            </button>
          )}
          <button type="button" onClick={onInterpret} disabled={busy || !text.trim()}
            className="flex cursor-pointer items-center gap-1 rounded-lg bg-fg px-3 py-1.5 text-[12.5px] font-bold text-bg transition active:scale-95 disabled:cursor-default disabled:opacity-35">
            {busy && !recording ? t("Interpreting…") : t("Interpret")}<IconArrowUp size={14} />
          </button>
        </div>
      </div>

      {/* What it understood */}
      {failed && !result && <p className="m-0 rounded-xl bg-bad-bg px-3 py-2 text-[12.5px] text-bad-fg">{status}</p>}
      {result && (
        <div key={`${result.understood}-${result.elapsed_ms}`}
          className={`animate-rise rounded-2xl border p-3 ${understood ? "border-line bg-panel" : "border-bad-fg/30 bg-bad-bg"}`}>
          <small className="block text-[10.5px] font-bold tracking-wider text-dim uppercase">
            {understood ? t("Interpreted as") : t("Not understood")}
          </small>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[12.5px] font-bold ${
              understood ? "bg-good-bg text-good-fg" : "bg-panel text-bad-fg"}`}>
              {understood ? <IconBolt size={14} /> : <IconQuestionMark size={14} />}
              {result.skill}
            </span>
            <span className="ml-auto font-mono text-[11.5px] text-dim">{fmtMs(result.elapsed_ms)}</span>
          </div>
          {params.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {params.map(([k, v]) => (
                <span key={k} className="rounded-md bg-subtle px-2 py-0.5 text-[11.5px]">
                  <span className="text-muted">{k}</span> <b className="font-mono">{typeof v === "object" ? JSON.stringify(v) : String(v)}</b>
                </span>
              ))}
            </div>
          )}
          {result.say && <p className="m-0 mt-2 text-[12.5px] text-muted">{t("Robot says")} <span className="text-fg">“{result.say}”</span></p>}
          {result.understood && <p className="m-0 mt-1 text-[11.5px] text-dim">{t("Heard “{text}”", { text: result.understood })}</p>}
          <details className="mt-2 text-[11px] text-dim">
            <summary className="cursor-pointer font-bold select-none hover:text-fg">{t("What the robot receives")}</summary>
            <pre className="m-0 mt-1 max-h-48 overflow-auto rounded-lg bg-subtle p-2 font-mono whitespace-pre-wrap text-muted">
              {JSON.stringify(decision, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {/* The three switches: whether anything reaches the robot, whether it fires by itself,
          and whether acrobatics are blocked. Amber = armed, red = acts or unguarded. */}
      <div className="grid grid-cols-3 gap-2">
        <Gate label={t("Robot")} on={execEnabled} onChange={onToggleExecEnabled} tone={execEnabled ? "warn" : "idle"}
          state={execEnabled ? t("Armed") : t("Off")} title={t("Master switch: while off, no command is ever sent to the robot")} />
        <Gate label={t("Auto")} on={autoRun} onChange={onToggleAutoRun} disabled={!execEnabled} tone={autoRun ? "bad" : "idle"}
          state={autoRun ? t("Runs at once") : t("Off")} title={t("When on, an interpreted command runs automatically")} />
        <Gate label={t("Safe")} on={safeMode} onChange={onToggleSafeMode} tone={safeMode ? "good" : "bad"}
          state={safeMode ? t("On") : t("Acrobatics allowed")} title={t("Block acrobatic skills (flips, handstand, walk-upright)")} />
      </div>
      {!safeMode && <Warn>{t("Safe is off — flips and handstands can run.")}</Warn>}
      {execEnabled && autoRun && <Warn>{t("Auto is on — a command runs as soon as it is interpreted.")}</Warn>}

      <button type="button" onClick={onExecuteOnRobot} disabled={!canExecute}
        title={execEnabled ? t("Send this skill to the robot (the robot acts)") : t("Turn Robot on to enable execution")}
        className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl bg-fg text-[13px] font-bold text-bg transition active:scale-[.98] disabled:cursor-default disabled:bg-subtle disabled:text-dim">
        <IconPlayerPlay size={17} />
        {executing ? t("Sending to the robot…") : execEnabled ? t("Execute on robot") : t("Turn Robot on to execute")}
      </button>
      <StatusText status={executeStatus} className="-mt-1 text-xs text-muted" />

      {/* EMERGENCY STOP — always available, whatever the switches: the server halts all
          motion now (cancels any move loop and stops the robot). */}
      <button type="button" onClick={onStop} title={t("Halt the robot NOW — stop sending any movement")}
        className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#e5484e] to-[#c42f35] text-[13.5px] font-extrabold tracking-[.06em] text-white shadow-[0_8px_20px_-8px_rgba(217,63,69,.7),inset_0_1px_0_rgba(255,255,255,.2)] transition active:scale-[.97]">
        <IconOctagon size={19} />{t("STOP — stay still")}
      </button>
    </div>
  );
}

const TONE = {
  good: "border-good-fg/30 bg-good-bg",
  warn: "border-warn-fg/30 bg-warn-bg",
  bad: "border-bad-fg/30 bg-bad-bg",
  idle: "border-line bg-panel",
};
const TEXT = { good: "text-good-fg", warn: "text-warn-fg", bad: "text-bad-fg", idle: "text-dim" };

function Gate({ label, on, onChange, state, tone, title, disabled = false }: {
  label: string; on: boolean; onChange: () => void; state: string; tone: keyof typeof TONE; title: string; disabled?: boolean;
}) {
  return (
    <div title={title} className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center transition-colors duration-300 ${TONE[tone]} ${disabled ? "opacity-50" : ""}`}>
      <b className="text-[12.5px]">{label}</b>
      <Switch on={on} onChange={() => onChange()} label={label} disabled={disabled} />
      <small className={`text-[11px] leading-tight font-bold ${TEXT[tone]}`}>{state}</small>
    </div>
  );
}

function Warn({ children }: { children: ReactNode }) {
  return (
    <p className="-mt-1 m-0 flex items-center gap-1.5 text-[11.5px] font-semibold text-bad-fg">
      <IconAlertTriangle size={14} className="shrink-0" />{children}
    </p>
  );
}

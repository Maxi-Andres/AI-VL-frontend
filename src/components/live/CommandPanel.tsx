import { IconMicrophone, IconMicrophoneOff } from "@tabler/icons-react";
import type { CommandResponse, RobotInfo } from "../../types";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Select } from "../ui/Select";

interface Props {
  /** Robots the interpreter can target (e.g. G1, Go2). */
  robots: RobotInfo[];
  robot: string;
  onRobotChange: (v: string) => void;
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
  executing: boolean;
  /** One-line result of the last execute (sent / blocked / error). */
  executeStatus: string;
}

/**
 * Robot command interpreter (verification view). Type or speak a command and see
 * which SKILL the interpreter picks and the exact JSON it would hand to the robot
 * executor — so you can check it chooses correctly BEFORE anything moves. It does
 * not drive the robot; it only shows the decision.
 */
export function CommandPanel({
  robots,
  robot,
  onRobotChange,
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
  executing,
  executeStatus,
}: Props) {
  const canExecute = !!result && result.skill !== "unknown";
  // Show only the robot-facing decision (not the raw model/debug fields).
  const decision = result
    ? { skill: result.skill, params: result.params, say: result.say }
    : null;

  return (
    <div>
      <h2 className="m-0 mb-2.5 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted">
        Robot command (interpreter)
      </h2>

      {robots.length > 1 && (
        <Field label="Robot" inline>
          <select
            value={robot}
            onChange={(e) => onRobotChange(e.target.value)}
            className="w-full rounded-md border border-line bg-bg p-1.5 text-fg focus:border-accent focus:outline-none"
          >
            {robots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field
        label="Model"
        hint="An *-instruct model answers fastest (no reasoning step)."
      >
        <Select
          options={models}
          value={model}
          onChange={(e) => onModelChange(e.target.value)}
        />
      </Field>

      <Field
        label="Command"
        hint='Type a command (Spanish or English), e.g. "andá para adelante", "pará", "saludá".'
      >
        <textarea
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (text.trim() && !busy) onInterpret();
            }
          }}
          placeholder="e.g. levantá las manos"
          rows={2}
          className="w-full resize-y rounded-md border border-line bg-[#0a0b0f] p-2 font-mono text-xs leading-[1.4]"
        />
      </Field>

      <div className="mb-2 flex flex-wrap gap-2">
        <Button
          variant="accent"
          className="flex-1"
          disabled={busy || !text.trim()}
          onClick={onInterpret}
        >
          Interpret
        </Button>
        {micSupported && (
          <Button
            variant={recording ? "primary" : "secondary"}
            className="inline-flex items-center gap-1.5 px-2.5"
            disabled={busy && !recording}
            aria-pressed={recording}
            title="Speak one command; it gets transcribed and interpreted"
            onClick={onRecord}
          >
            {recording ? (
              <IconMicrophone size={16} stroke={2} />
            ) : (
              <IconMicrophoneOff size={16} stroke={2} />
            )}
            {recording ? "Listening…" : "Speak"}
          </Button>
        )}
      </div>

      <div className="mx-0 mt-2 mb-1 flex min-h-4 items-center gap-2 text-xs text-muted">
        <span>{status}</span>
      </div>

      {/* The chosen skill, big and obvious, so a wrong pick is easy to spot. */}
      {result && (
        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-wide text-muted">
            skill
          </span>
          <span
            className={`font-mono text-sm font-semibold ${
              result.skill === "unknown" ? "text-[#ff9aa6]" : "text-accent"
            }`}
          >
            {result.skill}
          </span>
        </div>
      )}

      {result?.understood && (
        <p className="m-0 mb-2 text-xs text-muted">
          heard: <span className="text-fg">“{result.understood}”</span>
        </p>
      )}

      {/* Exact JSON the robot executor receives. */}
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-[#0a0b0f] p-2 font-mono text-xs leading-[1.4]">
        {decision ? JSON.stringify(decision, null, 2) : ""}
      </pre>

      {/* Send the chosen skill to the real robot (explicit — never automatic). */}
      <Button
        variant="primary"
        className="mt-2 w-full"
        disabled={!canExecute || executing}
        onClick={onExecuteOnRobot}
        title="Send this skill to the robot executor (the robot acts)"
      >
        {executing ? "Sending to robot…" : "Execute on robot"}
      </Button>
      {executeStatus && (
        <p className="m-0 mt-1 text-xs text-muted">{executeStatus}</p>
      )}
    </div>
  );
}

import type { ReactNode } from "react";
import { IconLoader2, IconRobot } from "@tabler/icons-react";
import { StatusText } from "../ui/StatusText";
import type { AgentTurn, ToolItem, TraceItem } from "../../lib/agentTrace";
import { msg, useT } from "../../i18n";

/** The robot's tools by a name a person reads; a tool not listed shows as the server names it.
 * Marked with msg(): translated where drawn. */
const TOOL_LABEL: Record<string, string> = {
  pick: msg("pick up"),
  place: msg("put it in"),
  look: msg("look"),
  walk: msg("walk"),
  turn: msg("turn"),
};

interface Props {
  turns: AgentTurn[];
  /** The page's clock (ms), ticking while a run is open: the running tool's seconds. */
  now: number;
}

/**
 * The /agent chat: each instruction as the person's bubble, then the trace of the run in
 * monospace — what it understood, its plan, each tool with its own steps under it (the newest
 * lit while the tool runs) and its result — and the robot's reply as its bubble.
 */
export function AgentTrace({ turns, now }: Props) {
  const t = useT();
  if (!turns.length) {
    return (
      <p className="m-0 px-6 py-10 text-center text-sm text-muted">
        {t("Tell the robot what to do, typed or spoken: “pick up the bottle”, “what is on the table?”.")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {turns.map((turn) => <Turn key={turn.id} turn={turn} now={now} />)}
    </div>
  );
}

function Turn({ turn, now }: { turn: AgentTurn; now: number }) {
  const t = useT();
  const waiting = turn.running && !turn.stopping && !turn.items.some((it) => it.kind === "tool" && it.endedAt === undefined);
  return (
    <div className="flex animate-rise flex-col gap-2">
      <div className="flex justify-end">
        <p className="m-0 max-w-[85%] rounded-2xl rounded-br-md bg-fg px-3 py-2 text-[13px] whitespace-pre-wrap text-bg">{turn.instruction}</p>
      </div>
      <div className="flex flex-col gap-1 rounded-xl bg-sunken px-3 py-2 font-mono text-[12px] leading-relaxed text-muted">
        {turn.heard && <Line label={t("heard")}>{turn.heard}</Line>}
        {turn.understood && <Line label={t("understood")}>{turn.understood}</Line>}
        {turn.plan && turn.plan.length > 0 && <Line label={t("plan")}>{turn.plan.join(" · ")}</Line>}
        {turn.items.map((it, i) => <Item key={i} item={it} now={now} />)}
        {turn.stopping && turn.running && (
          <StatusText wrap status={{ tone: "busy", text: t("Stopping: the arm is going home…") }} className="text-warn-fg" />
        )}
        {waiting && (
          <StatusText status={{ tone: "busy", text: t("thinking…") }} className="text-dim" />
        )}
        {!turn.running && !turn.reply && !turn.items.length && (
          <span className="text-dim">{t("The run ended without an answer.")}</span>
        )}
      </div>
      {turn.reply && (
        <div className="flex gap-2">
          <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-good-bg text-good-fg">
            <IconRobot size={15} />
          </span>
          <p className="m-0 min-w-0 flex-1 rounded-2xl rounded-tl-md bg-subtle px-3 py-2 text-[13px] whitespace-pre-wrap text-fg">{turn.reply}</p>
        </div>
      )}
    </div>
  );
}

/** One trace line: a label, then what the run said. */
function Line({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 break-words ${className}`}>
      <span className="font-bold text-dim">{label}:</span> <span className="text-fg">{children}</span>
    </div>
  );
}

function Item({ item, now }: { item: TraceItem; now: number }) {
  const t = useT();
  if (item.kind === "thought") return <Line label={t("thought")}>{item.text}</Line>;
  if (item.kind === "error") {
    return <StatusText wrap status={{ tone: "error", text: item.text }} className="text-bad-fg" />;
  }
  return <Tool item={item} now={now} />;
}

/** The arguments the model gave a tool, as one readable run of values ("bottle"). */
function argsText(args: Record<string, unknown>): string {
  return Object.values(args)
    .filter((v) => v !== "" && v != null)
    .map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v)))
    .join(" · ");
}

function Tool({ item, now }: { item: ToolItem; now: number }) {
  const t = useT();
  const running = item.endedAt === undefined;
  const name = TOOL_LABEL[item.tool] ? t(TOOL_LABEL[item.tool]) : item.tool;
  const secs = Math.max(0, Math.round(((item.endedAt ?? now) - item.startedAt) / 1000));
  const args = argsText(item.args);
  const r = item.result;
  return (
    <div className="flex flex-col gap-0.5">
      <div className={`flex min-w-0 items-start gap-1.5 rounded-md ${running ? "-mx-1.5 bg-good-bg px-1.5 py-0.5 text-good-fg" : ""}`}>
        {running && <IconLoader2 size={13} className="mt-[3px] shrink-0 animate-spin" />}
        <span className="min-w-0 break-words">
          <span className={`font-bold ${running ? "" : "text-dim"}`}>{running ? t("running") : t("ran")}:</span>{" "}
          <span className={running ? "font-bold" : "text-fg"}>{name}</span>
          {args && <span> · {args}</span>}
          <span className={running ? "" : "text-dim"}> · {t("{n} s", { n: secs })}</span>
        </span>
      </div>
      {item.steps.length > 0 && (
        <ol className="m-0 ml-1 flex list-none flex-col gap-0.5 border-l border-line p-0 pl-2.5">
          {item.steps.map((s, i) => {
            const latest = running && i === item.steps.length - 1;
            return (
              <li key={i} className={`min-w-0 break-words ${latest ? "font-bold text-fg" : "text-muted"}`}>
                {s.step}
                {s.detail && <span className={latest ? "font-normal text-muted" : "text-dim"}> — {s.detail}</span>}
              </li>
            );
          })}
        </ol>
      )}
      {r && (
        <StatusText wrap
          status={{ tone: r.ok ? "ok" : "error", text: resultText(item.tool, name, r, t) }}
          className={r.ok ? "text-good-fg" : "text-bad-fg"} />
      )}
    </div>
  );
}

/** What a result line says. The answer, state and error are the robot's own words, shown as
 * they come (data from the robot is not translated). */
function resultText(
  tool: string, name: string, r: NonNullable<ToolItem["result"]>,
  t: ReturnType<typeof useT>,
): string {
  if (r.ok) {
    if (tool === "look" && r.answer) return `VLM: ${r.answer}`;
    return r.held ? t("{tool}: done, holding it", { tool: name }) : t("{tool}: done", { tool: name });
  }
  const why = r.error || r.state || r.last || t("no reason given");
  return t("{tool} failed: {why}", { tool: name, why });
}

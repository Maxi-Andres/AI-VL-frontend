import { useEffect, useRef, useState } from "react";
import { IconBone, IconCheck, IconChevronDown, IconRobot } from "@tabler/icons-react";
import { getFleet } from "../../api/fleet";
import { usePresence } from "../../hooks/usePresence";
import { useRobotTransports } from "../../hooks/useRobotTransports";
import { BatteryPill, PresencePills, robotState } from "./PresencePills";
import { useRobot } from "./RobotContext";
import { StatusBadge } from "./StatusBadge";

const ICON: Record<string, typeof IconRobot> = { go2: IconBone, g1: IconRobot };
const DOT = { good: "bg-good-fg", warn: "bg-warn-fg", bad: "bg-bad-fg", idle: "bg-dim" };

/**
 * The robot this browser is working with, compact: its name, whether it answers, its battery.
 * Opening it shows everything the header pills used to spread across the bar — every robot,
 * the services, this browser's stream — and switches the robot.
 */
export function RobotStatus({ connected }: { connected: boolean }) {
  const { robot, setRobot, robots } = useRobot();
  const { presence, reachable } = usePresence();
  const net = useRobotTransports();
  const [names, setNames] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The company's names for its robots ("Go2 · Unit 01"), where registered in Fleet.
  useEffect(() => {
    const ctl = new AbortController();
    getFleet(ctl.signal)
      .then((f) => setNames(Object.fromEntries(f.robots.map((r) => [r.slot, r.name]))))
      .catch(() => undefined);
    return () => ctl.abort();
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const info = robots.find((r) => r.id === robot);
  const name = names[robot] ?? info?.short ?? info?.label ?? robot;
  const state = presence ? robotState(presence, robot, net) : null;
  const tone = !reachable ? "bad" : state?.tone ?? "idle";
  const Icon = ICON[robot] ?? IconRobot;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={!reachable ? "The gateway does not answer" : state?.title}
        className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-panel py-1.5 pr-2 pl-2.5 text-[13px] font-semibold shadow-card transition hover:border-dim"
      >
        <span className={`size-2 rounded-full ${DOT[tone]} ${tone === "good" ? "animate-pulse" : ""}`} />
        <Icon size={16} className="text-muted" />
        <span className="max-w-[160px] truncate">{name}</span>
        <span className="hidden text-xs font-medium text-muted sm:inline">
          {!reachable ? "gateway offline" : state?.text ?? "…"}
        </span>
        {/* The selected robot's battery stays in view: it is what an operator acts on. */}
        <BatteryPill net={net} robotId={robot} />
        <IconChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div className="absolute top-11 right-0 z-50 w-[340px] animate-rise rounded-xl border border-line bg-panel p-2 shadow-lift">
          <div className="px-2 pt-1 pb-1.5 text-[11px] font-bold tracking-wider text-dim uppercase">Robot</div>
          {robots.map((r) => {
            const RIcon = ICON[r.id] ?? IconRobot;
            const st = presence ? robotState(presence, r.id, net) : null;
            return (
              <button key={r.id} onClick={() => { setRobot(r.id); setOpen(false); }}
                className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm ${r.id === robot ? "bg-subtle" : "hover:bg-subtle"}`}>
                <RIcon size={17} className="text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{names[r.id] ?? r.label}</span>
                  {names[r.id] && <span className="block truncate text-xs text-muted">{r.label}</span>}
                </span>
                {st && <span className={`size-2 rounded-full ${DOT[st.tone]}`} title={st.text} />}
                {r.id === robot && <IconCheck size={16} className="text-accent" />}
              </button>
            );
          })}
          <div className="mt-2 border-t border-line px-2 pt-2.5 pb-1">
            <div className="mb-2 text-[11px] font-bold tracking-wider text-dim uppercase">System</div>
            <div className="flex flex-wrap gap-1.5">
              <PresencePills />
              <StatusBadge connected={connected} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

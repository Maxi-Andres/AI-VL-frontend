import { useEffect, useState } from "react";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { getFleet } from "../../api/fleet";
import type { FleetRobot } from "../../api/fleet";
import { usePresence } from "../../hooks/usePresence";
import { useRobotTransports } from "../../hooks/useRobotTransports";
import { DropMenu, useDropdown } from "../ui/DropMenu";
import { RobotIcon } from "../fleet/RobotIcon";
import { BatteryPill, robotState } from "./PresencePills";
import { useRobot } from "./RobotContext";
import { StatusBadge } from "./StatusBadge";
import { PILL, systemRows } from "./systemRows";

const DOT = { good: "bg-good-fg", warn: "bg-warn-fg", bad: "bg-bad-fg", idle: "bg-dim" };
const RING = {
  good: "shadow-[0_0_0_3px_var(--color-good-bg)]",
  warn: "shadow-[0_0_0_3px_var(--color-warn-bg)]",
  bad: "shadow-[0_0_0_3px_var(--color-bad-bg)]",
  idle: "",
};
const TEXT = { good: "text-good-fg", warn: "text-warn-fg", bad: "text-bad-fg", idle: "text-muted" };

/**
 * The header's one pill for the robots and the services behind them, as in the mockup:
 * "3 of 5 up" at a glance, everything on click. Each robot counts as a service (does it
 * answer?), then the AI engine, robot control and robot video.
 *
 * The robot Live and Drive work with is picked here, and its name stays on the pill: the
 * mockup shows only the count, but an operator must never drive one robot believing it is
 * the other.
 */
export function SystemStatus({ connected }: { connected: boolean }) {
  const { robot, setRobot, robots } = useRobot();
  const { presence, reachable } = usePresence();
  const net = useRobotTransports();
  const { open, setOpen, ref } = useDropdown();
  const [fleet, setFleet] = useState<Record<string, FleetRobot>>({});

  // The company's names and colours for its robots, where registered in Fleet; refreshed on
  // open so a rename shows without a reload.
  useEffect(() => {
    const ctl = new AbortController();
    getFleet(ctl.signal)
      .then((f) => setFleet(Object.fromEntries(f.robots.map((r) => [r.slot, r]))))
      .catch(() => undefined);
    return () => ctl.abort();
  }, [open]);

  const robotRows = robots.map((r) => {
    const st = presence ? robotState(presence, r.id, net) : null;
    return { ...r, name: fleet[r.id]?.name ?? r.short ?? r.label, color: fleet[r.id]?.color, st };
  });
  const services = presence && reachable ? systemRows(presence) : [];
  const counted = [...robotRows.map((r) => r.st?.tone ?? "idle"), ...services.filter((s) => s.service).map((s) => s.tone)];
  const up = counted.filter((t) => t === "good").length;
  const tone = !reachable ? "bad" : !presence ? "idle"
    : services.some((s) => s.service && s.tone === "bad") ? "bad" : up === counted.length ? "good" : "warn";
  const active = robotRows.find((r) => r.id === robot);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Robots and services"
        className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-panel py-[5px] pr-2.5 pl-1.5 text-[12.5px] font-bold transition hover:shadow-card">
        {active && (
          <span className="flex items-center gap-1.5 border-r border-line pr-2" title={`Working with ${active.name}`}>
            <RobotIcon slot={active.id} color={active.color} size={22} />
            <span className="max-w-[120px] truncate">{active.name}</span>
            <BatteryPill net={net} robotId={active.id} />
          </span>
        )}
        <span className={`size-2 rounded-full ${DOT[tone]} ${RING[tone]}`} />
        {/* On a phone the dot alone says it; the words need the room the tabs use. */}
        <span className="hidden lg:inline">
          {!reachable ? "Server offline" : presence ? `${up} of ${counted.length} up` : "Checking…"}
        </span>
        <IconChevronDown size={14} className="text-dim" />
      </button>
      <DropMenu open={open} className="top-[46px] w-[330px]">
        <div className="px-2.5 pt-2 pb-1 text-[11px] font-extrabold tracking-[.1em] text-dim uppercase">Robots</div>
        {robotRows.map((r) => (
          <button key={r.id} type="button" onClick={() => { setRobot(r.id); setOpen(false); }}
            title={r.st?.title}
            className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13px] ${r.id === robot ? "bg-subtle" : "hover:bg-subtle"}`}>
            <RobotIcon slot={r.id} color={r.color} size={26} />
            <span className="min-w-0 flex-1">
              <b className="block truncate">{r.name}</b>
              <small className="block truncate text-[11.5px] text-dim">{r.id === robot ? "Live and Drive use this one" : r.label}</small>
            </span>
            <span className={`text-[11.5px] font-bold ${TEXT[r.st?.tone ?? "idle"]}`}>{r.st?.text ?? "…"}</span>
            {r.id === robot ? <IconCheck size={16} className="text-accent" /> : <span className="w-4" />}
          </button>
        ))}
        <div className="mt-1 border-t border-line px-2.5 pt-2.5 pb-1 text-[11px] font-extrabold tracking-[.1em] text-dim uppercase">Services</div>
        {!reachable && <p className="m-0 px-2.5 py-2 text-[13px] text-muted">This server does not answer.</p>}
        {services.map((r) => (
          <div key={r.key} className="flex items-center gap-2.5 px-2.5 py-2 text-[13px] font-semibold" title={r.detail}>
            <r.icon size={17} className={TEXT[r.tone]} />
            {r.label}
            <span className={`ml-auto rounded-full px-2 py-0.5 text-[11.5px] font-bold ${PILL[r.tone]}`}>{r.state}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center gap-2.5 border-t border-line px-2.5 pt-2.5 pb-1.5 text-[13px] font-semibold">
          This browser
          <span className="ml-auto"><StatusBadge connected={connected} /></span>
        </div>
      </DropMenu>
    </div>
  );
}

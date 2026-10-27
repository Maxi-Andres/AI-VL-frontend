import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconBroadcast,
  IconBuildingWarehouse,
  IconLayoutGrid,
  IconMan,
  IconSearch,
  IconSettings,
  IconSteeringWheel,
} from "@tabler/icons-react";
import { getFleet } from "../../api/fleet";
import type { Fleet } from "../../api/fleet";
import { getTeam } from "../../api/team";
import type { Team } from "../../api/team";
import { useCan, type Permission } from "../../auth/permissions";
import { Avatar } from "../ui/Avatar";
import { RobotIcon } from "../fleet/RobotIcon";
import { useRobot } from "./RobotContext";

// Search, from the header or Ctrl/⌘+K: jump to a page, a robot (opens it live), a site, a
// person or a Settings section. Everything searched is already the browser's to see — the
// fleet, and the team for those who manage it — loaded when the box opens.

interface Hit {
  key: string;
  group: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  go: () => void;
}

const PAGES: { to: string; label: string; icon: typeof IconBroadcast; perm?: Permission }[] = [
  { to: "/", label: "Fleet", icon: IconLayoutGrid },
  { to: "/live", label: "Live", icon: IconBroadcast },
  { to: "/drive", label: "Drive", icon: IconSteeringWheel, perm: "operate" },
  { to: "/joints", label: "Joints", icon: IconMan },
  { to: "/settings", label: "Settings", icon: IconSettings },
];

// Settings sections by the id the Settings page gives them (group-slug, or a fixed id).
const SECTIONS: { id: string; label: string; perm?: Permission }[] = [
  { id: "profile", label: "Profile" },
  { id: "team", label: "Team & roles", perm: "manage_users" },
  { id: "activity", label: "Activity", perm: "configure" },
  { id: "backups", label: "Backups", perm: "manage_org" },
  { id: "robot-connection", label: "Connection", perm: "configure" },
  { id: "robot-camera-stream", label: "Camera stream", perm: "configure" },
  { id: "robot-robot-video", label: "Robot video", perm: "configure" },
  { id: "robot-telemetry", label: "Telemetry", perm: "configure" },
  { id: "robot-safety-envelope", label: "Safety envelope", perm: "configure" },
  { id: "robot-installed-software", label: "Installed software", perm: "configure" },
  { id: "robot-services", label: "Services", perm: "configure" },
  { id: "video-video-tuning", label: "Video tuning", perm: "configure" },
];

export function SearchPalette() {
  const can = useCan();
  const navigate = useNavigate();
  const { setRobot } = useRobot();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const mayTeam = can("manage_users");

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setSel(0);
    requestAnimationFrame(() => input.current?.focus());
    const ctl = new AbortController();
    getFleet(ctl.signal).then(setFleet).catch(() => undefined);
    if (mayTeam) getTeam(ctl.signal).then(setTeam).catch(() => undefined);
    return () => ctl.abort();
  }, [open, mayTeam]);

  const hits = useMemo<Hit[]>(() => {
    const done = (fn: () => void) => () => {
      setOpen(false);
      fn();
    };
    const all: Hit[] = [
      ...PAGES.filter((p) => !p.perm || can(p.perm)).map((p) => ({
        key: `page-${p.to}`, group: "Pages", label: p.label, icon: <p.icon size={18} />, go: done(() => navigate(p.to)),
      })),
      ...(fleet?.robots ?? []).map((r) => ({
        key: `robot-${r.id}`, group: "Robots", label: r.name, hint: `${r.model} · open live`,
        icon: <RobotIcon slot={r.slot} color={r.color} id={r.id} size={26} />,
        go: done(() => {
          setRobot(r.slot);
          navigate("/live");
        }),
      })),
      ...(fleet?.sites ?? []).map((s) => ({
        key: `site-${s.id}`, group: "Sites", label: s.name, hint: s.address || s.timezone,
        icon: <IconBuildingWarehouse size={18} />, go: done(() => navigate("/")),
      })),
      ...(team?.members ?? []).map((m) => ({
        key: `person-${m.id}`, group: "People", label: m.name, hint: m.email,
        icon: <Avatar id={m.id} name={m.name || m.email} color={m.color} size={26} />, go: done(() => navigate("/settings#team")),
      })),
      ...SECTIONS.filter((s) => !s.perm || can(s.perm)).map((s) => ({
        key: `set-${s.id}`, group: "Settings", label: s.label, icon: <IconSettings size={18} />,
        go: done(() => navigate(`/settings#${s.id}`)),
      })),
    ];
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((h) => `${h.label} ${h.hint ?? ""} ${h.group}`.toLowerCase().includes(needle)) : all;
  }, [q, fleet, team, can, navigate, setRobot]);

  const pick = Math.min(sel, Math.max(0, hits.length - 1));
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") setSel((pick + 1) % Math.max(1, hits.length));
    else if (e.key === "ArrowUp") setSel((pick - 1 + hits.length) % Math.max(1, hits.length));
    else if (e.key === "Enter") hits[pick]?.go();
    else if (e.key === "Escape") setOpen(false);
    else return;
    e.preventDefault();
  };

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Search (Ctrl+K)" title="Search  ·  Ctrl+K"
        className="grid size-9 cursor-pointer place-items-center rounded-[10px] border border-line bg-panel text-muted transition hover:text-fg hover:shadow-card">
        <IconSearch size={18} />
      </button>
      {/* Rendered on <body>: the header's backdrop blur makes it the containing block of
          anything fixed inside it, which trapped this overlay in the header's strip. */}
      {open && createPortal(
        <div className="fixed inset-0 z-[60] bg-black/40 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div role="dialog" aria-label="Search" className="mx-auto w-full max-w-[580px] animate-rise overflow-hidden rounded-2xl border border-line bg-panel shadow-lift">
            <div className="flex items-center gap-3 border-b border-line px-4">
              <IconSearch size={18} className="text-muted" />
              <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKey}
                placeholder="Search robots, sites, people, settings…" aria-label="Search"
                className="h-13 min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-dim" />
              <kbd className="rounded-md border border-line px-1.5 py-0.5 text-[11px] font-bold text-dim">Esc</kbd>
            </div>
            <ul className="m-0 max-h-[420px] list-none overflow-y-auto p-2">
              {hits.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">Nothing matches “{q}”.</li>}
              {hits.map((h, i) => (
                <li key={h.key}>
                  {(i === 0 || hits[i - 1].group !== h.group) && (
                    <div className="px-2.5 pt-2.5 pb-1 text-[11px] font-extrabold tracking-[.1em] text-dim uppercase">{h.group}</div>
                  )}
                  <button type="button" onClick={h.go} onMouseMove={() => setSel(i)}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-[9px] px-2.5 py-2 text-left text-[13.5px] ${i === pick ? "bg-subtle" : ""}`}>
                    <span className="grid size-[26px] shrink-0 place-items-center text-muted">{h.icon}</span>
                    <b className="truncate">{h.label}</b>
                    {h.hint && <span className="ml-auto truncate pl-3 text-xs text-dim">{h.hint}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

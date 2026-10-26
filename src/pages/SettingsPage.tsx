import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { IconBone, IconRobot, IconUsers } from "@tabler/icons-react";
import { getFleet } from "../api/fleet";
import { useCan } from "../auth/permissions";
import { useRobot } from "../components/layout/RobotContext";
import { RobotSettings } from "../components/settings/RobotSettings";
import { VideoSettings } from "../components/settings/VideoSettings";

// Settings — what was the Robot and the Video pages, in one place: everything configured on
// the robot (connection, camera, telemetry, safety, installed services) and its live video
// knobs. A menu on the left lists the blocks and follows the scroll; each block is a card
// marked `data-nav` in its own component, so the menu never keeps a copy of their titles.

const ICON: Record<string, typeof IconRobot> = { go2: IconBone, g1: IconRobot };

interface NavItem {
  id: string;
  title: string;
  group: string;
}

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function SettingsPage() {
  const { robot, setRobot, robots } = useRobot();
  const can = useCan();
  const location = useLocation();
  const pane = useRef<HTMLDivElement>(null);
  const [nav, setNav] = useState<NavItem[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});

  // The company's names for its robots, where registered in Fleet.
  useEffect(() => {
    const ctl = new AbortController();
    getFleet(ctl.signal)
      .then((f) => setNames(Object.fromEntries(f.robots.map((r) => [r.slot, r.name]))))
      .catch(() => undefined);
    return () => ctl.abort();
  }, []);

  // The menu is read off the page: every [data-nav] card, in order, under its group.
  useEffect(() => {
    const el = pane.current;
    if (!el) return;
    const build = () => {
      const items = [...el.querySelectorAll<HTMLElement>("[data-nav]")].map((s) => {
        const group = s.closest<HTMLElement>("[data-group]")?.dataset.group ?? "";
        if (!s.id) s.id = `${group}-${slug(s.dataset.nav ?? "")}`;
        return { id: s.id, title: s.dataset.nav ?? "", group };
      });
      setNav((prev) => (JSON.stringify(prev) === JSON.stringify(items) ? prev : items));
    };
    build();
    const mo = new MutationObserver(build);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);

  // Which block is on screen: the last one whose top has passed the top of the pane.
  const onScroll = useCallback(() => {
    const el = pane.current;
    if (!el) return;
    let cur: string | null = null;
    for (const item of nav) {
      const s = document.getElementById(item.id);
      if (s && s.offsetTop - el.scrollTop < 140) cur = item.id;
    }
    setActive(cur ?? nav[0]?.id ?? null);
  }, [nav]);
  useEffect(onScroll, [onScroll]);

  // /settings#video (where the old /video link lands) opens on that group.
  useEffect(() => {
    const id = location.hash.slice(1);
    if (id && nav.length) document.getElementById(id)?.scrollIntoView();
  }, [location.hash, nav.length]);

  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const robotName = names[robot] ?? robots.find((r) => r.id === robot)?.label ?? robot;
  const groups = [
    { id: "robot", title: "Robot" },
    { id: "video", title: "Video" },
  ];

  return (
    <main className="grid lg:h-[calc(100dvh-57px)] lg:grid-cols-[264px_minmax(0,1fr)] lg:overflow-hidden">
      <nav className="min-w-0 border-b border-line bg-panel p-4 lg:overflow-x-hidden lg:overflow-y-auto lg:border-r lg:border-b-0">
        <h4 className="m-0 mb-2 px-2 text-[11px] font-extrabold tracking-wider text-dim uppercase">Configuring</h4>
        <div className="mb-4 grid min-w-0 gap-1">
          {robots.map((r) => {
            const Icon = ICON[r.id] ?? IconRobot;
            return (
              <button key={r.id} type="button" onClick={() => setRobot(r.id)} aria-pressed={r.id === robot}
                className={`flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${
                  r.id === robot ? "border-accent/40 bg-good-bg" : "border-transparent hover:bg-subtle"}`}>
                <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${r.id === robot ? "bg-panel text-good-fg" : "bg-subtle text-muted"}`}>
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  {/* Two lines, not an ellipsis: "Unitree Go2 (quadruped robot dog)" must read whole. */}
                  <span className="line-clamp-2 text-[13px] leading-snug font-bold">{names[r.id] ?? r.label}</span>
                  {names[r.id] && <span className="line-clamp-2 text-[11.5px] leading-snug text-muted">{r.label}</span>}
                </span>
              </button>
            );
          })}
        </div>
        {groups.map((g) => (
          <div key={g.id} className="mb-3">
            <h4 className="m-0 mb-1 px-2 text-[11px] font-extrabold tracking-wider text-dim uppercase">{g.title}</h4>
            {nav.filter((n) => n.group === g.id).map((n) => (
              <button key={n.id} type="button" onClick={() => go(n.id)}
                className={`block w-full cursor-pointer truncate rounded-lg px-2.5 py-1.5 text-left text-[13px] font-semibold transition ${
                  active === n.id ? "bg-good-bg text-good-fg" : "text-muted hover:bg-subtle hover:text-fg"}`}>
                {n.title}
              </button>
            ))}
          </div>
        ))}
        {can("manage_users") && (
          <>
            <h4 className="m-0 mb-1 px-2 text-[11px] font-extrabold tracking-wider text-dim uppercase">Workspace</h4>
            <Link to="/team" className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-muted hover:bg-subtle hover:text-fg">
              <IconUsers size={15} />Team &amp; roles
            </Link>
          </>
        )}
      </nav>

      <div ref={pane} onScroll={onScroll} className="relative min-w-0 lg:overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-7 lg:px-8">
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.025em]">Settings</h1>
          <p className="m-0 mt-1 mb-6 text-muted">
            Everything configured on <b className="text-fg">{robotName}</b>, and its live video.
          </p>
          <div id="robot" data-group="robot" className="scroll-mt-4">
            <RobotSettings />
          </div>
          <h2 className="m-0 mt-10 mb-4 text-lg font-extrabold">Video</h2>
          <div id="video" data-group="video" className="scroll-mt-4">
            <VideoSettings />
          </div>
        </div>
      </div>
    </main>
  );
}

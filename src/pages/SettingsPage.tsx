import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  IconActivity,
  IconAdjustments,
  IconApps,
  IconBone,
  IconCamera,
  IconChartLine,
  IconDatabase,
  IconGitBranch,
  IconInfoCircle,
  IconKey,
  IconPlugConnected,
  IconPoint,
  IconRobot,
  IconRocket,
  IconServer2,
  IconShieldCheck,
  IconUserCircle,
  IconUsers,
  IconVideo,
} from "@tabler/icons-react";
import { getFleet } from "../api/fleet";
import { useCan } from "../auth/permissions";
import { useRobot } from "../components/layout/RobotContext";
import { ActivitySettings } from "../components/settings/ActivitySettings";
import { SsoSettings } from "../components/settings/SsoSettings";
import { BackupSettings } from "../components/settings/BackupSettings";
import { ProfileSettings } from "../components/settings/ProfileSettings";
import { RobotSettings } from "../components/settings/RobotSettings";
import { TeamSettings } from "../components/settings/TeamSettings";
import { VideoSettings } from "../components/settings/VideoSettings";
import { rich } from "../i18n/rich";
import { useT } from "../i18n";

// Settings — everything in one place, by who it is about: your account (Profile for everyone;
// the team and the activity log for admins), then the robot (connection, camera, telemetry,
// safety, installed services) and its live video for those who configure. A menu on the left
// lists the blocks and follows the scroll; each block is marked `data-nav` in its own
// component, so the menu never keeps a copy of their titles. Those titles are identifiers
// (the menu's icons and the section ids are keyed on them) and stay in English; each is
// marked msg() where it is written and translated here, where the menu shows it.

const ICON: Record<string, typeof IconRobot> = { go2: IconBone, g1: IconRobot };

// The menu's glyph per block title; a block without one gets a dot.
const NAV_ICON: Record<string, typeof IconRobot> = {
  "Profile": IconUserCircle,
  "Team & roles": IconUsers,
  "Activity": IconActivity,
  "Single sign-on": IconKey,
  "Backups": IconDatabase,
  "About these values": IconInfoCircle,
  "Which code runs where": IconGitBranch,
  "Connection": IconPlugConnected,
  "Camera stream": IconCamera,
  "Robot video": IconVideo,
  "Telemetry": IconChartLine,
  "Safety envelope": IconShieldCheck,
  "Installed software": IconServer2,
  "Video tuning": IconAdjustments,
  "First-time setup": IconRocket,
  "Services": IconServer2,
  "This app": IconApps,
};

interface NavItem {
  id: string;
  title: string;
  group: string;
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function SettingsPage() {
  const t = useT();
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
  const mayConfigure = can("configure");
  const navLink = (n: NavItem) => {
    const Icon = NAV_ICON[n.title] ?? IconPoint;
    return (
      <button key={n.id} type="button" onClick={() => go(n.id)}
        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[13px] font-bold transition ${
          active === n.id ? "bg-good-bg text-good-fg" : "text-muted hover:bg-subtle hover:text-fg"}`}>
        <Icon size={17} className="shrink-0" />
        <span className="truncate">{t(n.title)}</span>
      </button>
    );
  };
  const heading = (text: string) => (
    <h4 className="m-0 mt-4 mb-1.5 px-2.5 text-[11px] font-extrabold tracking-[.1em] text-dim uppercase first:mt-0">{text}</h4>
  );

  return (
    <main className="grid lg:h-full lg:grid-cols-[270px_minmax(0,1fr)] lg:overflow-hidden">
      <nav className="min-w-0 border-b border-line bg-panel px-3.5 py-5 lg:overflow-x-hidden lg:overflow-y-auto lg:border-r lg:border-b-0">
        {heading(t("Account"))}
        {nav.filter((n) => n.group === "account").map(navLink)}
        {mayConfigure && (
          <>
            {heading(t("Robot"))}
            <div className="mb-1.5 grid min-w-0 gap-1">
              {robots.map((r) => {
                const Icon = ICON[r.id] ?? IconRobot;
                return (
                  <button key={r.id} type="button" onClick={() => setRobot(r.id)} aria-pressed={r.id === robot}
                    className={`flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition ${
                      r.id === robot ? "border-line bg-panel shadow-card" : "border-transparent hover:bg-subtle"}`}>
                    <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${r.id === robot ? "bg-good-bg text-good-fg" : "bg-subtle text-muted"}`}>
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      {/* Two lines, not an ellipsis: "Unitree Go2 (quadruped robot dog)" must read whole. */}
                      <span className="line-clamp-2 text-[13px] leading-snug font-bold">{names[r.id] ?? r.label}</span>
                      <span className="line-clamp-2 text-[11.5px] leading-snug text-dim">
                        {r.id === robot ? t("Configuring this robot") : names[r.id] ? r.label : t("Switch to this robot")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            {nav.filter((n) => n.group === "robot").map(navLink)}
            {heading(t("Video"))}
            {nav.filter((n) => n.group === "video").map(navLink)}
          </>
        )}
      </nav>

      <div ref={pane} onScroll={onScroll} className="relative min-w-0 lg:overflow-y-auto">
        <div className="mx-auto grid max-w-4xl gap-8 px-4 py-7 lg:px-8">
          <div data-group="account" className="grid gap-8">
            <ProfileSettings />
            {can("manage_users") && <TeamSettings />}
            {mayConfigure && <ActivitySettings />}
            {can("manage_org") && <SsoSettings />}
            {can("manage_org") && <BackupSettings />}
          </div>
          {mayConfigure && (
            <>
              <div id="robot" data-group="robot" className="scroll-mt-4">
                <h2 className="m-0 mb-1 text-lg font-extrabold tracking-[-0.015em]">{t("Robot")}</h2>
                <p className="m-0 mb-3.5 text-[13px] text-muted">
                  {rich(t("Everything configured on {robot}."), { robot: <b className="text-fg">{robotName}</b> })}
                </p>
                <RobotSettings />
              </div>
              <div id="video" data-group="video" className="scroll-mt-4">
                <h2 className="m-0 mb-1 text-lg font-extrabold tracking-[-0.015em]">{t("Video")}</h2>
                <p className="m-0 mb-3.5 text-[13px] text-muted">{t("How the live picture reaches this browser.")}</p>
                <VideoSettings />
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

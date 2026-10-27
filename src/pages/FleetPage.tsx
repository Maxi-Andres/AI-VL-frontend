import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  IconBuildingWarehouse,
  IconCheck,
  IconClock,
  IconMapPin,
  IconMapPinPlus,
  IconPencil,
  IconPlus,
  IconRobot,
  IconSteeringWheel,
  IconUserPlus,
  IconUsers,
  IconVideo,
} from "@tabler/icons-react";
import { getActivity, getFleet, planUrl } from "../api/fleet";
import type { ActivityEvent, Fleet, FleetRobot, Site } from "../api/fleet";
import { AuthError } from "../api/auth";
import { getOnline, getTeam } from "../api/team";
import type { Online, Team } from "../api/team";
import { useMe } from "../auth/AuthContext";
import { useCan } from "../auth/permissions";
import { usePresence } from "../hooks/usePresence";
import { useRobotTransports, type TransportMap } from "../hooks/useRobotTransports";
import { robotState } from "../components/layout/PresencePills";
import { useRobot } from "../components/layout/RobotContext";
import { BACKEND_URL } from "../config";
import { Avatar } from "../components/ui/Avatar";
import { ActivityRow, ago, span } from "../components/fleet/ActivityFeed";
import { RobotIcon } from "../components/fleet/RobotIcon";
import { TINT } from "../components/ui/tones";
import { PILL, systemRows } from "../components/layout/systemRows";
import { SiteMap } from "../components/fleet/SiteMap";
import {
  ActionButton,
  Banner,
  MODEL_ICON,
  RobotDialog,
  SiteDialog,
  errorText,
} from "../components/fleet/FleetDialogs";
import type { Presence } from "../types";
import { Segmented } from "../components/ui/Segmented";

// Fleet — home. The company at a glance: how many robots answer, its sites, its people, the
// live video; every robot as a card (with its live picture when it is the one streaming);
// each site's floor plan or map; and what changed lately. The "Clarity" mockup, on real data.
// Admins also build it here. Theme tokens only, so it reads right in light and dark.

// How commands reach a robot, in words: the agent on the robot, or DDS on the same network.
const LINK: Record<string, string> = { relay: "Relay", dds: "LAN" };
const KIND: Record<string, string> = { go2: "Quadruped", g1: "Humanoid" };

function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? "morning" : h < 19 ? "afternoon" : "evening";
  return `Good ${part}, ${name.split(" ")[0]}`;
}

function siteTime(tz: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(now);
  } catch {
    return "";
  }
}

/** Is this robot the one the camera bridge is streaming right now? Same rule as the pills. */
function streaming(p: Presence | null, slot: string, net: TransportMap | null): boolean {
  if (!p?.robot_cam.live) return false;
  const cam = p.robot_cam.robot;
  return cam === slot || (cam === "stream" && net?.[slot]?.mode === "relay");
}

export function FleetPage() {
  const me = useMe();
  const can = useCan();
  const mayConfigure = can("configure");
  const mayManage = can("manage_users");
  const { presence } = usePresence();
  const net = useRobotTransports();
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [people, setPeople] = useState<Online | null>(null);
  const [activity, setActivity] = useState<ActivityEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [siteIdx, setSiteIdx] = useState(0);
  const [editingSite, setEditingSite] = useState<Site | "new" | null>(null);
  const [editingRobot, setEditingRobot] = useState<{ robot: FleetRobot | null; siteId: string | null } | null>(null);
  const [planVersion, setPlanVersion] = useState(() => Date.now());
  const [now, setNow] = useState(() => new Date());

  // Each block loads on its own: a failing one (an older server without a route, a timeout)
  // leaves the others on screen.
  const load = useCallback(async (signal?: AbortSignal) => {
    if (mayManage) getTeam(signal).then(setTeam).catch(() => undefined);
    getOnline(signal).then(setPeople).catch(() => undefined);
    if (mayConfigure) getActivity(signal).then((p) => setActivity(p.events)).catch(() => undefined);
    try {
      setFleet(await getFleet(signal));
    } catch (e) {
      if (signal?.aborted) return;
      setFleet({ sites: [], robots: [], slots: [], satellite: null });
      // 404 here means the server predates Fleet: it was updated but not restarted.
      setError(e instanceof AuthError && e.status === 404
        ? "This server is running an older version of Pilot. Restart it to finish the update."
        : `Could not load the fleet: ${errorText(e)}`);
    }
  }, [mayManage, mayConfigure]);

  useEffect(() => {
    const ctl = new AbortController();
    void load(ctl.signal);
    // The clock on the site card, and the robots' last known state the server keeps.
    const tick = window.setInterval(() => {
      setNow(new Date());
      void load(ctl.signal);
    }, 30_000);
    return () => {
      ctl.abort();
      window.clearInterval(tick);
    };
  }, [load]);

  const robots = useMemo(() => fleet?.robots ?? [], [fleet]);
  const sites = useMemo(() => fleet?.sites ?? [], [fleet]);
  const siteName = useMemo(() => Object.fromEntries(sites.map((s) => [s.id, s.name])), [sites]);
  const online = robots.filter((r) => presence && robotState(presence, r.slot, net).tone === "good").length;
  const site = sites[Math.min(siteIdx, Math.max(0, sites.length - 1))] ?? null;
  const cam = presence?.robot_cam;
  const here = people?.online ?? [];
  const withPlan = sites.filter((s) => s.has_plan).length;

  const steps: { done: boolean; label: string; hint: string; go?: () => void; href?: string }[] =
    fleet && mayConfigure ? [
      { done: sites.length > 0, label: "Add your first site", hint: "Where your robots work: a name, its location and a floor plan.", go: () => setEditingSite("new") },
      { done: robots.length > 0, label: "Register your robots", hint: "Give each robot a name and the site it works at.", go: () => setEditingRobot({ robot: null, siteId: sites[0]?.id ?? null }) },
      ...(team ? [{ done: team.members.length + team.invitations.length > 1, label: "Invite your team", hint: "Operators drive, viewers watch — each with their own account.", href: "/settings#team" }] : []),
    ] : [];
  const onboarding = steps.some((s) => !s.done);

  const changed = async (did: boolean) => {
    if (!did) return;
    setPlanVersion(Date.now());
    await load();
  };

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-7 lg:px-8">
      {/* Greeting */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="animate-rise">
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.025em]">{greeting(me.user.name)}</h1>
          <p className="m-0 mt-1 text-muted">
            {fleet
              ? robots.length
                ? `${online} of ${robots.length} robot${robots.length === 1 ? "" : "s"} online${sites.length ? ` · ${sites.map((s) => s.name).join(", ")}` : ""}`
                : `${me.org.name} — let's get your fleet set up.`
              : " "}
          </p>
        </div>
        {/* The people and the two things to do next, grouped in one card (the mockup). Adding a
            robot is not here: the tile in the robot grid does that, once is enough. */}
        <div className="ml-auto flex animate-rise flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel p-1.5 shadow-card">
          {here.length > 0 && (
            <div className="flex items-center gap-2 px-2 text-[13px] font-semibold text-muted"
              title={here.map((m) => m.name).join(", ")}>
              <div className="flex">
                {here.slice(0, 4).map((m, i) => (
                  <span key={m.id} style={{ zIndex: 10 - i }} className="-ml-2 rounded-full border-2 border-panel first:ml-0">
                    <Avatar id={m.id} name={m.name} color={m.color} size={28} />
                  </span>
                ))}
              </div>
              {here.length === 1 && here[0].id === me.user.id ? "Only you online" : `${here.length} online`}
            </div>
          )}
          {mayManage && (
            <Link to="/settings#team" className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3.5 py-2 text-[13px] font-bold transition hover:border-dim hover:bg-subtle">
              <IconUserPlus size={16} />Invite
            </Link>
          )}
          <Link to="/live" className="flex items-center gap-2 rounded-xl bg-fg px-3.5 py-2 text-[13px] font-bold text-bg transition hover:-translate-y-px hover:shadow-lift">
            <IconVideo size={16} />Go live
          </Link>
        </div>
      </div>

      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}

      {/* KPIs */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi delay={0} icon={<IconRobot size={17} />} tint="good" label="Robots online"
          value={fleet ? online : "—"} unit={robots.length ? `of ${robots.length}` : undefined}
          fill={robots.length ? online / robots.length : 0} />
        <Kpi delay={60} icon={<IconBuildingWarehouse size={17} />} tint="info" label="Sites"
          value={fleet ? sites.length : "—"} unit={sites.length ? `${withPlan} with a floor plan` : undefined}
          fill={sites.length ? withPlan / sites.length : 0} />
        {/* Who has Pilot open, out of the whole team: a full bar is everyone here. */}
        <Kpi delay={120} icon={<IconUsers size={17} />} tint="warn" label="Team online"
          value={people ? here.length : "—"}
          unit={people ? `of ${people.members}${team?.invitations.length ? ` · +${team.invitations.length} invited` : ""}` : undefined}
          fill={people?.members ? here.length / people.members : 0} />
        <Kpi delay={180} icon={<IconVideo size={17} />} tint="bad" label="Live video"
          value={cam?.live ? `${cam.fps ? Math.round(cam.fps) : "—"}` : "Off"} unit={cam?.live ? "fps" : undefined}
          fill={cam?.live && cam.fps ? Math.min(1, cam.fps / 15) : 0} />
      </div>

      {onboarding && (
        <section className="mb-4 animate-rise rounded-2xl border border-line bg-panel p-5 shadow-card">
          <h2 className="m-0 text-[15px] font-extrabold">Get {me.org.name} ready</h2>
          <p className="m-0 mt-0.5 mb-4 text-[13px] text-muted">A few steps and your team can start operating.</p>
          <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.label} className={`rounded-xl border p-3.5 ${s.done ? "border-accent/30 bg-good-bg" : "border-line bg-bg"}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`grid size-6 place-items-center rounded-full text-xs font-extrabold ${s.done ? "bg-accent text-on-accent" : "bg-panel text-muted shadow-card"}`}>
                    {s.done ? <IconCheck size={14} stroke={3} /> : i + 1}
                  </span>
                  <span className={`text-[13.5px] font-bold ${s.done ? "text-muted line-through" : ""}`}>{s.label}</span>
                </div>
                <p className="m-0 mt-2 text-xs text-muted">{s.hint}</p>
                {!s.done && (s.href
                  ? <Link to={s.href} className="mt-3 inline-block text-xs font-bold text-accent hover:underline">Open Team</Link>
                  : <button onClick={s.go} className="mt-3 cursor-pointer text-xs font-bold text-accent hover:underline">Start</button>)}
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[1.45fr_1fr]">
        {/* Robots and the site side by side (similar heights); the site card stays in view
            while a long robot list scrolls. */}
          {/* Robots */}
          <section className="animate-rise rounded-2xl border border-line bg-panel shadow-card [animation-delay:120ms]">
            <header className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
              <h2 className="m-0 text-[15px] font-extrabold">Robots</h2>
              {robots.length > 0 && (
                <span className="flex items-center gap-1.5 rounded-full bg-good-bg px-2.5 py-0.5 text-xs font-bold text-good-fg">
                  <span className="size-1.5 rounded-full bg-current" />{online} online
                </span>
              )}
            </header>
            {robots.length ? (
              // Columns follow the count, so one or two robots fill the row instead of sitting in
              // a corner of an empty box; admins get a tile to add the next one.
              <div className={`grid gap-3.5 p-4 sm:grid-cols-2 ${robots.length + (mayConfigure ? 1 : 0) >= 3 ? "2xl:grid-cols-3" : ""}`}>
                {robots.map((r) => (
                  <RobotCard key={r.id} robot={r} site={r.site_id ? siteName[r.site_id] : null}
                    presence={presence} net={net} editable={mayConfigure}
                    onEdit={() => setEditingRobot({ robot: r, siteId: r.site_id })} />
                ))}
                {mayConfigure && (
                  <button onClick={() => setEditingRobot({ robot: null, siteId: site?.id ?? null })}
                    className="group grid min-h-[200px] cursor-pointer place-items-center rounded-xl border-2 border-dashed border-line p-6 text-center transition hover:border-accent hover:bg-good-bg">
                    <span>
                      <span className="mx-auto mb-3 grid size-11 place-items-center rounded-2xl bg-subtle text-muted transition group-hover:bg-accent group-hover:text-on-accent">
                        <IconPlus size={22} />
                      </span>
                      <b className="block text-sm">Add a robot</b>
                      <span className="mt-1 block text-[13px] text-muted">A Go2 or a G1 — it shows up here, live.</span>
                    </span>
                  </button>
                )}
              </div>
            ) : (
              <Empty icon={<IconRobot size={26} />} title="No robots yet"
                text={mayConfigure ? "Register your Go2 or G1 to see it here, live." : `An admin of ${me.org.name} registers the robots.`}
                action={mayConfigure ? { label: "Register a robot", go: () => setEditingRobot({ robot: null, siteId: site?.id ?? null }) } : undefined} />
            )}
          </section>

          {/* Site */}
          <section className="animate-rise overflow-hidden rounded-2xl border border-line bg-panel shadow-card [animation-delay:180ms] xl:sticky xl:top-[72px]">
            <header className="flex flex-wrap items-center gap-2.5 border-b border-line px-5 py-3">
              <h2 className="m-0 text-[15px] font-extrabold">{site ? site.name : "Sites"}</h2>
              {site && (
                <span className="flex items-center gap-1 text-xs text-muted" title={site.timezone}>
                  <IconClock size={13} />{siteTime(site.timezone, now)}
                </span>
              )}
              <div className="ml-auto flex items-center gap-1">
                {sites.length > 1 && (
                  <Segmented className="mr-1 flex rounded-lg bg-subtle p-0.5">
                    {sites.map((s, i) => (
                      <button key={s.id} onClick={() => setSiteIdx(i)} data-on={s.id === site?.id}
                        className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${s.id === site?.id ? "text-fg" : "text-muted hover:text-fg"}`}>
                        {s.name}
                      </button>
                    ))}
                  </Segmented>
                )}
                {mayConfigure && site && (
                  <IconButton title="Edit site" onClick={() => setEditingSite(site)}><IconPencil size={16} /></IconButton>
                )}
                {mayConfigure && (
                  <IconButton title="Add a site" onClick={() => setEditingSite("new")}><IconMapPinPlus size={16} /></IconButton>
                )}
              </div>
            </header>
            {site ? (
              <>
                <div className="relative h-[300px] bg-bg">
                  {site.has_plan ? (
                    <img src={planUrl(site, planVersion)} alt={`Floor plan of ${site.name}`} className="absolute inset-0 size-full object-contain p-3" />
                  ) : site.lat !== null && site.lon !== null ? (
                    <SiteMap lat={site.lat} lon={site.lon} satellite={fleet?.satellite} className="absolute inset-0" />
                  ) : (
                    <Empty fill icon={<IconMapPin size={24} />} title="No map yet"
                      text={mayConfigure ? "Add the floor plan or the location." : "An admin can add the floor plan."}
                      action={mayConfigure ? { label: "Edit site", go: () => setEditingSite(site) } : undefined} />
                  )}
                </div>
                {site.address && <div className="border-t border-line px-5 py-2.5 text-xs text-muted">{site.address}</div>}
              </>
            ) : (
              <Empty icon={<IconBuildingWarehouse size={26} />} title="No sites yet"
                text={mayConfigure ? "A warehouse, a plant, a lab — where your robots work." : "An admin adds the company's sites."}
                action={mayConfigure ? { label: "Add a site", go: () => setEditingSite("new") } : undefined} />
            )}
          </section>

      </div>

      {/* The system under the robots, the latest changes under the site — same proportions as
          the row above, so the page reads as two clean columns. */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <SystemPanel presence={presence} wide={!activity} />
        {activity && (
          <section className="animate-rise rounded-2xl border border-line bg-panel shadow-card [animation-delay:300ms]">
            <header className="flex items-center gap-2.5 border-b border-line px-5 py-3">
              <h2 className="m-0 text-[15px] font-extrabold">Activity</h2>
              <Link to="/settings#activity"
                className="ml-auto rounded-[10px] border border-line px-3 py-1.5 text-[13px] font-bold transition hover:bg-subtle">
                View all
              </Link>
            </header>
            {activity.length ? (
              <ul className="m-0 list-none px-5 py-1">
                {activity.slice(0, 5).map((ev, i) => <ActivityRow key={`${ev.at}-${i}`} ev={ev} />)}
              </ul>
            ) : (
              <p className="m-0 px-5 py-6 text-center text-sm text-muted">Nothing yet.</p>
            )}
          </section>
        )}
      </div>

      {editingSite && fleet && (
        <SiteDialog
          site={editingSite === "new" ? null : editingSite}
          robotsHere={editingSite === "new" ? 0 : robots.filter((r) => r.site_id === editingSite.id).length}
          satellite={fleet.satellite ?? null}
          onClose={async (did) => {
            setEditingSite(null);
            await changed(did);
          }}
        />
      )}
      {editingRobot && fleet && (
        <RobotDialog
          robot={editingRobot.robot}
          siteId={editingRobot.siteId}
          fleet={fleet}
          onClose={async (did) => {
            setEditingRobot(null);
            await changed(did);
          }}
        />
      )}
    </main>
  );
}


function Kpi({ icon, tint, label, value, unit, fill, delay }: {
  icon: ReactNode; tint: keyof typeof TINT; label: string; value: ReactNode; unit?: string; fill?: number; delay: number;
}) {
  return (
    <div className="animate-rise rounded-2xl border border-line bg-panel px-5 py-4 shadow-card" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2 text-[12.5px] font-bold text-muted">
        <span className={`grid size-7 place-items-center rounded-lg ${TINT[tint]}`}>{icon}</span>
        {label}
      </div>
      <div className="mt-2.5 flex items-baseline gap-2">
        <span className="text-[30px] leading-none font-extrabold tracking-[-0.03em]">{value}</span>
        {unit && <span className="text-[13px] font-semibold text-muted">{unit}</span>}
      </div>
      {fill !== undefined && (
        <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-subtle">
          <div className="h-full rounded-full bg-gradient-to-r from-[#2fc1b1] via-[#54bbb0] to-[#d8cf3c] transition-[width] duration-1000 ease-out"
            style={{ width: `${Math.round(Math.max(0, Math.min(1, fill)) * 100)}%` }} />
        </div>
      )}
    </div>
  );
}

/** The services behind the robots (systemRows), as tiles. All of it from /api/presence. */
function SystemPanel({ presence, wide }: { presence: Presence | null; wide: boolean }) {
  const p = presence;
  const rows = p ? systemRows(p) : [];
  const issues = rows.filter((r) => r.tone === "bad" || r.tone === "warn").length;

  return (
    <section className={`animate-rise rounded-2xl border border-line bg-panel shadow-card [animation-delay:240ms] ${wide ? "xl:col-span-2" : ""}`}>
      <header className="flex items-center gap-2.5 border-b border-line px-5 py-3.5">
        <h2 className="m-0 text-[15px] font-extrabold">System</h2>
        {p && (
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold ${PILL[issues ? "warn" : "good"]}`}>
            <span className="size-1.5 rounded-full bg-current" />
            {issues ? `${issues} need${issues === 1 ? "s" : ""} attention` : "All systems normal"}
          </span>
        )}
      </header>
      {p ? (
        <div className={`grid gap-3 p-4 sm:grid-cols-2 ${wide ? "xl:grid-cols-4" : ""}`}>
          {rows.map((r) => (
            <div key={r.key} className="rounded-xl border border-line bg-bg p-4">
              <div className="flex items-center gap-2.5">
                <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${PILL[r.tone]}`}><r.icon size={18} /></span>
                <b className="min-w-0 truncate text-[14px]">{r.label}</b>
                <span className={`ml-auto flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-bold ${PILL[r.tone]}`}>
                  <span className={`size-1.5 rounded-full bg-current ${r.tone === "good" ? "animate-pulse" : ""}`} />{r.state}
                </span>
              </div>
              <p className="m-0 mt-2.5 text-[12.5px] text-muted">{r.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="m-0 px-5 py-6 text-center text-sm text-muted">Checking…</p>
      )}
    </section>
  );
}

function RobotCard({ robot, site, presence, net, editable, onEdit }: {
  robot: FleetRobot; site: string | null; presence: Presence | null; net: TransportMap | null;
  editable: boolean; onEdit: () => void;
}) {
  const { setRobot } = useRobot();
  const can = useCan();
  const navigate = useNavigate();
  const state = presence ? robotState(presence, robot.slot, net) : null;
  const live = streaming(presence, robot.slot, net);
  const battery = net?.[robot.slot]?.relay?.battery;
  const Icon = MODEL_ICON[robot.slot] ?? IconRobot;
  // The live picture, refreshed while this robot is the one streaming.
  const [frame, setFrame] = useState(0);
  const [frameOk, setFrameOk] = useState(true);
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setFrame((n) => n + 1), 2500);
    return () => window.clearInterval(t);
  }, [live]);
  const open = (path: string) => {
    setRobot(robot.slot);
    navigate(path);
  };
  // What is measured now wins; when now has nothing to say (no probe yet, the page just
  // opened), the state the server last recorded speaks — it is kept with nobody watching.
  const st = robot.status;
  const tone = state && state.tone !== "idle" ? state.tone : st.online === true ? "good" : st.online === false ? "bad" : "idle";
  const badge = { good: "text-good-fg", warn: "text-warn-fg", bad: "text-bad-fg", idle: "text-muted" }[tone];
  const offline = tone === "bad";
  const label = offline
    ? `Offline${st.online === false && st.since ? ` · ${span(st.since)}` : ""}`
    : tone === "good" ? "Online" : state?.text && state.text !== "unknown" ? state.text : "Not measured";
  const freshBattery = typeof battery?.percent === "number" && !battery.stale ? battery.percent : null;
  const lastBattery = freshBattery ?? st.battery_pct;

  return (
    <article className="group overflow-hidden rounded-xl border border-line bg-panel transition duration-200 hover:-translate-y-0.5 hover:border-dim hover:shadow-lift">
      <button onClick={() => open("/live")} aria-label={`Open ${robot.name} live`}
        className={`relative block h-[120px] w-full cursor-pointer overflow-hidden bg-gradient-to-br from-[#123f3a] via-[#1b2a33] to-[#2a2a14] text-left transition ${offline ? "opacity-80 grayscale" : ""}`}>
        {live && frameOk ? (
          <img src={`${BACKEND_URL}/api/robot-frame?t=${frame}`} alt={`${robot.name}, live`} onError={() => setFrameOk(false)}
            className="absolute inset-0 size-full object-cover" />
        ) : (
          <Icon size={64} stroke={1.2} className="absolute right-4 bottom-2 text-white/15 transition duration-300 group-hover:scale-105" />
        )}
        <span className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/50" />
        <span className={`absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-panel px-2.5 py-0.5 text-[11.5px] font-bold shadow-card ${badge}`} title={state?.title}>
          <span className={`size-1.5 rounded-full bg-current ${tone === "good" ? "animate-pulse" : ""}`} />
          {label}
        </span>
        {live && (
          <span className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 text-[11.5px] font-bold text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-[#ff5a5f]" />LIVE
          </span>
        )}
      </button>
      <div className="p-3.5">
        <div className="flex items-center gap-2">
          <RobotIcon slot={robot.slot} color={robot.color} id={robot.id} size={26} />
          <b className="min-w-0 truncate text-[14.5px]">{robot.name}</b>
          <span className="ml-auto shrink-0 text-xs text-dim" title={robot.model}>{KIND[robot.slot] ?? robot.model}</span>
          {/* Always visible: an edit that only shows on hover is one nobody finds. */}
          {editable && (
            <button onClick={onEdit} title="Edit name, model, serial and site" aria-label={`Edit ${robot.name}`}
              className="-mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition hover:bg-good-bg hover:text-good-fg">
              <IconPencil size={16} />
            </button>
          )}
        </div>
        <div className="mt-0.5 truncate text-[12.5px] text-muted">
          {[robot.model.replace(/^Unitree /, ""), site, st.link ? LINK[st.link] ?? st.link : null].filter(Boolean).join(" · ")}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-dashed border-line pt-3">
          <Stat label="Battery" value={lastBattery !== null ? `${Math.round(lastBattery)}%` : "—"}
            dim={freshBattery === null && lastBattery !== null}
            title={freshBattery === null && st.battery_at ? `Last reading, ${ago(st.battery_at)}` : undefined} />
          <Stat label="Latency" mono value={!offline && st.latency_ms !== null ? `${Math.max(1, Math.round(st.latency_ms))} ms` : "—"}
            title="Round trip from this server to the robot" />
          <Stat label="Seen" value={tone === "good" ? "Now" : st.last_seen_at ? ago(st.last_seen_at) : "Never"}
            title={st.last_seen_at ? new Date(st.last_seen_at).toLocaleString() : undefined} />
        </div>
        <div className="mt-3 flex gap-2">
          <SmallButton onClick={() => open("/live")}><IconVideo size={14} />Live</SmallButton>
          {can("operate") && <SmallButton onClick={() => open("/drive")}><IconSteeringWheel size={14} />Drive</SmallButton>}
        </div>
      </div>
    </article>
  );
}

function Stat({ label, value, dim, mono, title }: { label: string; value: string; dim?: boolean; mono?: boolean; title?: string }) {
  return (
    <div className="min-w-0 text-[11.5px] font-bold text-dim" title={title}>
      {label}
      <b className={`block truncate text-[13px] ${dim ? "text-muted" : "text-fg"} ${mono ? "font-mono" : ""}`}>{value}</b>
    </div>
  );
}

function SmallButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line py-1.5 text-xs font-bold transition hover:border-accent hover:bg-good-bg hover:text-good-fg">
      {children}
    </button>
  );
}

function IconButton({ children, title, onClick }: { children: ReactNode; title: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={title} aria-label={title}
      className="grid size-8 cursor-pointer place-items-center rounded-lg text-muted transition hover:bg-subtle hover:text-fg">
      {children}
    </button>
  );
}

function Empty({ icon, title, text, action, fill }: {
  icon: ReactNode; title: string; text: string; action?: { label: string; go: () => void };
  /** Fill a box of fixed height (the map area) instead of sizing to the content. */
  fill?: boolean;
}) {
  return (
    <div className={`grid place-items-center px-6 py-10 text-center ${fill ? "absolute inset-0" : ""}`}>
      <div>
        <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-subtle text-muted">{icon}</span>
        <div className="text-sm font-bold">{title}</div>
        <p className="m-0 mt-1 max-w-xs text-[13px] text-muted">{text}</p>
        {action && <div className="mt-4 flex justify-center"><ActionButton onClick={action.go}>{action.label}</ActionButton></div>}
      </div>
    </div>
  );
}

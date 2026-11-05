import { lazy, Suspense, useEffect, useState } from "react";
import {
  IconArrowBackUp,
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconEraser,
  IconRoute,
  IconRotate,
  IconRotateClockwise,
  IconWalk,
  IconX,
} from "@tabler/icons-react";
import { Button } from "../components/ui/Button";
import { NumberField } from "../components/ui/NumberField";
import { StatusText, type Status } from "../components/ui/StatusText";
import { StopButton } from "../components/ui/StopButton";
import { Switch } from "../components/ui/Switch";
import { useCan } from "../auth/permissions";
import {
  useCloudSource,
  useLidarSource,
  useOdomSource,
  type CloudSourceState,
  type LidarSourceState,
  type OdomSourceState,
} from "../hooks/useOdomSource";
import { useJointSource } from "../hooks/useJointSource";
import { clearTrail, fetchTrail, walkCancel, walkGoto, walkPlan, walkStatus, type WalkPlan } from "../api/walk";
import {
  deg,
  extendTrail,
  goalFrom,
  rad,
  walkLine,
  walkRunning,
  wrap,
  type Pose,
  type WalkStatus,
} from "../lib/odom";
import { msg, useT } from "../i18n";

// Lazy: three.js and the robot model are most of this page's weight (as on the Joints page).
const NavScene = lazy(() => import("../components/nav/NavScene").then((m) => ({ default: m.NavScene })));

/** Most one walk may cover, as the relay enforces it (relay_server.WALK_MAX_M). */
const MAX_M = 3;
const POLL_MS = 400;
/** A plan is for where the robot stood when it was made: moved this much, it is stale. */
const PLAN_STALE_M = 0.1;
const PLAN_STALE_RAD = rad(5);

const PRESETS = [
  { label: msg("1 m forward"), icon: IconArrowUp, dx: 1, dy: 0, dyaw: 0 },
  { label: msg("2 m forward"), icon: IconArrowUp, dx: 2, dy: 0, dyaw: 0 },
  { label: msg("50 cm back"), icon: IconArrowDown, dx: -0.5, dy: 0, dyaw: 0 },
  { label: msg("Turn 90° left"), icon: IconRotate, dx: 0, dy: 0, dyaw: 90 },
  { label: msg("Turn 90° right"), icon: IconRotateClockwise, dx: 0, dy: 0, dyaw: -90 },
  { label: msg("Turn around"), icon: IconArrowBackUp, dx: 0, dy: 0, dyaw: 180 },
] as const;

interface Proposal {
  plan: WalkPlan;
  dx: number;
  dy: number;
  turnDeg: number;
}

const pathLength = (path: [number, number][] | null) =>
  (path ?? []).reduce((m, p, k, a) => (k ? m + Math.hypot(p[0] - a[k - 1][0], p[1] - a[k - 1][1]) : 0), 0);

/**
 * Navigation — the G1 walks by itself to a point given relative to where it stands, seen in 3D
 * among what its lidar sees (G1.md §6.2, phase 7b, 2026-11-05).
 *
 * Asking for a walk first PLANS it: the robot works out the way round what its lidar sees and the
 * page draws it; nothing moves until the operator accepts. The walk then plans again as it goes
 * (people move). The loop runs ON THE ROBOT, so a closed tab cannot leave it walking, and any stop
 * or drive-pad move takes over. The trail is recorded on the robot too, whoever moves it.
 */
export function NavigationPage() {
  const t = useT();
  const can = useCan();
  const odom = useOdomSource();
  const lidar = useLidarSource();
  const cloud = useCloudSource();
  const joints = useJointSource("live");
  const [trail, setTrail] = useState<Pose[]>([]);
  const [walk, setWalk] = useState<WalkStatus | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [planning, setPlanning] = useState(false);
  const [problem, setProblem] = useState<Status | null>(null);
  const [showObstacles, setShowObstacles] = useState(false);
  const [dx, setDx] = useState(1);
  const [dy, setDy] = useState(0);
  const [turnDeg, setTurnDeg] = useState(0);

  const pose = odom.frame;
  const fresh = odom.link === "live" && !!pose;
  const seeing = lidar.link === "live" && !!lidar.frame?.odom;
  const running = walkRunning(walk);

  // The trail the robot recorded (whoever moved it, page open or not), then the live poses.
  useEffect(() => {
    const ctl = new AbortController();
    fetchTrail(ctl.signal)
      .then((pts) => setTrail((tr) => (pts.length ? pts.map(([x, y, yaw]) => ({ x, y, yaw })) : tr)))
      .catch(() => {});
    return () => ctl.abort();
  }, []);
  useEffect(() => {
    if (pose) setTrail((tr) => extendTrail(tr, pose));
  }, [pose]);

  // The last walk on load, then while one runs, how it is going.
  useEffect(() => {
    const ctl = new AbortController();
    walkStatus(ctl.signal).then((a) => a.walk && setWalk(a.walk)).catch(() => {});
    return () => ctl.abort();
  }, []);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      walkStatus().then((a) => a.walk && setWalk(a.walk)).catch(() => {});
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [running]);

  // A plan made from somewhere else is not this robot's way any more.
  const stale = !!proposal && !!pose && (
    Math.hypot(pose.x - proposal.plan.start.x, pose.y - proposal.plan.start.y) > PLAN_STALE_M
    || Math.abs(wrap(pose.yaw - proposal.plan.start.yaw)) > PLAN_STALE_RAD);
  useEffect(() => {
    if (stale) {
      setProposal(null);
      setProblem({ tone: "warn", text: t("The robot moved since the way was planned: plan it again.") });
    }
  }, [stale, t]);

  const blocked = !can("operate") || !fresh || running || planning;
  const tooFar = Math.hypot(dx, dy) > MAX_M || Math.abs(turnDeg) > 180;
  const nothing = Math.hypot(dx, dy) < 0.01 && Math.abs(turnDeg) < 1;
  const cannotWhy = !can("operate")
    ? t("Your role can watch the robot, not move it.")
    : !fresh
      ? t("Waiting for live odometry from the robot.")
      : running
        ? t("A walk is running: stop it first.")
        : tooFar
          ? t("At most {m} m and half a turn per walk.", { m: MAX_M })
          : nothing
            ? t("Nothing to do: set a distance or a turn.")
            : null;

  const plan = async (fx: number, fy: number, fdeg: number) => {
    setProblem(null);
    setProposal(null);
    setPlanning(true);
    try {
      const a = await walkPlan(fx, fy, rad(fdeg));
      if (a.ok && a.plan) setProposal({ plan: a.plan, dx: fx, dy: fy, turnDeg: fdeg });
      else setProblem({ tone: "error", text: a.error ?? t("The robot refused") });
    } catch (e) {
      setProblem({ tone: "error", text: String(e) });
    } finally {
      setPlanning(false);
    }
  };

  const accept = async () => {
    if (!proposal) return;
    const { dx: fx, dy: fy, turnDeg: fdeg } = proposal;
    setProposal(null);
    setProblem(null);
    try {
      const a = await walkGoto(fx, fy, rad(fdeg));
      if (a.walk) setWalk(a.walk);
      if (!a.ok) setProblem({ tone: "error", text: a.error ?? t("The robot refused") });
    } catch (e) {
      setProblem({ tone: "error", text: String(e) });
    }
  };

  const stop = async () => {
    try {
      const a = await walkCancel();
      if (a.walk) setWalk(a.walk);
    } catch (e) {
      setProblem({ tone: "error", text: String(e) });
    }
  };

  const onClearTrail = () => {
    setTrail(pose ? [pose] : []);
    clearTrail().catch(() => {});
  };

  const preview = pose && !running && !proposal && !nothing && !tooFar
    ? goalFrom(pose, dx, dy, rad(turnDeg)) : null;
  const goal = running ? walk?.goal ?? null : proposal?.plan.goal ?? null;
  const path = running ? walk?.path ?? null : proposal?.plan.path ?? null;
  const detour = !!proposal?.plan.path && proposal.plan.path.length > 2;

  return (
    <main className="grid gap-4 p-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <LinkBar odom={odom} />
          <LidarBar lidar={lidar} cloud={cloud} />
        </div>
        <div className="h-[60vh] min-h-0 lg:h-auto lg:flex-1">
          <Suspense fallback={<div className="h-full rounded-2xl border border-line bg-panel" />}>
            <NavScene pose={pose} trail={trail} goal={goal} preview={preview} path={path}
              cloud={cloud.frame} obstacles={showObstacles ? lidar.frame : null}
              joints={joints.link === "live" ? joints.frame : null} />
          </Suspense>
        </div>
      </div>
      <aside className="flex min-w-0 flex-col gap-4 overflow-y-auto rounded-2xl border border-line bg-panel p-4 shadow-card">
        <section className="grid gap-1">
          <h2 className="text-[13px] font-extrabold tracking-wide text-fg">{t("Where it is")}</h2>
          {pose ? (
            <div className="grid grid-cols-3 gap-2 text-center">
              <Reading label="x" value={`${pose.x.toFixed(2)} m`} />
              <Reading label="y" value={`${pose.y.toFixed(2)} m`} />
              <Reading label={t("heading")} value={`${deg(pose.yaw).toFixed(0)}°`} />
            </div>
          ) : (
            <p className="text-xs text-muted">{t("No pose yet.")}</p>
          )}
          <p className="text-[11.5px] text-muted">
            {t("The robot's own odometry: its origin is where it was switched on, not a place in the room.")}
          </p>
        </section>

        <section className="grid gap-3">
          <h2 className="flex items-center gap-1.5 text-[13px] font-extrabold tracking-wide text-fg">
            <IconWalk size={16} />{t("Walk to a point")}
          </h2>
          <div className="grid grid-cols-2 gap-1.5">
            {PRESETS.map(({ label, icon: Icon, dx: px, dy: py, dyaw }) => (
              <Button key={label} variant="secondary" disabled={blocked}
                onClick={() => plan(px, py, dyaw)}
                className="flex items-center justify-center gap-1.5 text-[12px]">
                <Icon size={15} />{t(label)}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 text-[11.5px] font-semibold text-muted">
            <label className="grid gap-1">{t("Forward, m")}
              <NumberField value={dx} step={0.1} onValueChange={setDx} className="w-full" />
            </label>
            <label className="grid gap-1">{t("Left, m")}
              <NumberField value={dy} step={0.1} onValueChange={setDy} className="w-full" />
            </label>
            <label className="grid gap-1">{t("Turn left, °")}
              <NumberField value={turnDeg} step={15} onValueChange={setTurnDeg} className="w-full" />
            </label>
          </div>
          <Button variant="secondary" disabled={cannotWhy !== null || planning} title={cannotWhy ?? undefined}
            onClick={() => plan(dx, dy, turnDeg)} className="flex items-center justify-center gap-2">
            <IconRoute size={16} />{planning ? t("Planning…") : t("Plan the walk")}
          </Button>
          {cannotWhy && !proposal && <p className="text-[11.5px] text-muted">{cannotWhy}</p>}

          {proposal && (
            <div className="grid gap-2 rounded-xl border border-accent/50 bg-sunken p-3">
              <p className="text-[12.5px] font-semibold text-fg">
                {proposal.plan.path && proposal.plan.path.length > 1
                  ? detour
                    ? t("The way goes round something: {m} m (the dashed line).", { m: pathLength(proposal.plan.path).toFixed(1) })
                    : t("A straight way: {m} m (the dashed line).", { m: pathLength(proposal.plan.path).toFixed(1) })
                  : t("A turn in place.")}
                {proposal.turnDeg ? ` ${t("Then it turns {d}°.", { d: proposal.turnDeg })}` : ""}
              </p>
              {proposal.plan.eyes === "none" && (
                <p className="text-[11.5px] font-semibold text-warn-fg">{t("Planned without the lidar: it would walk blind.")}</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={accept} disabled={!can("operate") || !fresh}
                  className="flex items-center justify-center gap-1.5">
                  <IconCheck size={16} />{t("Accept and walk")}
                </Button>
                <Button variant="secondary" onClick={() => setProposal(null)}
                  className="flex items-center justify-center gap-1.5">
                  <IconX size={16} />{t("Discard")}
                </Button>
              </div>
            </div>
          )}

          {running && <StopButton onClick={stop} title={t("Stop the walk")} />}
          <StatusText status={problem ?? walkLine(walk)} wrap className="text-[12.5px] font-semibold text-fg" />
        </section>

        <p className="rounded-xl bg-warn-bg p-3 text-[12px] font-semibold text-warn-fg">
          {seeing
            ? t("It plans its way round what the lidar sees (the dashed line), keeping 35 cm clear, and stops half a metre before anything that steps in front. It does not watch while turning in place. Keep the remote in hand.")
            : t("Without the lidar it does not walk: point the lidar at PC2 (tools/livox_set_host.py on the robot). Keep the remote in hand.")}
        </p>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3 text-[12.5px] font-semibold text-fg">
            {t("Show what the planner avoids")}
            <Switch on={showObstacles} onChange={setShowObstacles} label={t("Show what the planner avoids")} />
          </div>
          <Button variant="secondary" onClick={onClearTrail}
            className="flex items-center justify-center gap-1.5 self-start text-[12px]">
            <IconEraser size={15} />{t("Clear the trail")}
          </Button>
        </div>
      </aside>
    </main>
  );
}

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-sunken px-2 py-1.5">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-muted">{label}</div>
      <div className="text-[14px] font-extrabold tabular-nums text-fg">{value}</div>
    </div>
  );
}

function LidarBar({ lidar, cloud }: { lidar: LidarSourceState; cloud: CloudSourceState }) {
  const t = useT();
  const f = lidar.frame;
  const status: Status =
    lidar.link === "live" && f
      ? f.odom
        ? { tone: "ok", text: t("Lidar · {k}k points/s · floor {floor} m below · {n} points shown", {
            k: Math.round(f.ptsS / 1000), floor: Math.abs(f.floor).toFixed(2),
            n: cloud.frame ? cloud.frame.count : 0,
          }) }
        : { tone: "warn", text: t("Lidar without odometry: its map would not line up") }
      : lidar.link === "stale"
        ? { tone: "warn", text: t("No lidar points: is it pointed at PC2?") }
        : lidar.link === "error"
          ? { tone: "error", text: lidar.error ?? t("Connection to the backend closed") }
          : { tone: "busy", text: t("Connecting to the lidar…") };
  const tone = status.tone === "ok" ? "text-good-fg" : status.tone === "error" ? "text-bad-fg"
    : status.tone === "warn" ? "text-warn-fg" : "text-muted";
  return <StatusText status={status} className={`text-[12.5px] font-semibold ${tone}`} />;
}

function LinkBar({ odom }: { odom: OdomSourceState }) {
  const t = useT();
  const status: Status =
    odom.link === "live"
      ? { tone: "ok", text: t("Live odometry · {hz} Hz", { hz: odom.hz.toFixed(0) }) }
      : odom.link === "stale"
        ? { tone: "warn", text: t("The robot's odometry stopped updating") }
        : odom.link === "error"
          ? { tone: "error", text: odom.error ?? t("Connection to the backend closed") }
          : { tone: "busy", text: t("Connecting to the robot…") };
  const tone = odom.link === "error" ? "text-bad-fg" : odom.link === "stale" ? "text-warn-fg"
    : odom.link === "live" ? "text-good-fg" : "text-muted";
  return <StatusText status={status} className={`text-[12.5px] font-semibold ${tone}`} />;
}

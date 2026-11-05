import { useEffect, useState } from "react";
import {
  IconArrowBackUp,
  IconArrowDown,
  IconArrowUp,
  IconEraser,
  IconRotate,
  IconRotateClockwise,
  IconWalk,
} from "@tabler/icons-react";
import { MapView } from "../components/nav/MapView";
import { Button } from "../components/ui/Button";
import { NumberField } from "../components/ui/NumberField";
import { StatusText, type Status } from "../components/ui/StatusText";
import { StopButton } from "../components/ui/StopButton";
import { useCan } from "../auth/permissions";
import { useOdomSource, type OdomSourceState } from "../hooks/useOdomSource";
import { walkCancel, walkGoto, walkStatus } from "../api/walk";
import {
  deg,
  extendTrail,
  goalFrom,
  rad,
  walkLine,
  walkRunning,
  type Pose,
  type WalkStatus,
} from "../lib/odom";
import { msg, useT } from "../i18n";

/** Most one walk may cover, as the relay enforces it (relay_server.WALK_MAX_M). */
const MAX_M = 3;
const POLL_MS = 400;

const PRESETS = [
  { label: msg("1 m forward"), icon: IconArrowUp, dx: 1, dy: 0, dyaw: 0 },
  { label: msg("2 m forward"), icon: IconArrowUp, dx: 2, dy: 0, dyaw: 0 },
  { label: msg("50 cm back"), icon: IconArrowDown, dx: -0.5, dy: 0, dyaw: 0 },
  { label: msg("Turn 90° left"), icon: IconRotate, dx: 0, dy: 0, dyaw: 90 },
  { label: msg("Turn 90° right"), icon: IconRotateClockwise, dx: 0, dy: 0, dyaw: -90 },
  { label: msg("Turn around"), icon: IconArrowBackUp, dx: 0, dy: 0, dyaw: 180 },
] as const;

/**
 * Navigation — the G1 walks by itself to a point given relative to where it stands, and a map
 * seen from above shows where it thinks it is and the trail it walked (G1.md §6.2, phase 7b,
 * started 2026-11-05 on the robot's own odometry; the lidar map comes next, on this same page).
 *
 * Watching is read-only (/ws/odom). Walking is POST /api/walk: the loop runs ON THE ROBOT, so a
 * closed tab cannot leave it walking, and any stop or drive-pad move takes over. It has no eyes:
 * nothing here sees an obstacle.
 */
export function NavigationPage() {
  const t = useT();
  const can = useCan();
  const odom = useOdomSource();
  const [trail, setTrail] = useState<Pose[]>([]);
  const [walk, setWalk] = useState<WalkStatus | null>(null);
  const [problem, setProblem] = useState<Status | null>(null);
  const [dx, setDx] = useState(1);
  const [dy, setDy] = useState(0);
  const [turnDeg, setTurnDeg] = useState(0);

  const pose = odom.frame;
  const fresh = odom.link === "live" && !!pose;
  const running = walkRunning(walk);

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

  // The presets need only a robot that can be moved now; the typed walk also needs sane numbers.
  const blocked = !can("operate") || !fresh || running;
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

  const go = async (fx: number, fy: number, fdeg: number) => {
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

  const preview = pose && !running && !nothing && !tooFar ? goalFrom(pose, dx, dy, rad(turnDeg)) : null;

  return (
    <main className="grid gap-4 p-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        <LinkBar odom={odom} />
        <div className="h-[60vh] min-h-0 lg:h-auto lg:flex-1">
          <MapView pose={pose} trail={trail} goal={walk?.goal ?? null} start={walk?.start ?? null}
            preview={preview} />
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
                onClick={() => go(px, py, dyaw)}
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
          <p className="text-[11.5px] text-muted">
            {t("First straight to the point keeping its heading, then it turns in place. The dashed ring on the map is where it would end.")}
          </p>
          <Button disabled={cannotWhy !== null} title={cannotWhy ?? undefined}
            onClick={() => go(dx, dy, turnDeg)} className="flex items-center justify-center gap-2">
            <IconWalk size={16} />{t("Walk")}
          </Button>
          {cannotWhy && <p className="text-[11.5px] text-muted">{cannotWhy}</p>}
          {running && <StopButton onClick={stop} title={t("Stop the walk")} />}
          <StatusText status={problem ?? walkLine(walk)} wrap className="text-[12.5px] font-semibold text-fg" />
        </section>

        <p className="rounded-xl bg-warn-bg p-3 text-[12px] font-semibold text-warn-fg">
          {t("It has no eyes yet: nothing stops it before an obstacle. Keep the remote in hand and the way clear. Any stop, or a move from the drive pad, ends the walk.")}
        </p>

        <Button variant="secondary" onClick={() => setTrail(pose ? [pose] : [])}
          className="flex items-center justify-center gap-1.5 self-start text-[12px]">
          <IconEraser size={15} />{t("Clear the trail")}
        </Button>
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

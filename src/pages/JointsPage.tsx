import { useEffect, useRef, useState } from "react";
import { IconActivityHeartbeat, IconHandFinger, IconList, IconTarget } from "@tabler/icons-react";
import { ControlPanel } from "../components/joints/ControlPanel";
import { useCan } from "../auth/permissions";
import {
  JointInspector,
  JointTable,
  LegCheckPanel,
  SourceBar,
  TiltPanel,
} from "../components/joints/JointPanels";
import { RobotViewer, type JointLimits } from "../components/joints/RobotViewer";
import { useJointControl } from "../hooks/useJointControl";
import { STALE_AGE_MS, useJointSource, type JointSourceKind } from "../hooks/useJointSource";
import { JOINTS, JOINT_BY_URDF, readJoint } from "../lib/g1Joints";
import { GHOST_MIN_RAD } from "../lib/jointControl";
import { Segmented } from "../components/ui/Segmented";
import { msg, useT } from "../i18n";

/**
 * Joints — the G1 in 3D, posed live from its own joint readings, and (steps J2-J3 of
 * .claude/roadmap/G1-CONTROL-ARTICULAR.md) its arms and waist moved from here.
 *
 * Watching is read-only and always on (/ws/joints). Moving is a separate session the operator
 * opens with "Take control" (/ws/joint-control): every limit lives on the robot, in
 * g1_joint_sender; this page only names targets. The solid model is always the robot's own
 * reading; the translucent ghost is where it was told to go.
 *
 * With the robot off, "Recorded walk" replays a real walk — and nothing can be taken.
 * G1 only: the Go2 has neither stream (the relay serves them on the G1 alone).
 */
export function JointsPage() {
  const t = useT();
  // /joints#replay opens straight on the recording: the link to share when the robot is off.
  const [kind, setKind] = useState<JointSourceKind>(() =>
    location.hash === "#replay" ? "replay" : "live",
  );
  const source = useJointSource(kind);
  const control = useJointControl();
  const [selected, setSelected] = useState<string | null>(null);
  // Presentation only: the side panel's tab.
  const [tab, setTab] = useState<"control" | "joint" | "health" | "all">("control");
  const [hovered, setHovered] = useState<string | null>(null);
  const [colorByTemp, setColorByTemp] = useState(true);
  const [showTilt, setShowTilt] = useState(true);
  const [limits, setLimits] = useState<JointLimits | null>(null);
  const [origin, setOrigin] = useState<Record<string, number>>({});
  const [goals, setGoals] = useState<Record<string, number>>({});

  const frameRef = useRef(source.frame);
  useEffect(() => {
    frameRef.current = source.frame;
  });

  // The moment control is granted, every movable joint's target is where it IS — the same
  // rule the robot applies — so the ghost starts on top of the real arm and nothing jumps.
  const steering = control.phase === "up" || control.phase === "active";
  const allowedKey = control.allowed.join(",");
  useEffect(() => {
    if (!steering) {
      setOrigin({});
      setGoals({});
      return;
    }
    // The arms the relay allows, plus every finger of a hand that is answering right now (the
    // robot takes a hand only if it answered at "take", and refuses its fingers otherwise).
    const at: Record<string, number> = {};
    const candidates = [
      ...allowedKey.split(",").filter(Boolean),
      ...JOINTS.filter((j) => j.source !== "body").map((j) => j.urdf),
    ];
    for (const urdf of candidates) {
      const ref = JOINT_BY_URDF.get(urdf);
      const r = ref ? readJoint(frameRef.current, ref) : null;
      if (r) at[urdf] = r.q;
    }
    setOrigin((o) => (Object.keys(o).length ? o : at));
    setGoals((g) => (Object.keys(g).length ? g : at));
  }, [steering, allowedKey]);

  const onGoal = (urdf: string, rad: number) => {
    setGoals((g) => ({ ...g, [urdf]: rad }));
    control.target(urdf, rad);
  };

  const onBackToStart = () => {
    setGoals({ ...origin });
    for (const [urdf, rad] of Object.entries(origin)) control.target(urdf, rad);
  };

  // The ghost shows only what has not arrived yet: a joint within a couple of degrees of its
  // target is where it was told, and drawing the whole upper body twice hides the arm moving.
  const ghost: Record<string, number> = {};
  if (steering) {
    for (const [urdf, rad] of Object.entries(goals)) {
      const ref = JOINT_BY_URDF.get(urdf);
      const q = ref ? readJoint(source.frame, ref)?.q : undefined;
      if (q === undefined || Math.abs(rad - q) > GHOST_MIN_RAD) ghost[urdf] = rad;
    }
  }

  const fresh = !!source.frame && source.frame.ageMs >= 0 && source.frame.ageMs < STALE_AGE_MS;
  const can = useCan();
  const cannotTakeWhy = !can("operate")
    ? t("Your role can watch the robot, not move it.")
    : kind !== "live"
    ? t("Switch the source to Live robot to move it.")
    : source.link !== "live" || !fresh
      ? t("Waiting for live joint readings from the robot.")
      : null;

  // Clicking a part of the robot opens its details — except while steering, when the Control
  // tab already highlights that joint's row and must stay in front of the operator.
  const pick = (urdf: string | null) => {
    setSelected(urdf);
    if (urdf && !steering) setTab("joint");
  };

  const TABS = [
    ["control", msg("Control"), IconHandFinger],
    ["joint", msg("Joint"), IconTarget],
    ["health", msg("Health"), IconActivityHeartbeat],
    ["all", msg("All joints"), IconList],
  ] as const;

  return (
    <main className="grid gap-4 p-4 lg:h-full lg:grid-cols-[minmax(0,1fr)_400px] lg:overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        <SourceBar kind={kind} onKind={setKind} state={source} locked={control.phase !== "off"} />
        <div className="h-[60vh] min-h-0 lg:h-auto lg:flex-1">
          <RobotViewer
            frame={source.frame}
            selected={selected}
            hovered={hovered}
            onHover={setHovered}
            onSelect={pick}
            colorByTemp={colorByTemp}
            showTilt={showTilt}
            onLimits={setLimits}
            ghost={steering ? ghost : null}
            stalls={control.stalls}
          />
        </div>
      </div>
      {/* One column no wider than the page gives it: an auto track grows to its widest child,
          and a long message once pushed the whole panel sideways under a scrollbar. */}
      <aside className="flex min-h-[480px] min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-card">
        <Segmented className="m-3 mb-0 grid grid-cols-4 gap-0.5 rounded-xl bg-subtle p-1">
          {TABS.map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} data-on={tab === id}
              className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12px] font-bold whitespace-nowrap transition-colors ${
                tab === id ? "text-fg" : "text-muted hover:text-fg"}`}>
              <Icon size={15} className="shrink-0" />{t(label)}
            </button>
          ))}
        </Segmented>
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-4 overflow-x-hidden overflow-y-auto p-4">
          {tab === "control" && (
            <ControlPanel
              control={control}
              joints={Object.keys(origin)}
              canTake={cannotTakeWhy === null}
              cannotTakeWhy={cannotTakeWhy}
              selected={selected}
              frame={source.frame}
              limits={limits}
              origin={origin}
              goals={goals}
              onGoal={onGoal}
              onSelect={setSelected}
              onBackToStart={onBackToStart}
            />
          )}
          {tab === "joint" && <JointInspector urdf={hovered ?? selected} frame={source.frame} limits={limits} />}
          {tab === "health" && (
            <>
              <TiltPanel frame={source.frame} showTilt={showTilt} onShowTilt={setShowTilt} />
              <LegCheckPanel frame={source.frame} />
            </>
          )}
          {tab === "all" && (
            <JointTable
              frame={source.frame}
              selected={selected}
              hovered={hovered}
              onSelect={setSelected}
              onHover={setHovered}
              colorByTemp={colorByTemp}
              onColorByTemp={setColorByTemp}
            />
          )}
        </div>
      </aside>
    </main>
  );
}

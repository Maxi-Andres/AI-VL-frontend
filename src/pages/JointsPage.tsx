import { useEffect, useRef, useState } from "react";
import { ControlPanel } from "../components/joints/ControlPanel";
import {
  JointInspector,
  JointTable,
  LegCheckPanel,
  SourcePanel,
  TiltPanel,
} from "../components/joints/JointPanels";
import { RobotViewer, type JointLimits } from "../components/joints/RobotViewer";
import { useJointControl } from "../hooks/useJointControl";
import { STALE_AGE_MS, useJointSource, type JointSourceKind } from "../hooks/useJointSource";
import { JOINT_BY_URDF, readJoint } from "../lib/g1Joints";
import { GHOST_MIN_RAD } from "../lib/jointControl";

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
  // /joints#replay opens straight on the recording: the link to share when the robot is off.
  const [kind, setKind] = useState<JointSourceKind>(() =>
    location.hash === "#replay" ? "replay" : "live",
  );
  const source = useJointSource(kind);
  const control = useJointControl();
  const [selected, setSelected] = useState<string | null>(null);
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
    const at: Record<string, number> = {};
    for (const urdf of allowedKey.split(",").filter(Boolean)) {
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
  const cannotTakeWhy = kind !== "live"
    ? "Switch the source to Live robot to move it."
    : source.link !== "live" || !fresh
      ? "Waiting for live joint readings from the robot."
      : null;

  return (
    <main className="grid gap-3 p-3 lg:h-[calc(100dvh-49px)] lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="h-[60vh] min-w-0 lg:h-full">
        <RobotViewer
          frame={source.frame}
          selected={selected}
          hovered={hovered}
          onHover={setHovered}
          onSelect={setSelected}
          colorByTemp={colorByTemp}
          showTilt={showTilt}
          onLimits={setLimits}
          ghost={steering ? ghost : null}
        />
      </div>
      <aside className="grid min-w-0 content-start gap-3 lg:overflow-y-auto lg:pr-1">
        <SourcePanel
          kind={kind}
          onKind={setKind}
          state={source}
          locked={control.phase !== "off"}
        />
        <ControlPanel
          control={control}
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
        <JointInspector urdf={hovered ?? selected} frame={source.frame} limits={limits} />
        <TiltPanel frame={source.frame} showTilt={showTilt} onShowTilt={setShowTilt} />
        <LegCheckPanel frame={source.frame} />
        <JointTable
          frame={source.frame}
          selected={selected}
          hovered={hovered}
          onSelect={setSelected}
          onHover={setHovered}
          colorByTemp={colorByTemp}
          onColorByTemp={setColorByTemp}
        />
      </aside>
    </main>
  );
}

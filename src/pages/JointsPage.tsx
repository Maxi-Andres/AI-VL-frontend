import { useState } from "react";
import {
  JointInspector,
  JointTable,
  LegCheckPanel,
  SourcePanel,
  TiltPanel,
} from "../components/joints/JointPanels";
import { RobotViewer, type JointLimits } from "../components/joints/RobotViewer";
import { useJointSource, type JointSourceKind } from "../hooks/useJointSource";

/**
 * Joints — the G1 in 3D, posed live from its own joint readings. READ-ONLY.
 *
 * Step J1 of .claude/roadmap/G1-CONTROL-ARTICULAR.md: before any joint is moved from here,
 * the drawing has to be proven to BE the robot — every joint the right one, turning the right
 * way. With the robot off, "Recorded walk" replays a real walk for the same check. The legs
 * panel is the other job of this step: reading joint zeros with the robot hung, which is the
 * suspect behind it leaning back (.claude/roadmap/G1.md §6.4).
 *
 * G1 only: the Go2 has no joint stream (the relay serves it on the G1 alone).
 */
export function JointsPage() {
  // /joints#replay opens straight on the recording: the link to share when the robot is off.
  const [kind, setKind] = useState<JointSourceKind>(() =>
    location.hash === "#replay" ? "replay" : "live",
  );
  const source = useJointSource(kind);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [colorByTemp, setColorByTemp] = useState(true);
  const [showTilt, setShowTilt] = useState(true);
  const [limits, setLimits] = useState<JointLimits | null>(null);

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
        />
      </div>
      <aside className="grid min-w-0 content-start gap-3 lg:overflow-y-auto lg:pr-1">
        <SourcePanel kind={kind} onKind={setKind} state={source} />
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

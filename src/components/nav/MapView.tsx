import { useRef } from "react";
import { fitView, type LidarFrame, type Pose, type View } from "../../lib/odom";
import { useT } from "../../i18n";

/**
 * The Navigation page's map: the G1 seen from above, in its own odometry frame (metres; x to
 * the right, y up), with the trail it walked, where a walk started and where it is headed.
 *
 * Presentational: it draws what it is given. The view follows the robot only when something
 * would leave it (85 % of the way to an edge), so the grid does not crawl under a robot
 * standing still. What the lidar sees is drawn as dark squares (obstacles 10 cm..1.5 m over
 * the floor), in the same odometry frame as the trail.
 */
export function MapView({ pose, trail, goal, preview, start, lidar }: {
  pose: Pose | null;
  trail: Pose[];
  /** The running (or last) walk's target. */
  goal: Pose | null;
  /** Where the walk being composed would end, drawn dashed before it is sent. */
  preview: Pose | null;
  start: Pose | null;
  /** The obstacle map; ignored when it is not in the odometry frame (it would not line up). */
  lidar: LidarFrame | null;
}) {
  const t = useT();
  const view = useRef<View | null>(null);
  const shown = [...trail, ...[pose, goal, preview, start].filter((p): p is Pose => !!p)];
  const v = view.current;
  const outside = !v || shown.some((p) =>
    Math.abs(p.x - v.cx) > v.half * 0.85 || Math.abs(p.y - v.cy) > v.half * 0.85);
  if (outside) view.current = fitView(shown);
  const { cx, cy, half } = view.current!;

  // Grid every 0.5 m up close, every metre once the view is wide.
  const step = half > 5 ? 1 : 0.5;
  const lines: number[] = [];
  for (let k = Math.ceil((cx - half) / step); k * step <= cx + half; k++) lines.push(k * step);
  const rows: number[] = [];
  for (let k = Math.ceil((cy - half) / step); k * step <= cy + half; k++) rows.push(k * step);
  const px = half / 300;              // ~one screen pixel in metres, for sizes that must not scale

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-2xl border border-line bg-panel shadow-card">
      <svg viewBox={`${cx - half} ${-(cy + half)} ${2 * half} ${2 * half}`}
        preserveAspectRatio="xMidYMid meet" className="h-full w-full" role="img"
        aria-label={t("Map of the robot's walk, seen from above")}>
        {lines.map((x) => (
          <line key={`x${x}`} x1={x} x2={x} y1={-(cy + half)} y2={-(cy - half)}
            className={Math.abs(x % 1) < 1e-6 ? "stroke-line" : "stroke-subtle"}
            strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {rows.map((y) => (
          <line key={`y${y}`} y1={-y} y2={-y} x1={cx - half} x2={cx + half}
            className={Math.abs(y % 1) < 1e-6 ? "stroke-line" : "stroke-subtle"}
            strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {lidar && lidar.odom && lidar.cells.length > 0 && (
          // One path for every square: thousands of <rect>s would make each frame a DOM storm.
          <path className="fill-fg" opacity={0.55}
            d={lidar.cells.map(([ix, iy]) =>
              `M${ix * lidar.res} ${-(iy + 1) * lidar.res}h${lidar.res}v${lidar.res}h${-lidar.res}z`).join("")} />
        )}
        {trail.length > 1 && (
          <polyline points={trail.map((p) => `${p.x},${-p.y}`).join(" ")} fill="none"
            className="stroke-accent2" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round"
            vectorEffect="non-scaling-stroke" opacity={0.8} />
        )}
        {start && (
          <rect x={start.x - 6 * px} y={-start.y - 6 * px} width={12 * px} height={12 * px}
            className="fill-muted" />
        )}
        {preview && <Marker pose={preview} px={px} className="stroke-muted" dashed />}
        {goal && <Marker pose={goal} px={px} className="stroke-accent" />}
        {pose && <Robot pose={pose} px={px} />}
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-2 text-[11px] font-semibold text-muted">
        <span className="inline-block h-0.5 w-8 bg-muted" />
        {t("grid {step} m", { step })}
      </div>
    </div>
  );
}

/** A target: a ring with a tick for the heading it should end facing. */
function Marker({ pose, px, className, dashed = false }: {
  pose: Pose; px: number; className: string; dashed?: boolean;
}) {
  const r = 14 * px;
  return (
    <g className={className} fill="none" strokeWidth={2} strokeDasharray={dashed ? "4 3" : undefined}>
      <circle cx={pose.x} cy={-pose.y} r={r} vectorEffect="non-scaling-stroke" />
      <line x1={pose.x} y1={-pose.y} x2={pose.x + Math.cos(pose.yaw) * r * 1.8}
        y2={-(pose.y + Math.sin(pose.yaw) * r * 1.8)} vectorEffect="non-scaling-stroke" />
    </g>
  );
}

/** The robot: an arrow at its real size order (~0.45 m across the shoulders), never smaller than
 * a few pixels, pointing where it faces. */
function Robot({ pose, px }: { pose: Pose; px: number }) {
  const s = Math.max(0.22, 16 * px);
  const deg = (-pose.yaw * 180) / Math.PI;
  return (
    <g transform={`translate(${pose.x} ${-pose.y}) rotate(${deg})`}>
      <circle r={s * 1.05} className="fill-accent" opacity={0.15} />
      <path d={`M ${s} 0 L ${-s * 0.7} ${s * 0.65} L ${-s * 0.35} 0 L ${-s * 0.7} ${-s * 0.65} Z`}
        className="fill-accent stroke-panel" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </g>
  );
}

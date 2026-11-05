import { useEffect, useRef, useState } from "react";
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { URDFRobot } from "urdf-loader";
import {
  IconArrowsMaximize,
  IconCrosshair,
  IconCube,
  IconLayoutGrid,
} from "@tabler/icons-react";
import { loadG1Model, poseG1 } from "../../lib/g1Model";
import type { JointFrame } from "../../lib/g1Joints";
import type { CloudFrame, LidarFrame, Pose } from "../../lib/odom";
import { msg, useT } from "../../i18n";

/**
 * The Navigation page's world, in 3D: what the G1's lidar sees around it (a point cloud coloured
 * by height, the floor dimmed), the G1 itself — the same model as the Joints page, posed live
 * from its joints when they are given — standing where its odometry says, the trail it walked,
 * where a walk is headed and the way it planned. Rotate with the left button, pan with the right
 * (or two fingers), zoom with the wheel; "Top" and "3D" put the camera back, "Follow" keeps the
 * robot in the middle as it walks.
 *
 * Everything is in the robot's ODOMETRY frame (Z up, metres; the cloud's z is over the floor).
 * The scene is Y-up, so the world hangs under a group turned -90° about X: world (x, y, z) is
 * scene (x, z, -y).
 *
 * Drawn on demand: a frame is rendered only when something changed (a pose, a cloud, the camera),
 * like the Joints page — the GPU here is shared with the VLM.
 */

type ViewId = "top" | "3d";
const VIEWS: { id: ViewId; label: string; icon: typeof IconCube }[] = [
  { id: "top", label: msg("Top"), icon: IconLayoutGrid },
  { id: "3d", label: msg("3D"), icon: IconCube },
];

const isDark = () => document.documentElement.dataset.theme === "dark";
const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
const GRID = { light: { major: "#c3cad5", minor: "#e2e6ec" }, dark: { major: "#363c4c", minor: "#22262f" } };
// Height ramp of the cloud (data colours, the same in both themes): low teal, waist blue, head violet.
const RAMP = [new Color("#2fc1b1"), new Color("#60a5fa"), new Color("#a78bfa")];
const FLOOR_H = 0.08;      // m: points under this are the floor, drawn dim
const LIFT = 0.015;        // m: lines just over the floor so they are not hidden in it

interface Props {
  pose: Pose | null;
  trail: Pose[];
  goal: Pose | null;
  preview: Pose | null;
  path: [number, number][] | null;
  cloud: CloudFrame | null;
  /** The walk planner's obstacle squares, drawn as amber dots on the floor; null hides them. */
  obstacles: LidarFrame | null;
  /** The robot's joint readings, to pose the model live; null keeps it standing still. */
  joints: JointFrame | null;
}

export function NavScene({ pose, trail, goal, preview, path, cloud, obstacles, joints }: Props) {
  const t = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const api = useRef<{
    view: (v: ViewId) => void;
    update: (p: Props, follow: boolean) => void;
  } | null>(null);
  const latest = useRef<Props>({ pose, trail, goal, preview, path, cloud, obstacles, joints });
  const viewed = useRef(false);

  // ---- the scene, once ----
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dirty = true;
    let disposed = false;

    const scene = new Scene();
    scene.add(new HemisphereLight(0xffffff, 0x20222c, 1.3));
    const sun = new DirectionalLight(0xffffff, 1.5);
    sun.position.set(3, 6, 4);
    scene.add(sun);
    const world = new Group();
    world.rotation.x = -Math.PI / 2;
    scene.add(world);

    // The floor grid: 40 m in 0.5 m squares, moved under the robot when it walks far.
    let grid: GridHelper | null = null;
    const gridAt = new Vector3();
    const paintGrid = () => {
      if (grid) {
        world.remove(grid);
        grid.dispose();
      }
      const g = GRID[isDark() ? "dark" : "light"];
      grid = new GridHelper(40, 80, g.major, g.minor);
      grid.rotation.x = Math.PI / 2;             // its XZ plane onto the world's XY
      grid.position.copy(gridAt);
      world.add(grid);
      dirty = true;
    };
    paintGrid();

    // The cloud and the planner's squares.
    const cloudGeom = new BufferGeometry();
    const cloudPts = new Points(cloudGeom, new PointsMaterial({ size: 0.07, vertexColors: true }));
    world.add(cloudPts);
    const obstGeom = new BufferGeometry();
    const obstPts = new Points(obstGeom, new PointsMaterial({ size: 0.06, color: new Color("#f5b942") }));
    world.add(obstPts);

    // The trail, the planned way, the goal and the preview.
    const trailLine = new Line(new BufferGeometry(), new LineBasicMaterial({ color: new Color(css("--color-accent2", "#60a5fa")) }));
    const pathLine = new Line(new BufferGeometry(), new LineDashedMaterial({ color: new Color(css("--color-accent", "#2fc1b1")), dashSize: 0.12, gapSize: 0.08 }));
    world.add(trailLine, pathLine);
    const ring = (color: string, dashed: boolean) => {
      const g = new Group();
      const mat = dashed
        ? new LineDashedMaterial({ color: new Color(color), dashSize: 0.06, gapSize: 0.05 })
        : new LineBasicMaterial({ color: new Color(color) });
      const pts: number[] = [];
      for (let k = 0; k <= 48; k++) {
        const a = (k / 48) * Math.PI * 2;
        pts.push(Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0);
      }
      pts.push(0.25, 0, 0, 0.5, 0, 0);          // the heading it should end facing
      const geom = new BufferGeometry();
      geom.setAttribute("position", new BufferAttribute(new Float32Array(pts), 3));
      const line = new Line(geom, mat);
      if (dashed) line.computeLineDistances();
      g.add(line);
      if (!dashed) {
        const disk = new Mesh(new RingGeometry(0, 0.25, 32), new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity: 0.18, depthWrite: false }));
        g.add(disk);
      }
      g.visible = false;
      world.add(g);
      return g;
    };
    const goalMark = ring(css("--color-accent", "#2fc1b1"), false);
    const previewMark = ring(css("--color-muted", "#8b90a0"), true);

    // The robot: an arrow until the model arrives, then the G1 itself.
    const holder = new Group();
    world.add(holder);
    const arrow = new Mesh(new ConeGeometry(0.18, 0.5, 3), new MeshStandardMaterial({ color: new Color(css("--color-accent", "#2fc1b1")) }));
    arrow.rotation.z = -Math.PI / 2;             // the cone's tip along +X: where it faces
    arrow.position.z = 0.05;
    holder.add(arrow);
    let model: URDFRobot | null = null;
    // Feet on the floor: the model's lowest point at z = 0 (in the holder's own frame). Again
    // every GROUND_MS as the joints and the pelvis tilt move (the Joints page does it every
    // frame): a robot that squats, sits or stands changes how far its pelvis is from the floor.
    let grounded = 0;
    const GROUND_MS = 100;
    const ground = () => {
      if (!model) return;
      model.position.z = 0;
      holder.updateMatrixWorld(true);
      const box = new Box3().setFromObject(model);
      model.position.z = -holder.worldToLocal(box.min.clone()).z;
      grounded = performance.now();
    };
    loadG1Model()
      .then((r) => {
        if (disposed) return;
        model = r;
        poseG1(r, latest.current.joints);
        holder.add(r);
        ground();
        holder.remove(arrow);
        setLoaded(true);
        dirty = true;
      })
      .catch(() => {});                          // the arrow stays: the page still works

    const camera = new PerspectiveCamera(50, 1, 0.05, 200);
    camera.position.set(-3, 3, 3);
    const renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;     // never under the floor
    controls.minDistance = 0.5;
    controls.maxDistance = 40;
    controls.addEventListener("change", () => {
      dirty = true;
    });

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      dirty = true;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    const themeWatch = new MutationObserver(paintGrid);
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    // World (x, y, z) -> scene.
    const toScene = (x: number, y: number, z = 0) => new Vector3(x, z, -y);
    const robotAt = () => {
      const p = latest.current.pose;
      return p ? toScene(p.x, p.y) : new Vector3();
    };

    const view = (v: ViewId) => {
      const p = latest.current.pose;
      const at = robotAt();
      if (v === "top") {
        camera.position.set(at.x, 9, at.z + 0.001);
        controls.target.set(at.x, 0, at.z);
      } else {
        const yaw = p ? p.yaw : 0;
        // Behind and above the robot, looking where it faces.
        const back = toScene(-Math.cos(yaw) * 3.2, -Math.sin(yaw) * 3.2, 2.4);
        const ahead = toScene(Math.cos(yaw) * 1.2, Math.sin(yaw) * 1.2, 0.5);
        camera.position.copy(at).add(back);
        controls.target.copy(at).add(ahead);
      }
      controls.update();
      dirty = true;
    };

    const setLine = (line: Line, pts: [number, number][], dashed: boolean) => {
      const arr = new Float32Array(pts.length * 3);
      pts.forEach(([x, y], k) => arr.set([x, y, LIFT], k * 3));
      line.geometry.dispose();
      line.geometry = new BufferGeometry();
      line.geometry.setAttribute("position", new BufferAttribute(arr, 3));
      if (dashed) line.computeLineDistances();
      line.visible = pts.length > 1;
    };
    const placeMark = (g: Group, p: Pose | null) => {
      g.visible = !!p;
      if (p) {
        g.position.set(p.x, p.y, LIFT);
        g.rotation.z = p.yaw;
      }
    };

    let lastCloud: CloudFrame | null = null;
    let lastObst: LidarFrame | null = null;
    let lastTrail: Pose[] | null = null;
    let lastPath: [number, number][] | null = null;
    const floorColor = () => new Color(isDark() ? "#4a5060" : "#b9c0cc");
    const update = (p: Props, following: boolean) => {
      if (p.pose) {
        const before = robotAt();
        holder.position.set(p.pose.x, p.pose.y, 0);
        holder.rotation.z = p.pose.yaw;
        latest.current = p;
        if (following) {
          // Camera and target move together: orbiting and zooming still work while following.
          const shift = robotAt().sub(before);
          camera.position.add(shift);
          controls.target.add(shift);
        }
        // The grid follows in whole metres once the robot is 5 m from its middle.
        const far = Math.hypot(p.pose.x - gridAt.x, p.pose.y - gridAt.y) > 5;
        if (far) {
          gridAt.set(Math.round(p.pose.x), Math.round(p.pose.y), 0);
          grid?.position.copy(gridAt);
        }
      }
      latest.current = p;
      if (model && p.joints) {
        poseG1(model, p.joints);
        if (performance.now() - grounded > GROUND_MS) ground();
      }
      if (p.cloud !== lastCloud) {
        lastCloud = p.cloud;
        const pos = p.cloud?.positions ?? new Float32Array(0);
        const col = new Float32Array(pos.length);
        const floor = floorColor();
        const c = new Color();
        for (let i = 0; i < pos.length; i += 3) {
          const z = pos[i + 2];
          if (z < FLOOR_H) c.copy(floor);
          else {
            const u = Math.min(1, Math.max(0, z / 2));
            const a = u < 0.5 ? 0 : 1;
            c.copy(RAMP[a]).lerp(RAMP[a + 1], u < 0.5 ? u * 2 : (u - 0.5) * 2);
          }
          col[i] = c.r;
          col[i + 1] = c.g;
          col[i + 2] = c.b;
        }
        cloudGeom.setAttribute("position", new BufferAttribute(pos, 3));
        cloudGeom.setAttribute("color", new BufferAttribute(col, 3));
        cloudGeom.computeBoundingSphere();
      }
      if (p.obstacles !== lastObst) {
        lastObst = p.obstacles;
        const f = p.obstacles;
        const arr = new Float32Array(f && f.odom ? f.cells.length * 3 : 0);
        if (f && f.odom)
          f.cells.forEach(([ix, iy], k) => arr.set([(ix + 0.5) * f.res, (iy + 0.5) * f.res, 0.03], k * 3));
        obstGeom.setAttribute("position", new BufferAttribute(arr, 3));
        obstGeom.computeBoundingSphere();
      }
      if (p.trail !== lastTrail) {
        lastTrail = p.trail;
        setLine(trailLine, p.trail.map((q) => [q.x, q.y] as [number, number]), false);
      }
      if (p.path !== lastPath) {
        lastPath = p.path;
        setLine(pathLine, p.path ?? [], true);
      }
      placeMark(goalMark, p.goal);
      placeMark(previewMark, p.preview);
      dirty = true;
    };
    api.current = { view, update };

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      if (!dirty) return;
      dirty = false;
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      disposed = true;
      api.current = null;
      cancelAnimationFrame(raf);
      ro.disconnect();
      themeWatch.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const any = o as Mesh;
        any.geometry?.dispose?.();
        const m = any.material as { dispose?: () => void } | { dispose?: () => void }[] | undefined;
        if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
        else m?.dispose?.();
      });
      grid?.dispose();
      renderer.dispose();
      // Free the WebGL context now, not when the garbage collector gets to it (RobotViewer).
      renderer.forceContextLoss();
      renderer.domElement.width = 0;
      renderer.domElement.height = 0;
      renderer.domElement.remove();
    };
  }, []);

  // ---- every new reading ----
  useEffect(() => {
    api.current?.update({ pose, trail, goal, preview, path, cloud, obstacles, joints }, follow);
    // The first pose: put the camera behind the robot once.
    if (pose && !viewed.current && api.current) {
      viewed.current = true;
      api.current.view("3d");
    }
  }, [pose, trail, goal, preview, path, cloud, obstacles, joints, follow]);

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-2xl border border-line bg-panel shadow-card">
      <div ref={hostRef} className="absolute inset-0" aria-label={t("The robot and what its lidar sees, in 3D")} role="img" />
      <div className="absolute top-3 right-3 flex flex-wrap gap-1.5">
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => api.current?.view(id)}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-panel/90 px-2.5 py-1.5 text-[12px] font-bold text-fg shadow-card hover:bg-subtle">
            <Icon size={15} />{t(label)}
          </button>
        ))}
        <button type="button" onClick={() => setFollow((f) => !f)} aria-pressed={follow}
          title={t("Keep the robot in the middle as it walks")}
          className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-bold shadow-card ${
            follow ? "border-accent bg-accent text-on-accent" : "border-line bg-panel/90 text-fg hover:bg-subtle"}`}>
          <IconCrosshair size={15} />{t("Follow")}
        </button>
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-muted">
        <span>{t("Left drag: rotate · right drag: move · wheel: zoom")}</span>
        <span className="flex items-center gap-1"><IconArrowsMaximize size={12} />{t("grid 0.5 m")}</span>
        {!loaded && <span>{t("Loading the robot model…")}</span>}
      </div>
    </div>
  );
}

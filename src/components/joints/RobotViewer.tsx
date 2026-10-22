import { useEffect, useRef, useState } from "react";
import {
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import URDFLoader, { type URDFJoint, type URDFRobot } from "urdf-loader";
import { JOINTS, JOINT_BY_URDF, readJoint, tempLevel, type JointFrame } from "../../lib/g1Joints";
import { liveStalls, type StallAlert } from "../../lib/jointControl";
import { StatusText } from "../ui/StatusText";

/**
 * The G1 in 3D, posed from the robot's own joint readings. Presentational: the page owns the
 * frame, the selection and the toggles; this only draws them and reports hover/click.
 *
 * The model is public/g1/g1.urdf (Unitree's description, built by scripts/build_g1_model.py).
 * URDF is Z-up and faces +X; the scene is Y-up, so the robot hangs under a group turned -90°
 * about X — the robot then faces +X in the scene too, and the camera starts front-left of it.
 *
 * Every mesh belongs to the nearest MOVING joint above it (a palm, under a fixed joint, belongs
 * to the wrist yaw). That one mapping drives hover, selection highlight and temperature colour.
 *
 * WARM JOINTS: every joint over the "normal" temperature band is listed on the view itself with
 * its temperature, hottest first, in the colour it is painted — so a yellow part on the model can
 * be named without hunting through the joint table (asked for 2026-10-15). Click one to select it.
 *
 * VIEWS: the whole robot, or close on one hand — the camera then follows that hand as the arm
 * moves. The hands are a few dozen pixels in the whole-robot view, and the robot's left hand is
 * on the RIGHT of the screen when it faces the camera: both made a moving finger easy to miss
 * (2026-10-15), so the buttons say "Robot's left hand", not "Left".
 *
 * TOP-LEFT CORNER: what the operator should notice about single joints — those that stopped
 * against something (rule 8 of joint_ctl_core.hpp; each listed for 30 s after its last stall,
 * with how many times) and, under them, those running warm. Clicking one selects it.
 *
 * THE GHOST: while the page moves a joint, a translucent copy of what hangs from that joint (the
 * forearm and hand, for an elbow) shows where it was told to go. The solid model is always the
 * robot's own reading, so the gap between the two is the move still to come.
 */

/** A joint's range in the model, radians. */
export type JointLimits = Map<string, { lower: number; upper: number }>;

interface Props {
  frame: JointFrame | null;
  selected: string | null;
  hovered: string | null;
  onHover: (urdf: string | null) => void;
  onSelect: (urdf: string | null) => void;
  colorByTemp: boolean;
  /** Tilt the whole robot by the pelvis IMU's roll and pitch (yaw is ignored). */
  showTilt: boolean;
  /** Called once the model is loaded, with each moving joint's range from the URDF. */
  onLimits?: (limits: JointLimits) => void;
  /** Targets by URDF joint name, drawn as the ghost; null or empty hides it. */
  ghost?: Record<string, number> | null;
  /** Joints that stopped against something, newest first (useJointControl's `stalls`). */
  stalls?: StallAlert[];
}

const MODEL_URL = `${import.meta.env.BASE_URL}g1/g1.urdf`;

/** Text colour per temperature band — the same hues the parts are painted in. */
const TEMP_TEXT: Record<string, string> = {
  warm: "text-[#f5b942]",
  hot: "text-[#f97316]",
  critical: "text-[#ef4444] font-semibold",
};

interface WarmJoint {
  urdf: string;
  name: string;
  temp: number;
  level: string;
}

/** "left arm · elbow": how both corner lists name a joint. */
function jointName(urdf: string): string {
  const j = JOINT_BY_URDF.get(urdf);
  return j ? `${j.group.toLowerCase()} · ${j.label}` : urdf.replace(/_joint$/, "").replace(/_/g, " ");
}

/** Joints over the normal band, hottest first. */
function warmJoints(frame: JointFrame | null): WarmJoint[] {
  const out: WarmJoint[] = [];
  for (const j of JOINTS) {
    const t = readJoint(frame, j)?.temp ?? null;
    const level = tempLevel(t);
    if (t === null || level === "normal") continue;
    out.push({ urdf: j.urdf, name: jointName(j.urdf), temp: t, level });
  }
  return out.sort((a, b) => b.temp - a.temp);
}

type View = "robot" | "left" | "right";
const VIEWS: { id: View; label: string }[] = [
  { id: "robot", label: "Whole robot" },
  { id: "left", label: "Robot's left hand" },
  { id: "right", label: "Robot's right hand" },
];
const HOME = { camera: new Vector3(2.3, 1.2, 1.3), target: new Vector3(0, 0.75, 0) };
/** How far the camera sits from a hand it is looking at, metres. */
const HAND_DISTANCE = 0.45;

const COLORS = {
  background: "#0e0f13",
  gridMajor: "#262a36",
  gridMinor: "#1a1d26",
  selected: new Color("#60a5fa"),
  ghost: new Color("#60a5fa"),
  hovered: new Color("#8b90a0"),
  none: new Color(0x000000),
  temp: {
    normal: null,
    warm: new Color("#f5b942"),
    hot: new Color("#f97316"),
    critical: new Color("#ef4444"),
  },
};

interface Part {
  mesh: Mesh;
  material: MeshStandardMaterial;
  base: Color;
}

interface Model {
  robot: URDFRobot;
  ghost: URDFRobot;
  /** Each ghost mesh with every joint above it: it is drawn only below a joint being moved. */
  ghostMeshes: { mesh: Mesh; above: Set<string> }[];
  /** urdf joint name -> the meshes it moves directly. */
  parts: Map<string, Part[]>;
  meshes: Mesh[];
}

/** The nearest moving joint at or above `obj`, by URDF name. */
function owningJoint(obj: Object3D | null): string | null {
  for (let o = obj; o; o = o.parent) {
    const j = o as URDFJoint;
    if (j.isURDFJoint && j.jointType !== "fixed" && JOINT_BY_URDF.has(j.name)) return j.name;
  }
  return null;
}

export function RobotViewer({
  frame, selected, hovered, onHover, onSelect, colorByTemp, showTilt, onLimits, ghost, stalls,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<Model | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>("robot");
  const viewRef = useRef<View>("robot");
  // Set by the scene effect: points the camera for a view (and follows a hand each frame).
  const aimRef = useRef<(v: View) => void>(() => {});
  // Latest callbacks for the listeners registered once in the setup effect.
  const cb = useRef({ onHover, onSelect, onLimits });
  useEffect(() => {
    cb.current = { onHover, onSelect, onLimits };
  });

  // ---- scene, once ----
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new Scene();
    scene.background = new Color(COLORS.background);
    scene.add(new HemisphereLight(0xffffff, 0x20222c, 1.4));
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const grid = new GridHelper(4, 16, COLORS.gridMajor, COLORS.gridMinor);
    scene.add(grid);

    const camera = new PerspectiveCamera(35, 1, 0.02, 50);
    camera.position.copy(HOME.camera);
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(HOME.target);
    controls.enableDamping = true;
    controls.minDistance = 0.15;
    controls.maxDistance = 6;
    controls.update();

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = `${w}px`;
      renderer.domElement.style.height = `${h}px`;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // URDF is Z-up; the scene is Y-up.
    const upright = new Group();
    upright.rotation.x = -Math.PI / 2;
    scene.add(upright);

    let disposed = false;
    const loader = new URDFLoader();
    loader.parseCollision = false;
    let robot: URDFRobot | null = null;
    // Completion is counted HERE, not by a LoadingManager. three's FileLoader shares a download
    // already in flight with a second loader WITHOUT telling that loader's manager, so after a
    // quick remount (React's development double-mount, or leaving the page and coming straight
    // back) the new manager saw only the URDF, reported "done" with no meshes in the robot, and
    // the model was stood on the grid at y = -Infinity: an empty scene (2026-10-14).
    let pending = 0;
    let finished = false;
    const finish = () => {
      if (disposed || finished || !robot || pending > 0) return;
      finished = true;
      const parts = new Map<string, Part[]>();
      const meshes: Mesh[] = [];
      robot.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        const old = mesh.material as MeshStandardMaterial;
        const base = old.color ? old.color.clone() : new Color("#9aa0ad");
        const material = new MeshStandardMaterial({ color: base, roughness: 0.65, metalness: 0.1 });
        old.dispose?.();
        mesh.material = material;
        meshes.push(mesh);
        const joint = owningJoint(mesh);
        if (joint) {
          const list = parts.get(joint) ?? [];
          list.push({ mesh, material, base });
          parts.set(joint, list);
        }
      });
      const limits: JointLimits = new Map();
      for (const j of Object.values(robot.joints)) {
        if (j.jointType === "revolute")
          limits.set(j.name, { lower: Number(j.limit.lower), upper: Number(j.limit.upper) });
        j.ignoreLimits = true;     // show the reading even if it is past the model's range
      }
      cb.current.onLimits?.(limits);
      // Stand the robot on the grid: lowest point at y = 0, in its zero pose.
      upright.updateMatrixWorld(true);
      upright.position.y = -new Box3().setFromObject(upright).min.y;
      // The ghost: same geometry (shared, not copied), one see-through material, not pickable.
      const ghostRobot = robot.clone() as URDFRobot;
      const ghostMaterial = new MeshStandardMaterial({
        color: COLORS.ghost, transparent: true, opacity: 0.28, depthWrite: false,
        emissive: COLORS.ghost, emissiveIntensity: 0.35,
      });
      const ghostMeshes: Model["ghostMeshes"] = [];
      ghostRobot.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        mesh.material = ghostMaterial;
        const above = new Set<string>();
        for (let a: Object3D | null = mesh; a; a = a.parent)
          if ((a as URDFJoint).isURDFJoint) above.add(a.name);
        ghostMeshes.push({ mesh, above });
      });
      for (const j of Object.values(ghostRobot.joints)) j.ignoreLimits = true;
      ghostRobot.visible = false;
      upright.add(ghostRobot);
      modelRef.current = { robot, ghost: ghostRobot, ghostMeshes, parts, meshes };
      setLoaded(true);
    };
    loader.loadMeshCb = (path, manager, done) => {
      pending += 1;
      new STLLoader(manager).load(
        path,
        (geometry) => {
          done(new Mesh(geometry, new MeshStandardMaterial()));
          pending -= 1;
          finish();
        },
        undefined,
        (err) => {
          setLoadError(`Could not load ${path}`);
          done(new Group(), err as Error);
          pending -= 1;
          finish();
        },
      );
    };
    loader.load(
      MODEL_URL,
      (r) => {
        robot = r;
        upright.add(r);
        finish();
      },
      undefined,
      (e) => setLoadError(`Could not load the robot model: ${e}`),
    );

    // ---- picking: hover on move, select on a click that was not a drag ----
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let down: { x: number; y: number } | null = null;
    let lastHover: string | null = null;
    const pick = (ev: PointerEvent): string | null => {
      const model = modelRef.current;
      if (!model) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(model.meshes, false)[0];
      return hit ? owningJoint(hit.object) : null;
    };
    const onMove = (ev: PointerEvent) => {
      if (down) return;               // orbiting: do not flicker the hover
      const j = pick(ev);
      if (j !== lastHover) {
        lastHover = j;
        cb.current.onHover(j);
      }
    };
    const onDown = (ev: PointerEvent) => {
      down = { x: ev.clientX, y: ev.clientY };
    };
    const onUp = (ev: PointerEvent) => {
      if (down && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 5) {
        cb.current.onSelect(pick(ev));
      }
      down = null;
    };
    const onLeave = () => {
      lastHover = null;
      cb.current.onHover(null);
    };
    const el = renderer.domElement;
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onLeave);

    // Views. A hand view puts the camera HAND_DISTANCE from the hand along the current viewing
    // direction, then keeps the hand centred as it moves (camera and target shift together, so
    // orbiting and zooming still work while following).
    const handPoint = (side: "left" | "right") => {
      const link = modelRef.current?.robot.links[`${side}_base_link`];
      return link ? link.getWorldPosition(new Vector3()) : null;
    };
    aimRef.current = (v: View) => {
      if (v === "robot") {
        camera.position.copy(HOME.camera);
        controls.target.copy(HOME.target);
        controls.update();
        return;
      }
      const p = handPoint(v);
      if (!p) return;
      const dir = camera.position.clone().sub(controls.target).normalize();
      controls.target.copy(p);
      camera.position.copy(p).addScaledVector(dir, HAND_DISTANCE);
      controls.update();
    };
    const follow = () => {
      const v = viewRef.current;
      if (v === "robot") return;
      const p = handPoint(v);
      if (!p) return;
      const shift = p.clone().sub(controls.target);
      controls.target.add(shift);
      camera.position.add(shift);
    };

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      follow();
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onLeave);
      controls.dispose();
      scene.traverse((o) => {
        const mesh = o as Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          (mesh.material as MeshStandardMaterial).dispose();
        }
      });
      grid.dispose();
      renderer.dispose();
      el.remove();
      modelRef.current = null;
    };
  }, []);

  // ---- pose: joint angles and body tilt, then the ghost on top ----
  useEffect(() => {
    const model = modelRef.current;
    if (!model || !frame) return;
    const showGhost = !!ghost && Object.keys(ghost).length > 0;
    for (const j of JOINTS) {
      const r = readJoint(frame, j);
      if (!r) continue;
      model.robot.joints[j.urdf]?.setJointValue(r.q);
      if (showGhost) model.ghost.joints[j.urdf]?.setJointValue(ghost[j.urdf] ?? r.q);
    }
    const [roll, pitch] = showTilt && frame.imu ? frame.imu : [0, 0];
    // ZYX is ROS's rpy convention (R = Rz·Ry·Rx), with yaw left out on purpose: heading is not
    // what this page is about, and spinning the model would fight the camera.
    model.robot.rotation.set(roll, pitch, 0, "ZYX");
    model.ghost.rotation.copy(model.robot.rotation);
    model.ghost.visible = showGhost;
    if (showGhost) {
      const moving = Object.keys(ghost);
      for (const g of model.ghostMeshes) g.mesh.visible = moving.some((j) => g.above.has(j));
    }
  }, [frame, showTilt, ghost, loaded]);

  // ---- colour: temperature, then hover and selection on top ----
  useEffect(() => {
    const model = modelRef.current;
    if (!model) return;
    for (const [joint, parts] of model.parts) {
      const ref = JOINT_BY_URDF.get(joint)!;
      const temp = colorByTemp ? COLORS.temp[tempLevel(readJoint(frame, ref)?.temp ?? null)] : null;
      const glow = joint === selected ? COLORS.selected : joint === hovered ? COLORS.hovered : null;
      for (const p of parts) {
        p.material.color.copy(temp ?? p.base);
        p.material.emissive.copy(glow ?? COLORS.none);
        p.material.emissiveIntensity = joint === selected ? 0.55 : 0.3;
      }
    }
  }, [frame, selected, hovered, colorByTemp, loaded]);

  const warm = warmJoints(frame);
  // Re-rendered with every joint frame (~30 Hz live), so "s ago" and the expiry keep up.
  const now = Date.now();
  const stopped = liveStalls(stalls ?? [], now);
  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden rounded-md border border-line">
      <div ref={hostRef} className="absolute inset-0" />
      {!loaded && !loadError && (
        <div className="absolute inset-0 grid place-items-center text-sm text-muted">
          <StatusText status={{ tone: "busy", text: "Loading the G1 model…" }} />
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 grid place-items-center p-4 text-sm text-[#ff9aa6]">
          <StatusText status={{ tone: "error", text: loadError }} />
        </div>
      )}
      {loaded && (stopped.length > 0 || warm.length > 0) && (
        <div className="absolute left-2 top-2 flex max-h-[60%] max-w-[55%] flex-col gap-1.5">
          {stopped.length > 0 && (
            <div className="min-h-0 overflow-y-auto rounded-md border border-[#f97316]/50 bg-bg/85 px-2 py-1.5">
              <p className="m-0 mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#f97316]">
                Stopped against something
              </p>
              <ul className="m-0 grid list-none gap-0.5 p-0">
                {stopped.map((s) => (
                  <li key={s.urdf}>
                    <button
                      type="button"
                      onClick={() => onSelect(s.urdf)}
                      onMouseEnter={() => onHover(s.urdf)}
                      onMouseLeave={() => onHover(null)}
                      className="flex w-full cursor-pointer items-baseline justify-between gap-3 text-left text-xs"
                    >
                      <span className={`capitalize ${s.urdf === selected ? "text-fg" : "text-muted"}`}>
                        {jointName(s.urdf)}
                      </span>
                      <span className="font-mono tabular-nums text-[#f97316]">
                        {s.count > 1 ? `×${s.count} · ` : ""}
                        {Math.max(0, Math.round((now - s.at) / 1000))} s ago
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {warm.length > 0 && (
            <div className="min-h-0 overflow-y-auto rounded-md border border-line bg-bg/85 px-2 py-1.5">
              <p className="m-0 mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                Warm joints
              </p>
              <ul className="m-0 grid list-none gap-0.5 p-0">
                {warm.map((w) => (
                  <li key={w.urdf}>
                    <button
                      type="button"
                      onClick={() => onSelect(w.urdf)}
                      onMouseEnter={() => onHover(w.urdf)}
                      onMouseLeave={() => onHover(null)}
                      className="flex w-full cursor-pointer items-baseline justify-between gap-3 text-left text-xs"
                    >
                      <span className={`capitalize ${w.urdf === selected ? "text-fg" : "text-muted"}`}>
                        {w.name}
                      </span>
                      <span className={`font-mono tabular-nums ${TEMP_TEXT[w.level]}`}>
                        {w.temp.toFixed(0)} °C
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {loaded && (
        <div className="absolute right-2 top-2 flex gap-1 rounded-md border border-line bg-bg/80 p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={view === v.id}
              onClick={() => {
                viewRef.current = v.id;
                setView(v.id);
                aimRef.current(v.id);
              }}
              className={`cursor-pointer rounded px-2 py-1 text-xs ${
                view === v.id ? "bg-[#2a2e3a] font-semibold text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
      <p className="pointer-events-none absolute bottom-2 left-3 m-0 text-[11px] text-muted">
        Drag to orbit · scroll to zoom · click a part to inspect its joint
      </p>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  HemisphereLight,
  LoadingManager,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import URDFLoader, { type URDFJoint, type URDFRobot } from "urdf-loader";
import { JOINTS, JOINT_BY_URDF, readJoint, tempLevel, type JointFrame } from "../../lib/g1Joints";
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
}

const MODEL_URL = `${import.meta.env.BASE_URL}g1/g1.urdf`;

const COLORS = {
  background: "#0e0f13",
  gridMajor: "#262a36",
  gridMinor: "#1a1d26",
  selected: new Color("#60a5fa"),
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
  frame, selected, hovered, onHover, onSelect, colorByTemp, showTilt, onLimits,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<Model | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
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

    const camera = new PerspectiveCamera(35, 1, 0.05, 50);
    camera.position.set(2.3, 1.2, 1.3);
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "none";

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.75, 0);
    controls.enableDamping = true;
    controls.minDistance = 0.4;
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
    const manager = new LoadingManager();
    const loader = new URDFLoader(manager);
    loader.parseCollision = false;
    let robot: URDFRobot | null = null;
    manager.onLoad = () => {
      if (disposed || !robot) return;
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
      modelRef.current = { robot, parts, meshes };
      setLoaded(true);
    };
    manager.onError = (url) => setLoadError(`Could not load ${url}`);
    loader.load(
      MODEL_URL,
      (r) => {
        robot = r;
        upright.add(r);
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

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
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

  // ---- pose: joint angles and body tilt ----
  useEffect(() => {
    const model = modelRef.current;
    if (!model || !frame) return;
    for (const j of JOINTS) {
      const r = readJoint(frame, j);
      if (r) model.robot.joints[j.urdf]?.setJointValue(r.q);
    }
    const [roll, pitch] = showTilt && frame.imu ? frame.imu : [0, 0];
    // ZYX is ROS's rpy convention (R = Rz·Ry·Rx), with yaw left out on purpose: heading is not
    // what this page is about, and spinning the model would fight the camera.
    model.robot.rotation.set(roll, pitch, 0, "ZYX");
  }, [frame, showTilt, loaded]);

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
      <p className="pointer-events-none absolute bottom-2 left-3 m-0 text-[11px] text-muted">
        Drag to orbit · scroll to zoom · click a part to inspect its joint
      </p>
    </div>
  );
}

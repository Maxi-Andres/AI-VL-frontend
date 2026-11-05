import { Group, Mesh, MeshStandardMaterial } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import URDFLoader, { type URDFRobot } from "urdf-loader";
import { JOINTS, readJoint, type JointFrame } from "./g1Joints";

/**
 * The G1's 3D model, for every page that draws it (Joints, Navigation): public/g1/g1.urdf
 * (Unitree's description, built by scripts/build_g1_model.py) and its meshopt-compressed GLB
 * meshes, ~3 MB in all. URDF is Z-up and faces +X.
 *
 * Resolves once the URDF AND every mesh have arrived — counted here, not by a LoadingManager:
 * three's FileLoader shares a download already in flight with a second loader WITHOUT telling
 * that loader's manager, so after a quick remount the new manager saw only the URDF, reported
 * "done" with no meshes, and the robot was stood on the grid at y = -Infinity (2026-10-14).
 * `onMeshError` hears about a mesh that failed (the robot still resolves, without that part).
 */
export const G1_MODEL_URL = `${import.meta.env.BASE_URL}g1/g1.urdf`;

export function loadG1Model(onMeshError?: (path: string) => void): Promise<URDFRobot> {
  return new Promise((resolve, reject) => {
    const loader = new URDFLoader();
    loader.parseCollision = false;
    let robot: URDFRobot | null = null;
    let pending = 0;
    let settled = false;
    const finish = () => {
      if (settled || !robot || pending > 0) return;
      settled = true;
      resolve(robot);
    };
    const gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    loader.loadMeshCb = (path, manager, done) => {
      pending += 1;
      gltf.manager = manager;
      gltf.load(
        path,
        ({ scene: file }) => {
          // One mesh per file, the original geometry with its normals baked by the build script.
          // Handed over as a bare Mesh so urdf-loader paints it with the URDF's colour (it only
          // does that for a Mesh, not for the glTF's group around it).
          let geometry: Mesh["geometry"] | null = null;
          file.traverse((o) => {
            if (!geometry && (o as Mesh).isMesh) geometry = (o as Mesh).geometry;
          });
          done(geometry ? new Mesh(geometry, new MeshStandardMaterial()) : new Group());
          pending -= 1;
          finish();
        },
        undefined,
        (err) => {
          onMeshError?.(path);
          done(new Group(), err as Error);
          pending -= 1;
          finish();
        },
      );
    };
    loader.load(
      G1_MODEL_URL,
      (r) => {
        robot = r;
        finish();
      },
      undefined,
      (e) => {
        if (!settled) {
          settled = true;
          reject(e);
        }
      },
    );
  });
}

/** Pose the model from a joint frame (the robot's own readings): every joint the frame carries
 * (the others stay where they are) and, with `tilt`, the pelvis's roll and pitch from its IMU —
 * without them a squatting robot is drawn upright with its legs folded under it, sitting on air
 * (2026-11-05). ZYX is ROS's rpy convention (R = Rz·Ry·Rx); yaw is left to the caller (the
 * Joints page ignores it, the Navigation page takes it from the odometry). */
export function poseG1(robot: URDFRobot, frame: JointFrame | null, tilt = true): void {
  if (!frame) return;
  for (const j of JOINTS) {
    const r = readJoint(frame, j);
    const joint = robot.joints[j.urdf];
    if (r && joint) joint.setJointValue(r.q);
  }
  const [roll, pitch] = tilt && frame.imu ? frame.imu : [0, 0];
  robot.rotation.set(roll, pitch, 0, "ZYX");
}

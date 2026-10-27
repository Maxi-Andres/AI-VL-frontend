#!/usr/bin/env python3
"""Build the G1 model the Joints page draws: public/g1/g1.urdf + public/g1/meshes/*.glb.

The source is Unitree's own description package (g1_description: URDF + STL meshes). Its full
mesh set is ~100 MB and the variant we draw uses 31 MB of it (627k faces) — too heavy for a
page that may be opened over LTE. This keeps the VISUAL geometry only (collision meshes are for
physics, the page never uses them) and ships it WHOLE, compressed: each STL becomes a GLB with
its normals baked in (smooth across gentle angles, sharp at the machined edges) and is packed by
gltfpack with meshopt compression — ~3 MB for every face of the original.

Why not fewer faces: until 2026-10-27 every mesh was decimated to 2000 faces (6.9 MB of STL).
Decimation picks what to drop mesh by mesh, so the result was lumpy and NOT SYMMETRIC — the two
sides of the pelvis came out different — and it was still twice the size of this.

WHICH VARIANT: it must match the robot, or the drawn joints are not the robot's joints.
  - The BODY follows `mode_machine`. Ours reports 6 (read off rt/lf/lowstate by the telemetry
    reader on 2026-10-13), which g1_description's README maps to the lock-waist 29-DoF body:
    waist roll and pitch FIXED.
  - The HANDS are not in mode_machine. Ours are BrainCo Revo 2 (seen on the robot and read over
    Modbus, 2026-10-15 — after two wrong guesses, Dex3-1 and Inspire).
The source is Unitree's `unitree_ros/robots/g1_with_brainco_hand` (BSD-3): a mode-15 body with
the BrainCo hands. Its 35 body joints have the same types, origins and axes as the lock-waist
body except the two waist joints (compared 2026-10-14/15), so this takes it and fixes those two.
Its fingertip joints are "revolute" with lower == upper (a fixed angle written as a joint):
they are turned into fixed joints with that angle baked into their origin, so nothing here
leaves a joint the page could move by mistake.

Run once, by hand, whenever the source package changes (needs: pip install trimesh numpy
scipy, and bun for `bunx gltfpack`):

    git clone --depth 1 --filter=blob:none --sparse https://github.com/unitreerobotics/unitree_ros
    git -C unitree_ros sparse-checkout set robots/g1_with_brainco_hand
    python3 scripts/build_g1_model.py unitree_ros/robots/g1_with_brainco_hand

It is a build step, not part of `bun run build`: the output is committed as a static asset.
"""
import argparse
import math
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

VARIANT = "g1_29dof_mode_15_brainco_hand"
# The lock-waist body (mode_machine 6): these have no motor on this robot.
LOCKED = ("waist_roll_joint", "waist_pitch_joint")
# Links drawn without their visual: the maker's lettering on the chest (asked 2026-10-27). The
# link and its joint stay, so the tree is still Unitree's.
NO_VISUAL = ("logo_link",)
# Faces meeting at less than this are shaded as one smooth surface; sharper meets stay an edge.
CREASE_DEGREES = 35
OUT = Path(__file__).resolve().parent.parent / "public" / "g1"


def convert(src: Path, dst: Path) -> int:
    """One STL -> one meshopt-compressed GLB, every face kept, normals baked. Returns faces."""
    import trimesh

    mesh = trimesh.load(src, force="mesh")
    mesh.merge_vertices()
    shaded = trimesh.graph.smooth_shade(mesh, angle=math.radians(CREASE_DEGREES))
    dst.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        raw = Path(tmp) / dst.name
        shaded.export(raw, include_normals=True)
        # -vpf: float positions, so the mesh needs no dequantising node transform (urdf-loader
        # resets the position of what it is handed, which would throw that offset away).
        subprocess.run(["bunx", "gltfpack", "-i", str(raw), "-o", str(dst), "-cc", "-vpf"],
                       check=True, capture_output=True)
    return len(mesh.faces)


def _rpy_to_matrix(r: float, p: float, y: float) -> list[list[float]]:
    cr, sr, cp, sp, cy, sy = math.cos(r), math.sin(r), math.cos(p), math.sin(p), math.cos(y), \
        math.sin(y)
    return [[cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
            [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
            [-sp, cp * sr, cp * cr]]


def _axis_angle_matrix(axis: list[float], a: float) -> list[list[float]]:
    n = math.sqrt(sum(v * v for v in axis))
    x, y, z = (v / n for v in axis)
    c, s, t = math.cos(a), math.sin(a), 1 - math.cos(a)
    return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y],
            [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
            [t * x * z - s * y, t * y * z + s * x, t * z * z + c]]


def _matrix_to_rpy(m: list[list[float]]) -> tuple[float, float, float]:
    pitch = math.asin(max(-1.0, min(1.0, -m[2][0])))
    if abs(m[2][0]) < 0.999999:
        return math.atan2(m[2][1], m[2][2]), pitch, math.atan2(m[1][0], m[0][0])
    return 0.0, pitch, math.atan2(-m[0][1], m[1][1])     # gimbal lock: fold roll into yaw


def bake_fixed(joint: ET.Element, angle: float) -> None:
    """A revolute joint pinned at `angle` becomes a fixed joint posed at that angle (URDF:
    child pose = origin · rotation(axis, angle))."""
    origin = joint.find("origin")
    if origin is None:
        origin = ET.SubElement(joint, "origin", xyz="0 0 0", rpy="0 0 0")
    rpy = [float(v) for v in origin.get("rpy", "0 0 0").split()]
    axis_el = joint.find("axis")
    axis = [float(v) for v in (axis_el.get("xyz") if axis_el is not None else "1 0 0").split()]
    o, r = _rpy_to_matrix(*rpy), _axis_angle_matrix(axis, angle)
    m = [[sum(o[i][k] * r[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
    origin.set("rpy", " ".join(f"{v:.9g}" for v in _matrix_to_rpy(m)))
    joint.set("type", "fixed")
    for tag in ("axis", "limit", "dynamics"):
        for el in joint.findall(tag):
            joint.remove(el)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("description_dir", type=Path,
                    help="unitree_ros/robots/g1_with_brainco_hand (the URDF and its meshes/)")
    args = ap.parse_args()

    src_urdf = args.description_dir / f"{VARIANT}.urdf"
    if not src_urdf.is_file():
        print(f"error: {src_urdf} not found", file=sys.stderr)
        return 1

    tree = ET.parse(src_urdf)
    root = tree.getroot()
    for link in root.findall("link"):
        for col in link.findall("collision"):
            link.remove(col)
        if link.get("name") in NO_VISUAL:
            for vis in link.findall("visual"):
                link.remove(vis)
    for name in LOCKED:
        joint = root.find(f"joint[@name='{name}']")
        if joint is None:
            print(f"error: {name} not in {src_urdf.name}", file=sys.stderr)
            return 1
        joint.set("type", "fixed")
    for joint in root.findall("joint"):
        limit = joint.find("limit")
        if joint.get("type") == "revolute" and limit is not None and \
                float(limit.get("lower", "0")) == float(limit.get("upper", "1")):
            bake_fixed(joint, float(limit.get("lower")))

    if OUT.exists():
        shutil.rmtree(OUT / "meshes", ignore_errors=True)
    faces = 0
    done: dict[str, str] = {}
    for mesh_el in root.iter("mesh"):
        rel = mesh_el.get("filename", "")
        name = Path(rel).stem + ".glb"
        if name not in done:
            faces += convert(args.description_dir / rel, OUT / "meshes" / name)
            done[name] = f"meshes/{name}"
        mesh_el.set("filename", done[name])

    ET.indent(tree)
    tree.write(OUT / "g1.urdf", encoding="utf-8", xml_declaration=True)
    # ElementTree ends the file without a newline; the end-of-file-fixer hook rejects that.
    with open(OUT / "g1.urdf", "a", encoding="utf-8") as f:
        f.write("\n")
    size = sum(p.stat().st_size for p in (OUT / "meshes").iterdir())
    print(f"{len(done)} meshes, {faces} faces, {size / 1e6:.1f} MB -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Build the G1 model the Joints page draws: public/g1/g1.urdf + public/g1/meshes/*.STL.

The source is Unitree's own description package (g1_description: URDF + STL meshes). Its full
mesh set is ~100 MB and the variant we draw uses 31 MB of it — too heavy for a page that may
be opened over LTE. This keeps the VISUAL geometry only (collision meshes are for physics, the
page never uses them) and decimates every mesh to a face budget, so the result is a few MB.

WHICH VARIANT: it must match the robot's `mode_machine`, or the drawn joints are not the
robot's joints. Ours reports mode_machine 6 (read off rt/lf/lowstate by the telemetry reader on
2026-10-13), which g1_description's README maps to `g1_29dof_lock_waist_with_hand_rev_1_0`:
29 DoF with waist roll and pitch FIXED, plus the two Dex3-1 hands (7 joints each).

Run once, by hand, whenever the source package changes (needs: pip install trimesh
fast-simplification numpy):

    python3 scripts/build_g1_model.py /path/to/g1_description

It is a build step, not part of `bun run build`: the output is committed as a static asset.
"""
import argparse
import shutil
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

VARIANT = "g1_29dof_lock_waist_with_hand_rev_1_0"
# Faces kept per mesh. The torso and pelvis are the largest source meshes (~100k faces); a
# budget this size keeps every silhouette recognisable at the size the page draws them.
FACE_BUDGET = 2000
OUT = Path(__file__).resolve().parent.parent / "public" / "g1"


def simplify(src: Path, dst: Path) -> tuple[int, int]:
    import fast_simplification
    import trimesh

    mesh = trimesh.load(src, force="mesh")
    before = len(mesh.faces)
    if before > FACE_BUDGET:
        points, faces = fast_simplification.simplify(
            mesh.vertices, mesh.faces, target_reduction=1 - FACE_BUDGET / before)
        mesh = trimesh.Trimesh(points, faces, process=True)
    dst.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(dst, file_type="stl")       # binary STL: what three's STLLoader reads fastest
    return before, len(mesh.faces)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("description_dir", type=Path, help="the g1_description package directory")
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

    if OUT.exists():
        shutil.rmtree(OUT / "meshes", ignore_errors=True)
    total_before = total_after = 0
    done: dict[str, str] = {}
    for mesh_el in root.iter("mesh"):
        rel = mesh_el.get("filename", "")
        name = Path(rel).name
        if name not in done:
            before, after = simplify(args.description_dir / rel, OUT / "meshes" / name)
            total_before += before
            total_after += after
            done[name] = f"meshes/{name}"
        mesh_el.set("filename", done[name])

    ET.indent(tree)
    tree.write(OUT / "g1.urdf", encoding="utf-8", xml_declaration=True)
    # ElementTree ends the file without a newline; the end-of-file-fixer hook rejects that.
    with open(OUT / "g1.urdf", "a", encoding="utf-8") as f:
        f.write("\n")
    size = sum(p.stat().st_size for p in (OUT / "meshes").iterdir())
    print(f"{len(done)} meshes, {total_before} -> {total_after} faces, "
          f"{size / 1e6:.1f} MB -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

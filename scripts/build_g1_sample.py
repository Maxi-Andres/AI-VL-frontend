#!/usr/bin/env python3
"""Build public/g1/sample-walk.json: a real G1 walk the Joints page can replay with no robot.

The input is a capture of g1_telemetry_reader's NDJSON (robot-telemetry-agent) — the
robot:motors and robot:vitals events it prints. This keeps the joint angles (in the SDK's
29-DoF order, the order src/lib/g1Joints.ts expects) and the pelvis IMU, and cuts the window
with the most leg motion, so the replay shows the robot walking rather than standing.

The capture used for the committed file: 2026-10-13, ~55 s of walking forward, back and
turning on a flat floor, waist locked, read at 10 Hz on PC2. The telemetry reader does not read
the hands, so the replay has none.

    python3 scripts/build_g1_sample.py capture.ndjson [--seconds 40]
"""
import argparse
import json
import sys
from pathlib import Path

BODY = [
    "left_hip_pitch", "left_hip_roll", "left_hip_yaw", "left_knee",
    "left_ankle_pitch", "left_ankle_roll",
    "right_hip_pitch", "right_hip_roll", "right_hip_yaw", "right_knee",
    "right_ankle_pitch", "right_ankle_roll",
    "waist_yaw", "waist_roll", "waist_pitch",
    "left_shoulder_pitch", "left_shoulder_roll", "left_shoulder_yaw", "left_elbow",
    "left_wrist_roll", "left_wrist_pitch", "left_wrist_yaw",
    "right_shoulder_pitch", "right_shoulder_roll", "right_shoulder_yaw", "right_elbow",
    "right_wrist_roll", "right_wrist_pitch", "right_wrist_yaw",
]
LEGS = BODY[:12]
OUT = Path(__file__).resolve().parent.parent / "public" / "g1" / "sample-walk.json"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("capture", type=Path)
    ap.add_argument("--seconds", type=float, default=40.0)
    args = ap.parse_args()

    motors, vitals = [], []
    for raw in args.capture.read_text(encoding="utf-8").splitlines():
        try:
            ev = json.loads(raw)
        except ValueError:
            continue
        if ev.get("sourcetype") == "robot:motors":
            motors.append((ev["time"], ev["event"]))
        elif ev.get("sourcetype") == "robot:vitals" and "imu" in ev["event"]:
            vitals.append((ev["time"], ev["event"]["imu"]))
    if len(motors) < 20 or not vitals:
        print("error: the capture has too few robot:motors / robot:vitals events",
              file=sys.stderr)
        return 1

    rate = round((len(motors) - 1) / (motors[-1][0] - motors[0][0]))
    n = min(len(motors), int(args.seconds * rate))

    def motion(i):          # summed leg travel between consecutive samples
        a, b = motors[i][1], motors[i + 1][1]
        return sum(abs(a[j]["q"] - b[j]["q"]) for j in LEGS)

    steps = [motion(i) for i in range(len(motors) - 1)]
    best = max(range(len(motors) - n + 1), key=lambda s: sum(steps[s:s + n - 1]))

    frames, vi = [], 0
    for t, ev in motors[best:best + n]:
        while vi + 1 < len(vitals) and abs(vitals[vi + 1][0] - t) <= abs(vitals[vi][0] - t):
            vi += 1
        imu = vitals[vi][1]
        frames.append({
            "q": [round(ev[j]["q"], 4) for j in BODY],
            "imu": [round(imu["roll"], 4), round(imu["pitch"], 4), round(imu["yaw"], 4)],
        })

    OUT.write_text(json.dumps({
        "source": "G1 telemetry capture, 2026-10-13, walking on a flat floor, waist locked",
        "rate_hz": rate,
        "frames": frames,
    }, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(frames)} frames at {rate} Hz -> {OUT} ({OUT.stat().st_size / 1e3:.0f} kB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

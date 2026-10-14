import { useCallback, useEffect, useRef, useState } from "react";
import { IconPlayerStopFilled, IconVolume } from "@tabler/icons-react";
import { getRobotVolume, sayOnRobot, setRobotVolume, stopRobotAudio } from "../../api/backend";
import { Button } from "../ui/Button";
import { StatusText, type Status } from "../ui/StatusText";

const VOLUME_MAX = 10; // the Go2's own scale

/**
 * The Go2's own speaker: type something and the robot says it, stop it, and set its volume.
 *
 * Not gated by "Arm": nothing here moves the robot. The voice is the server's default Piper
 * voice, the same one the browser plays; the robot only plays the audio it is sent.
 */
export function RobotSpeaker({ robot }: { robot: string }) {
  const [text, setText] = useState("");
  const [volume, setVolume] = useState<number | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const commitTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const ctl = new AbortController();
    getRobotVolume(robot, ctl.signal)
      .then((r) => {
        if (r.ok && typeof r.volume === "number") setVolume(r.volume);
        else if (!ctl.signal.aborted) setStatus({ tone: "warn", text: r.error ?? "no volume" });
      })
      .catch(() => {
        /* aborted, or the backend is down: the slider just stays empty */
      });
    return () => {
      ctl.abort();
      window.clearTimeout(commitTimer.current);
    };
  }, [robot]);

  const say = useCallback(async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setStatus({ tone: "busy", text: "Sending to the robot…" });
    try {
      const r = await sayOnRobot(robot, t);
      setStatus(
        r.ok
          ? { tone: "ok", text: `Speaking (${(r.seconds ?? 0).toFixed(1)} s)` }
          : { tone: "error", text: r.error ?? "the robot did not take it" },
      );
    } catch (e) {
      setStatus({ tone: "error", text: `backend unreachable: ${String(e)}` });
    } finally {
      setBusy(false);
    }
  }, [robot, text]);

  const stop = useCallback(async () => {
    const r = await stopRobotAudio(robot).catch(() => null);
    setStatus(r?.ok ? { tone: "stopped", text: "Stopped" } : { tone: "error", text: r?.error ?? "stop failed" });
  }, [robot]);

  // The slider moves freely; the robot is told once it settles, not on every step.
  const changeVolume = useCallback(
    (level: number) => {
      setVolume(level);
      window.clearTimeout(commitTimer.current);
      commitTimer.current = window.setTimeout(async () => {
        const r = await setRobotVolume(robot, level).catch(() => null);
        if (!r?.ok) setStatus({ tone: "error", text: r?.error ?? "volume not set" });
      }, 250);
    },
    [robot],
  );

  return (
    <div className="mb-3 flex flex-col gap-1.5">
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void say();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type something for the robot to say…"
          className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 text-xs text-fg focus:border-accent focus:outline-none"
        />
        <Button
          type="submit"
          variant="secondary"
          className="px-2 py-1 text-[11px]"
          disabled={busy || !text.trim()}
        >
          Say
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="px-2 py-1 text-[11px]"
          title="Stop speaking"
          onClick={() => void stop()}
        >
          <IconPlayerStopFilled size={12} />
        </Button>
      </form>
      <label className="flex items-center gap-2 text-xs text-muted" title="Robot speaker volume">
        <IconVolume size={14} />
        <input
          type="range"
          min={0}
          max={VOLUME_MAX}
          step={1}
          value={volume ?? 0}
          disabled={volume === null}
          onChange={(e) => changeVolume(Number(e.target.value))}
          className="min-w-0 flex-1 accent-[var(--color-accent)]"
        />
        <span className="w-8 text-right tabular-nums">
          {volume === null ? "—" : `${volume}/${VOLUME_MAX}`}
        </span>
      </label>
      <StatusText status={status} className="text-xs text-muted" />
    </div>
  );
}

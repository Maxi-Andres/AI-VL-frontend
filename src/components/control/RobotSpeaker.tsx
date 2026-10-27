import { useCallback, useEffect, useState } from "react";
import { IconPlayerStopFilled, IconVolume } from "@tabler/icons-react";
import { sayOnRobot, stopRobotAudio } from "../../api/backend";
import { useRobotVolume } from "../../hooks/useRobotVolume";
import { serverVoiceName, useVoiceChoice, voiceLabel } from "../../lib/voiceChoice";
import { Button } from "../ui/Button";
import { StatusText, type Status } from "../ui/StatusText";
import { useT } from "../../i18n";

/**
 * The robot's own speaker: type something and the robot says it, stop it, and set its volume.
 *
 * Not gated by "Arm": nothing here moves the robot. The voice is the one picked on Live (shared
 * through lib/voiceChoice.ts); the server makes the audio and the robot only plays it. It used
 * to send no voice, so the robot always spoke with the server's default.
 */
export function RobotSpeaker({ robot }: { robot: string }) {
  const t = useT();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const { volume, max: volumeMax, error: volumeError, change: changeVolume } = useRobotVolume(robot);
  const [voiceChoice] = useVoiceChoice();
  const voice = serverVoiceName(voiceChoice);

  // The volume's own trouble (none reported, or not set) shows in the same status line.
  useEffect(() => {
    if (volumeError) setStatus({ tone: "warn", text: volumeError });
  }, [volumeError]);

  const say = useCallback(async () => {
    const said = text.trim();
    if (!said) return;
    setBusy(true);
    setStatus({ tone: "busy", text: t("Sending to the robot…") });
    try {
      const r = await sayOnRobot(robot, said, voice);
      setStatus(
        r.ok
          ? { tone: "ok", text: t("Speaking ({s} s)", { s: (r.seconds ?? 0).toFixed(1) }) }
          : { tone: "error", text: r.error ?? t("the robot did not take it") },
      );
    } catch (e) {
      setStatus({ tone: "error", text: t("backend unreachable: {error}", { error: String(e) }) });
    } finally {
      setBusy(false);
    }
  }, [robot, text, voice, t]);

  const stop = useCallback(async () => {
    const r = await stopRobotAudio(robot).catch(() => null);
    setStatus(r?.ok ? { tone: "stopped", text: t("Stopped") } : { tone: "error", text: r?.error ?? t("stop failed") });
  }, [robot, t]);

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
          placeholder={t("Type something for the robot to say…")}
          className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 text-xs text-fg focus:border-accent focus:outline-none"
        />
        <Button
          type="submit"
          variant="secondary"
          className="px-2 py-1 text-[11px]"
          disabled={busy || !text.trim()}
        >
          {t("Say")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="px-2 py-1 text-[11px]"
          title={t("Stop speaking")}
          onClick={() => void stop()}
        >
          <IconPlayerStopFilled size={12} />
        </Button>
      </form>
      <label className="flex items-center gap-2 text-xs text-muted" title={t("Robot speaker volume")}>
        <IconVolume size={14} />
        <input
          type="range"
          min={0}
          max={volumeMax}
          step={volumeMax > 10 ? 5 : 1}
          value={volume ?? 0}
          disabled={volume === null}
          onChange={(e) => changeVolume(Number(e.target.value))}
          className="min-w-0 flex-1 accent-[var(--color-accent)]"
        />
        <span className="w-12 text-right tabular-nums">
          {volume === null ? "—" : `${volume}/${volumeMax}`}
        </span>
      </label>
      <p className="m-0 text-[11px] text-muted">
        {voice
          ? t("Voice: {voice} · pick it on Live", { voice: voiceLabel(voice) })
          : t("Voice: the server's default · pick it on Live")}
      </p>
      <StatusText status={status} className="text-xs text-muted" />
    </div>
  );
}

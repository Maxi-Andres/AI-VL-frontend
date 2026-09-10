import { useCallback, useEffect, useRef, useState } from "react";
import { getRobotVideo, setRobotVideo } from "../api/backend";
import type { RobotVideoState } from "../api/backend";
import { useRobot } from "../components/layout/RobotContext";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { NumberField } from "../components/ui/NumberField";
import { StatusText, type Status } from "../components/ui/StatusText";

/** The knobs, in the order they matter for latency. */
const KNOBS = [
  {
    key: "fps" as const,
    label: "Frame cap",
    unit: "fps",
    step: 1,
    hint: "0 = every frame the robot produces. The cap is applied PER VIEWER, so it also " +
      "throttles the bridge that feeds this app. Lower = less bandwidth, but you see the " +
      "robot less often: at 5 fps you are looking at a picture up to 200 ms old.",
  },
  {
    key: "width" as const,
    label: "Downscale to",
    unit: "px wide",
    step: 160,
    hint: "0 = native 1920, forwarded untouched with no decode. Anything else makes the " +
      "Jetson decode, resize and re-encode every frame — measured at ~100 ms per frame, " +
      "which lands straight in the latency you steer by. Only worth it on a slow link.",
  },
  {
    key: "quality" as const,
    label: "JPEG quality",
    unit: "",
    step: 5,
    hint: "Only has any effect while Downscale is above 0: at native size the bytes are " +
      "never re-encoded, so there is nothing to set the quality of.",
  },
];

const POLL_MS = 4000;

/**
 * Tune the robot's LIVE video without SSH.
 *
 * WHY THIS PAGE EXISTS: these values decide the trade-off between latency and bandwidth,
 * and the right ones differ per link — cable, LTE, Starlink. Finding them used to mean an
 * SSH session, an editor, and a service restart per attempt, so in practice nobody tried.
 * Everything here applies to the running publisher with NO restart and no gap in the
 * stream, which is what makes it usable while someone is actually driving.
 *
 * Applying and saving are deliberately separate: you try many values and keep one.
 */
export function VideoTuningPage() {
  const { robot } = useRobot();
  const [state, setState] = useState<RobotVideoState | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  // While the user is dragging, the poll must not yank the control out from under them.
  const editingRef = useRef(false);

  /** Poll-safe: refreshes what the robot reports, never the fields being edited.
   * `NetworkControls` learned this the hard way — polling into inputs overwrites what
   * the operator is doing mid-gesture. With sliders it is worse: the handle jumps. */
  const loadStatus = useCallback(
    (signal?: AbortSignal) => {
      getRobotVideo(robot, signal)
        .then((s) => {
          if (signal?.aborted) return;
          setState(s);
        })
        .catch(() => {});
    },
    [robot],
  );

  /** Mount and robot-change only: seeds the editable fields from the robot. */
  const loadConfig = useCallback(
    (signal?: AbortSignal) => {
      getRobotVideo(robot, signal)
        .then((s) => {
          if (signal?.aborted) return;
          setState(s);
          const r = s.running ?? {};
          setDraft({
            fps: r.fps ?? 0,
            width: r.width ?? 0,
            quality: r.quality ?? 75,
          });
        })
        .catch(() => {});
    },
    [robot],
  );

  useEffect(() => {
    const ac = new AbortController();
    loadConfig(ac.signal);
    const t = setInterval(() => {
      if (!editingRef.current) loadStatus(ac.signal);
    }, POLL_MS);
    return () => {
      ac.abort();
      clearInterval(t);
    };
  }, [loadConfig, loadStatus]);

  const apply = async (persist: boolean) => {
    setBusy(true);
    setStatus({ tone: "busy", text: persist ? "Saving…" : "Applying…" });
    const res = await setRobotVideo({ robot, ...draft, persist }).catch((e) => ({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }));
    setBusy(false);
    if (res.ok) {
      setStatus({
        tone: "ok",
        text: persist ? "Applied and saved to the robot" : "Applied (not saved)",
      });
      loadStatus();
    } else {
      setStatus({ tone: "error", text: res.error ?? "the robot refused it" });
    }
  };

  const running = state?.running ?? {};
  const saved = state?.saved ?? {};
  const limits = state?.limits ?? {};
  const reachable = state?.ok !== false;

  return (
    <main className="mx-auto max-w-3xl p-6 leading-relaxed">
      <h2 className="mt-0 text-lg font-semibold">Video tuning — {robot}</h2>
      <p className="mb-1 text-sm text-muted">
        Applies to the running publisher immediately: no restart, no gap in the stream.
        These are the knobs that trade latency against bandwidth, and the right values are
        different on cable and on LTE.
      </p>

      {!reachable && (
        <p className="text-amber-500">
          The robot is not answering: {state?.error ?? "unknown error"}. Check that the
          command transport is set to <strong>relay</strong> on the Robot page.
        </p>
      )}

      <section className="mt-4 flex flex-col gap-4">
        {KNOBS.map(({ key, label, unit, step, hint }) => {
          const lim = limits[key] ?? { min: 0, max: 100 };
          const value = draft[key] ?? 0;
          const live = running[key];
          const savedRaw = saved[key];
          // Running vs saved are genuinely different things: the file can hold a value the
          // publisher has never read. Say so rather than showing one number and implying
          // both — that ambiguity is exactly why /health reads /proc instead of the file.
          const drifted =
            savedRaw !== undefined && savedRaw !== null &&
            String(live) !== String(parseFloat(savedRaw));
          return (
            <div key={key}>
              <Field
                label={
                  <>
                    {label}{" "}
                    <span className="text-fg">
                      {value}
                      {unit && ` ${unit}`}
                    </span>
                  </>
                }
              >
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={lim.min}
                    max={lim.max}
                    step={step}
                    value={value}
                    disabled={!reachable}
                    onPointerDown={() => (editingRef.current = true)}
                    onPointerUp={() => (editingRef.current = false)}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [key]: parseFloat(e.target.value) }))
                    }
                    className="w-full"
                  />
                  <NumberField
                    value={value}
                    min={lim.min}
                    max={lim.max}
                    step={step}
                    disabled={!reachable}
                    onFocus={() => (editingRef.current = true)}
                    onBlur={() => (editingRef.current = false)}
                    onValueChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
                  />
                </div>
              </Field>
              <p className="mb-1 mt-1 text-xs text-muted">{hint}</p>
              <p className="text-xs text-muted">
                running: <span className="text-fg">{String(live ?? "?")}</span>
                {savedRaw !== undefined && savedRaw !== null && (
                  <>
                    {" · "}saved: <span className="text-fg">{savedRaw}</span>
                    {drifted && (
                      <span className="text-amber-500">
                        {" "}— differs; the saved value applies on the next restart
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
          );
        })}
      </section>

      <div className="mt-5 flex items-center gap-2.5">
        <Button variant="primary" disabled={busy || !reachable} onClick={() => apply(false)}>
          Apply
        </Button>
        <Button variant="secondary" disabled={busy || !reachable} onClick={() => apply(true)}>
          Apply and save
        </Button>
        <StatusText status={status} />
      </div>
      <p className="mt-2 text-xs text-muted">
        <strong>Apply</strong> changes the running publisher only — a restart of the robot's
        video service brings the saved values back. <strong>Apply and save</strong> also
        writes the robot's <code>video.env</code>.
      </p>
    </main>
  );
}

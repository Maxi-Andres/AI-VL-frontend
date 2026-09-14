import { useCallback, useEffect, useRef, useState } from "react";
import { getRobotVideo, setRobotVideo } from "../api/backend";
import type { RobotVideoState } from "../api/backend";
import { useRobot } from "../components/layout/RobotContext";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { NumberField } from "../components/ui/NumberField";
import { StatusText, type Status } from "../components/ui/StatusText";

/** The knobs, in the order they matter for latency.
 *  `live` here is only the DEFAULT ordering hint — the robot is the authority and
 *  reports it in `limits[key].live`.
 *
 *  `kind` decides the CONTROL, and it is not cosmetic: "Feed the recorder" is on/off, and
 *  rendering it as a slider asked the operator to drag a handle between two positions to
 *  express a yes/no. With the robot unreachable it was worse — the range fell back to a
 *  generic 0-100, so an on/off knob offered a hundred settings, 98 of which are invalid.
 *
 *  `fallback` replaces that generic range. It MIRRORS the relay's VIDEO_PARAMS table
 *  (robot-command-relay/relay_server.py) and is only used until the robot answers — the
 *  robot stays the authority. A wrong range is not a cosmetic problem here: it is the UI
 *  telling the operator a value is settable when the robot will reject it.
 *
 *  `step` has to divide the range from `min`, or legal values become unreachable. Measured
 *  against this very table: quality ran min 1 step 5, so the slider could offer 1, 6, 11 …
 *  and never 75 — the robot's own default. idr ran min 1 step 15 and could never offer 15,
 *  the value actually running. A control that cannot express the current state is worse
 *  than no control. */
const KNOBS = [
  {
    key: "fps" as const,
    kind: "range" as const,
    fallback: { min: 0, max: 60 },
    label: "Frame cap",
    unit: "fps",
    step: 1,
    hint: "0 = every frame the robot produces. The cap is applied PER VIEWER, so it also " +
      "throttles the bridge that feeds this app. Lower = less bandwidth, but you see the " +
      "robot less often: at 5 fps you are looking at a picture up to 200 ms old.",
  },
  {
    key: "width" as const,
    kind: "range" as const,
    fallback: { min: 0, max: 1920 },
    label: "Downscale to",
    unit: "px wide",
    step: 160,
    hint: "0 = native 1920, forwarded untouched with no decode. Anything else makes the " +
      "Jetson decode, resize and re-encode every frame — measured at ~100 ms per frame, " +
      "which lands straight in the latency you steer by. Only worth it on a slow link.",
  },
  {
    key: "quality" as const,
    kind: "range" as const,
    fallback: { min: 1, max: 100 },
    label: "JPEG quality",
    unit: "",
    step: 1,
    hint: "Only has any effect while Downscale is above 0: at native size the bytes are " +
      "never re-encoded, so there is nothing to set the quality of.",
  },
  {
    key: "nvr" as const,
    kind: "toggle" as const,
    fallback: { min: 0, max: 1 },
    label: "Feed the recorder",
    unit: "",
    step: 1,
    hint: "The recording branch sends the SAME picture a second time, as H.264 over RTMP. " +
      "On a constrained link that is what starves the live view — it already did once. " +
      "Turn it off to hand the whole uplink to the view you steer by.",
  },
  {
    key: "bitrate" as const,
    kind: "range" as const,
    fallback: { min: 200000, max: 8000000 },
    label: "Recorder bitrate",
    unit: "bps",
    step: 100000,
    hint: "H.264 bitrate for the recording branch only; the live view never passes " +
      "through it. The floor exists because this sat at 60000 — 60 kbps for 1080p, a " +
      "missing zero nobody caught.",
  },
  {
    key: "maxfps" as const,
    kind: "range" as const,
    fallback: { min: 0, max: 30 },
    label: "Capture cap",
    unit: "fps",
    step: 1,
    hint: "How fast the robot polls its own camera. 0 = as fast as it answers (~10 fps). " +
      "This is upstream of everything, so lowering it lowers both branches at once.",
  },
  {
    key: "idr" as const,
    kind: "range" as const,
    fallback: { min: 1, max: 300 },
    label: "Keyframe interval",
    unit: "frames",
    step: 1,
    hint: "Recording branch only. Lower = a new viewer starts sooner, at more bitrate.",
  },
];

/** Which knobs the robot applies without a restart, when it has not told us yet. The
 *  robot is the authority (`limits[key].live`); this is only the pre-load fallback. */
const LIVE_BY_DEFAULT = new Set(["fps", "width", "quality"]);

const SECTIONS = [
  {
    liveSection: true,
    title: "Applies immediately",
    note: "Takes effect on the running publisher with no restart and no gap in the " +
      "stream. Safe to move while someone is driving.",
  },
  {
    liveSection: false,
    title: "Needs a restart of the video service",
    note: "⚠ These are read by the GStreamer pipeline when it starts, so they can only " +
      "be SAVED here — they take effect the next time the robot's video service " +
      "restarts, which costs a few seconds of black screen. Do not change these while " +
      "someone is driving.",
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
  // Which knobs this robot's relay actually reports. Anything outside it is unknown, not 0.
  const [known, setKnown] = useState<Set<string>>(new Set());
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
          // Live knobs seed from what is RUNNING; restart-only ones have no running
          // value to read, so they seed from the file.
          const r = (s.running ?? {}) as Record<string, number | undefined>;
          const sv = s.saved ?? {};
          const next: Record<string, number> = {};
          const seen = new Set<string>();
          for (const { key } of KNOBS) {
            const fromFile = sv[key] !== undefined && sv[key] !== null
              ? parseFloat(sv[key] as string) : NaN;
            const value = r[key] ?? (Number.isFinite(fromFile) ? fromFile : undefined);
            // A knob this robot never mentioned gets NO value. Defaulting it to 0 is how
            // "Feed the recorder" came to read `off` on a robot that was recording: the
            // relay deployed there is an older build that reports only fps/width/quality,
            // and the page turned that silence into a confident answer. An unknown knob is
            // shown as unknown and cannot be moved — its relay would reject it anyway.
            if (value !== undefined) {
              next[key] = value;
              seen.add(key);
            }
          }
          setDraft(next);
          setKnown(seen);
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
    // Without persist, send ONLY the live knobs: the robot refuses restart-only ones that
    // are not being saved, because writing nowhere and doing nothing is a control that
    // lies. Sending them here would just turn every plain Apply into an error.
    const body: Record<string, number> = {};
    for (const { key } of KNOBS) {
      if ((persist || isLive(key)) && draft[key] !== undefined) body[key] = draft[key];
    }
    const res = await setRobotVideo({ robot, ...body, persist }).catch((e) => ({
      ok: false,
      pending_restart: undefined as string[] | undefined,
      error: e instanceof Error ? e.message : String(e),
    }));
    setBusy(false);
    if (res.ok) {
      const waiting = res.pending_restart ?? [];
      setStatus({
        tone: waiting.length ? "warn" : "ok",
        text: waiting.length
          ? `Saved. ${waiting.join(", ")} apply when the video service restarts`
          : persist ? "Applied and saved to the robot" : "Applied (not saved)",
      });
      loadStatus();
    } else {
      setStatus({ tone: "error", text: res.error ?? "the robot refused it" });
    }
  };

  /** The robot decides; fall back to the local set until it has answered. */
  const isLive = (key: string) =>
    limits[key]?.live ?? LIVE_BY_DEFAULT.has(key);

  // Indexed by knob name across ALL knobs, not just the three the robot reports live
  // values for: a restart-only knob genuinely has no running value, and `undefined` is
  // the honest answer the render already handles.
  const running = (state?.running ?? {}) as Record<string, number | undefined>;
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

      {SECTIONS.map(({ liveSection, title, note }) => {
        const knobs = KNOBS.filter((k) => isLive(k.key) === liveSection);
        if (!knobs.length) return null;
        return (
          <section key={title} className="mt-5">
            <h3 className="mb-1 text-base font-semibold">{title}</h3>
            <p className={`mb-3 text-xs ${liveSection ? "text-muted" : "text-amber-500"}`}>
              {note}
            </p>
            <div className="flex flex-col gap-4">
              {knobs.map(({ key, kind, fallback, label, unit, step, hint }) => {
                // The robot is the authority; `fallback` only covers the window before it
                // answers, and it mirrors the relay's own table rather than inventing a range.
                const lim = limits[key] ?? fallback;
                const isKnown = known.has(key);
                const value = draft[key] ?? 0;
                const editable = reachable && isKnown;
                const runningValue = running[key];
                const savedRaw = saved[key];
                // Running and saved are genuinely different things: the file can hold a
                // value the publisher has never read. Saying only one of them is how this
                // report used to lie, which is why /health reads /proc and not the file.
                const drifted =
                  runningValue !== undefined && savedRaw !== undefined &&
                  savedRaw !== null &&
                  String(runningValue) !== String(parseFloat(savedRaw));
                return (
                  <div key={key}>
                    <Field
                      label={
                        <>
                          {label}{" "}
                          <span className="text-fg">
                            {!isKnown
                              ? "unknown"
                              : kind === "toggle"
                                ? value ? "on" : "off"
                                : value}
                            {isKnown && kind !== "toggle" && unit ? ` ${unit}` : ""}
                          </span>
                        </>
                      }
                    >
                      {kind === "toggle" ? (
                        <div className="flex items-center gap-2">
                          <Button
                            variant={isKnown && !value ? "primary" : "secondary"}
                            disabled={!editable}
                            onClick={() => setDraft((d) => ({ ...d, [key]: 0 }))}
                          >
                            Off
                          </Button>
                          <Button
                            variant={isKnown && value ? "primary" : "secondary"}
                            disabled={!editable}
                            onClick={() => setDraft((d) => ({ ...d, [key]: 1 }))}
                          >
                            On
                          </Button>
                        </div>
                      ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={lim.min}
                          max={lim.max}
                          step={step}
                          value={value}
                          disabled={!editable}
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
                          disabled={!editable}
                          onFocus={() => (editingRef.current = true)}
                          onBlur={() => (editingRef.current = false)}
                          onValueChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
                        />
                      </div>
                      )}
                    </Field>
                    <p className="mb-1 mt-1 text-xs text-muted">{hint}</p>
                    {!isKnown && (
                      <p className="mb-1 text-xs text-amber-500">
                        This robot does not report it — its relay is an older build that
                        only knows the frame cap, the downscale and the quality. Nothing is
                        shown because nothing is known; update the relay to tune it here.
                      </p>
                    )}
                    <p className="text-xs text-muted">
                      {runningValue !== undefined && (
                        <>running: <span className="text-fg">{String(runningValue)}</span>{" · "}</>
                      )}
                      saved: <span className="text-fg">{savedRaw ?? "unset"}</span>
                      {drifted && (
                        <span className="text-amber-500">
                          {" "}— differs from what is running; applies on the next restart
                        </span>
                      )}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

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

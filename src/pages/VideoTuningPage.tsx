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
  // --- Drive view: what Drive shows -----------------------------------------------------
  {
    key: "h264_qp" as const,
    kind: "range" as const,
    fallback: { min: 10, max: 51 },
    label: "Drive quality",
    unit: "QP",
    step: 1,
    options: [] as number[],
    hint: "Lower = sharper and more bytes per frame. Measured on the Go2 over LTE: QP 40 at " +
      "480×270 ≈ 3 kB a frame (0.34 Mbps), QP 38 at 640×360 ≈ 6 kB (0.6-0.7 Mbps), latency " +
      "unchanged. Every frame stands alone, so a lost one costs one picture, never a freeze.",
  },
  {
    key: "h264_width" as const,
    kind: "choice" as const,
    fallback: { min: 64, max: 1920 },
    label: "Drive size",
    unit: "px wide",
    step: 1,
    // Fixed choices, not a slider: 64-1920 in any step skips the sizes that matter.
    options: [320, 480, 640, 854, 960, 1280],
    hint: "16:9; the robot sets the height to match (640 → 640×360). Bigger costs bytes at " +
      "the same quality — raise the size or lower the QP, rarely both on LTE.",
  },
  // --- Recorder: the full-size stream Frigate records, and YOLO/VLM read ------------------
  {
    key: "bitrate" as const,
    kind: "range" as const,
    fallback: { min: 200000, max: 8000000 },
    label: "Recorder bitrate",
    unit: "bps",
    step: 100000,
    options: [] as number[],
    hint: "H.264 over SRT, the stream Frigate records and the camera bridge re-reads for YOLO " +
      "and the VLM. 1.3 Mbps holds over LTE because this machine's SRT receiver waits 900 ms " +
      "to repair losses (srt-bridge.service); at 150 ms the same bitrate dropped 10-15% of " +
      "packets and the recording broke into blocks and drifted purple.",
  },
  {
    key: "idr" as const,
    kind: "range" as const,
    fallback: { min: 1, max: 300 },
    label: "Recorder keyframe interval",
    unit: "frames",
    step: 1,
    options: [] as number[],
    hint: "Lower = a damaged picture heals sooner and a new viewer starts sooner, at more " +
      "bitrate. A keyframe is ~22 packets at 1080p; one lost and the picture is wrong until " +
      "the next one.",
  },
  {
    key: "nvr" as const,
    kind: "toggle" as const,
    fallback: { min: 0, max: 1 },
    label: "Feed the recorder",
    unit: "",
    step: 1,
    options: [] as number[],
    hint: "Off stops the SRT stream entirely: nothing recorded, and no picture for YOLO and " +
      "the VLM on the Go2 (its camera bridge reads this stream). Drive is unaffected — it has " +
      "its own stream.",
  },
  {
    key: "maxfps" as const,
    kind: "range" as const,
    fallback: { min: 0, max: 30 },
    label: "Capture cap",
    unit: "fps",
    step: 1,
    options: [] as number[],
    hint: "How fast the robot takes pictures from its camera, upstream of every stream. 0 = " +
      "every new frame the camera makes (~14 fps on the Go2).",
  },
  // --- MJPEG: the robot's JPEG server, port 8093 ------------------------------------------
  {
    key: "fps" as const,
    kind: "range" as const,
    fallback: { min: 0, max: 60 },
    label: "MJPEG frame cap",
    unit: "fps",
    step: 1,
    options: [] as number[],
    hint: "0 = every frame. Applied per viewer.",
  },
  {
    key: "width" as const,
    kind: "range" as const,
    fallback: { min: 0, max: 1920 },
    label: "MJPEG downscale to",
    unit: "px wide",
    step: 160,
    options: [] as number[],
    hint: "0 = native, forwarded untouched. Anything else costs the robot a decode and " +
      "re-encode per frame.",
  },
  {
    key: "quality" as const,
    kind: "range" as const,
    fallback: { min: 1, max: 100 },
    label: "MJPEG quality",
    unit: "",
    step: 1,
    options: [] as number[],
    hint: "Only matters while the downscale is above 0: at native size nothing is re-encoded.",
  },
];

/** Which knobs the robot applies without a restart, when it has not told us yet. The
 *  robot is the authority (`limits[key].live`); this is only the pre-load fallback. */
const LIVE_BY_DEFAULT = new Set(["fps", "width", "quality", "h264_qp", "h264_width"]);

/** Grouped by STREAM, not by live/restart: the operator thinks "Drive looks bad" or "the
 *  recording is broken", and each knob carries its own live/restart tag. */
const GROUPS: { title: string; keys: string[]; note: (robot: string) => string }[] = [
  {
    title: "Drive view",
    keys: ["h264_qp", "h264_width"],
    note: () => "The all-intra stream Drive shows, over UDP. Both apply to the running " +
      "stream immediately — safe to move while someone is driving.",
  },
  {
    title: "Recorder",
    keys: ["bitrate", "idr", "nvr", "maxfps"],
    note: () => "The full-size stream, over SRT. Read when the video service starts, so " +
      "these only take effect after a restart — a few seconds of black on every stream. " +
      "Not while someone is driving.",
  },
  {
    title: "MJPEG",
    keys: ["fps", "width", "quality"],
    note: (robot) => robot === "go2"
      ? "Nothing reads it on the Go2 any more (Drive uses the stream above, the camera bridge " +
        "the recorder), so these change nothing you see."
      : "What the camera bridge reads on this robot — YOLO's and the VLM's picture.",
  },
];

const POLL_MS = 4000;

/**
 * Tune the robot's LIVE video without SSH.
 *
 * WHY THIS PAGE EXISTS: these values decide the trade-off between latency and bandwidth,
 * and the right ones differ per link — cable, LTE, Starlink. Finding them used to mean an
 * SSH session, an editor, and a service restart per attempt, so in practice nobody tried.
 * The drive-view and MJPEG knobs apply to the running publisher with NO restart and no gap,
 * which is what makes them usable while someone is driving; the recorder's need a restart,
 * and each knob says which (the robot reports it, `limits[key].live`).
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
   * `ConnectionSettings` learned this the hard way — polling into inputs overwrites what
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
        The robot&apos;s video knobs, by stream. The right values differ on cable, LTE and
        Starlink, which is why they are here and not behind SSH. Each knob says whether it
        applies now or needs a restart of the robot&apos;s video service.
      </p>

      {!reachable && (
        <p className="text-amber-500">
          The robot is not answering: {state?.error ?? "unknown error"}. Check that the
          command transport is set to <strong>relay</strong> on the Robot page.
        </p>
      )}

      {GROUPS.map(({ title, keys, note }) => {
        const knobs = KNOBS.filter((k) => keys.includes(k.key));
        return (
          <section key={title} className="mt-5">
            <h3 className="mb-1 text-base font-semibold">{title}</h3>
            <p className="mb-3 text-xs text-muted">{note(robot)}</p>
            <div className="flex flex-col gap-4">
              {knobs.map(({ key, kind, fallback, label, unit, step, options, hint }) => {
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
                          </span>{" "}
                          <span className={`text-[11px] ${isLive(key) ? "text-emerald-500" : "text-amber-500"}`}>
                            {isLive(key) ? "· applies now" : "· needs a restart"}
                          </span>
                        </>
                      }
                    >
                      {kind === "choice" ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {options.map((o) => (
                            <Button
                              key={o}
                              variant={isKnown && value === o ? "primary" : "secondary"}
                              disabled={!editable}
                              onClick={() => setDraft((d) => ({ ...d, [key]: o }))}
                            >
                              {o}
                            </Button>
                          ))}
                        </div>
                      ) : kind === "toggle" ? (
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

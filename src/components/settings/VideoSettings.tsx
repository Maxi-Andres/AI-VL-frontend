import { useCallback, useEffect, useRef, useState } from "react";
import { getRobotVideo, setRobotVideo } from "../../api/backend";
import type { RobotVideoState } from "../../api/backend";
import { useRobot } from "../layout/RobotContext";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { NumberField } from "../ui/NumberField";
import { StatusText, type Status } from "../ui/StatusText";
import { msg, useT } from "../../i18n";
import { rich } from "../../i18n/rich";

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
 *  Labels, units and hints are marked msg() here and translated with t() where drawn.
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
    label: msg("Drive quality"),
    unit: "QP",
    step: 1,
    options: [] as number[],
    hint: msg("Lower = sharper and more bytes per frame. Measured on the Go2 over LTE: QP 40 at 480×270 ≈ 3 kB a frame (0.34 Mbps), QP 38 at 640×360 ≈ 6 kB (0.6-0.7 Mbps), latency unchanged. Every frame stands alone, so a lost one costs one picture, never a freeze."),
  },
  {
    key: "h264_width" as const,
    kind: "choice" as const,
    fallback: { min: 64, max: 1920 },
    label: msg("Drive size"),
    unit: msg("px wide"),
    step: 1,
    // Fixed choices, not a slider: 64-1920 in any step skips the sizes that matter.
    options: [320, 480, 640, 854, 960, 1280],
    hint: msg("16:9; the robot sets the height to match (640 → 640×360). Bigger costs bytes at the same quality — raise the size or lower the QP, rarely both on LTE."),
  },
  // --- Recorder: the full-size stream Frigate records, and YOLO/VLM read ------------------
  {
    key: "bitrate" as const,
    kind: "range" as const,
    fallback: { min: 200000, max: 8000000 },
    label: msg("Recorder bitrate"),
    unit: "bps",
    step: 100000,
    options: [] as number[],
    hint: msg("H.264 over SRT, the stream Frigate records and the camera bridge re-reads for YOLO and the VLM. 1.3 Mbps holds over LTE because this machine's SRT receiver waits 900 ms to repair losses (srt-bridge.service); at 150 ms the same bitrate dropped 10-15% of packets and the recording broke into blocks and drifted purple."),
  },
  {
    key: "idr" as const,
    kind: "range" as const,
    fallback: { min: 1, max: 300 },
    label: msg("Recorder keyframe interval"),
    unit: msg("frames"),
    step: 1,
    options: [] as number[],
    hint: msg("Lower = a damaged picture heals sooner and a new viewer starts sooner, at more bitrate. A keyframe is ~22 packets at 1080p; one lost and the picture is wrong until the next one."),
  },
  {
    key: "nvr" as const,
    kind: "toggle" as const,
    fallback: { min: 0, max: 1 },
    label: msg("Feed the recorder"),
    unit: "",
    step: 1,
    options: [] as number[],
    hint: msg("Off stops the SRT stream entirely: nothing recorded, and no picture for YOLO and the VLM on the Go2 (its camera bridge reads this stream). Drive is unaffected — it has its own stream."),
  },
  {
    key: "maxfps" as const,
    kind: "range" as const,
    fallback: { min: 0, max: 30 },
    label: msg("Capture cap"),
    unit: "fps",
    step: 1,
    options: [] as number[],
    hint: msg("How fast the robot takes pictures from its camera, upstream of every stream. 0 = every new frame the camera makes (~14 fps on the Go2)."),
  },
  // --- MJPEG: the robot's JPEG server, port 8093 ------------------------------------------
  {
    key: "fps" as const,
    kind: "range" as const,
    fallback: { min: 0, max: 60 },
    label: msg("MJPEG frame cap"),
    unit: "fps",
    step: 1,
    options: [] as number[],
    hint: msg("0 = every frame. Applied per viewer."),
  },
  {
    key: "width" as const,
    kind: "range" as const,
    fallback: { min: 0, max: 1920 },
    label: msg("MJPEG downscale to"),
    unit: msg("px wide"),
    step: 160,
    options: [] as number[],
    hint: msg("0 = native, forwarded untouched. Anything else costs the robot a decode and re-encode per frame."),
  },
  {
    key: "quality" as const,
    kind: "range" as const,
    fallback: { min: 1, max: 100 },
    label: msg("MJPEG quality"),
    unit: "",
    step: 1,
    options: [] as number[],
    hint: msg("Only matters while the downscale is above 0: at native size nothing is re-encoded."),
  },
];

/** Which knobs the robot applies without a restart, when it has not told us yet. The
 *  robot is the authority (`limits[key].live`); this is only the pre-load fallback. */
const LIVE_BY_DEFAULT = new Set(["fps", "width", "quality", "h264_qp", "h264_width"]);

/** Grouped by STREAM, not by live/restart: the operator thinks "Drive looks bad" or "the
 *  recording is broken", and each knob carries its own live/restart tag. The title is also
 *  the section's `data-nav` identifier, so it stays English; it is translated where shown. */
const GROUPS: { title: string; keys: string[]; note: (robot: string) => string }[] = [
  {
    title: msg("Drive view"),
    keys: ["h264_qp", "h264_width"],
    note: () => msg("The all-intra stream Drive shows, over UDP. Both apply to the running stream immediately — safe to move while someone is driving."),
  },
  {
    title: msg("Recorder"),
    keys: ["bitrate", "idr", "nvr", "maxfps"],
    note: () => msg("The full-size stream, over SRT. Read when the video service starts, so these only take effect after a restart — a few seconds of black on every stream. Not while someone is driving."),
  },
  {
    title: msg("MJPEG"),
    keys: ["fps", "width", "quality"],
    note: (robot) => robot === "go2"
      ? msg("Nothing reads it on the Go2 any more (Drive uses the stream above, the camera bridge the recorder), so these change nothing you see.")
      : msg("What the camera bridge reads on this robot — YOLO's and the VLM's picture."),
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
export function VideoSettings() {
  const t = useT();
  const { robot } = useRobot();
  const [state, setState] = useState<RobotVideoState | null>(null);
  const [draft, setDraft] = useState<Record<string, number>>({});
  // The values as the robot gave them: what "changed" is measured against, so the save bar
  // shows only once something was actually moved.
  const [seed, setSeed] = useState<Record<string, number>>({});
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
          setSeed(next);
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
    setStatus({ tone: "busy", text: persist ? t("Saving…") : t("Applying…") });
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
          ? t("Saved. {keys} apply when the video service restarts", { keys: waiting.join(", ") })
          : persist ? t("Applied and saved to the robot") : t("Applied (not saved)"),
      });
      setSeed(draft); // what is on the robot now: nothing left to apply
      loadStatus();
      // The result stays a moment, then the bar goes with nothing left to do.
      window.setTimeout(() => setStatus((st) => (st && st.tone !== "error" && st.tone !== "busy" ? null : st)), 2500);
    } else {
      setStatus({ tone: "error", text: res.error ?? t("the robot refused it") });
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
  const changed = Object.keys(draft).filter((k) => draft[k] !== seed[k]);

  return (
    <div className="grid gap-4 leading-relaxed">
      <section data-nav={msg("Video tuning")} className="scroll-mt-4 rounded-2xl border border-line bg-panel p-5 shadow-card">
      <h3 className="m-0 mb-2 text-[15px] font-extrabold text-fg">{t("Video tuning — {robot}", { robot })}</h3>
      <p className="m-0 text-sm text-muted">
        {t("The robot's video knobs, by stream. The right values differ on cable, LTE and Starlink, which is why they are here and not behind SSH. Each knob says whether it applies now or needs a restart of the robot's video service.")}
      </p>

      {!reachable && (
        <p className="mt-3 mb-0 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-fg">
          {rich(t("The robot is not answering: {error}. Check that the command transport is set to {relay} under Connection.",
            { error: state?.error ?? t("unknown error") }), { relay: <strong>relay</strong> })}
        </p>
      )}
      </section>

      {GROUPS.map(({ title, keys, note }) => {
        const knobs = KNOBS.filter((k) => keys.includes(k.key));
        return (
          <section key={title} data-nav={title} className="scroll-mt-4 rounded-2xl border border-line bg-panel p-5 shadow-card">
            <h3 className="m-0 mb-2 text-[15px] font-extrabold text-fg">{t(title)}</h3>
            <p className="mb-3 text-xs text-muted">{t(note(robot))}</p>
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
                          {t(label)}{" "}
                          <span className="text-fg">
                            {!isKnown
                              ? t("unknown")
                              : kind === "toggle"
                                ? value ? t("on") : t("off")
                                : value}
                            {isKnown && kind !== "toggle" && unit ? ` ${t(unit)}` : ""}
                          </span>{" "}
                          <span className={`text-[11px] ${isLive(key) ? "text-emerald-500" : "text-amber-500"}`}>
                            {isLive(key) ? t("· applies now") : t("· needs a restart")}
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
                            {t("Off")}
                          </Button>
                          <Button
                            variant={isKnown && value ? "primary" : "secondary"}
                            disabled={!editable}
                            onClick={() => setDraft((d) => ({ ...d, [key]: 1 }))}
                          >
                            {t("On")}
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
                    <p className="mb-1 mt-1 text-xs text-muted">{t(hint)}</p>
                    {!isKnown && (
                      <p className="mb-1 text-xs text-amber-500">
                        {t("This robot does not report it — its relay is an older build that only knows the frame cap, the downscale and the quality. Nothing is shown because nothing is known; update the relay to tune it here.")}
                      </p>
                    )}
                    <p className="text-xs text-muted">
                      {runningValue !== undefined && (
                        <>{rich(t("running: {value}"), { value: <span className="text-fg">{String(runningValue)}</span> })}{" · "}</>
                      )}
                      {rich(t("saved: {value}"), { value: <span className="text-fg">{savedRaw ?? t("unset")}</span> })}
                      {drifted && (
                        <span className="text-amber-500">
                          {" "}{t("— differs from what is running; applies on the next restart")}
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

      {/* The save bar, only once something was changed (or while a result is showing), always
          in reach while scrolling the knobs. */}
      {(changed.length > 0 || busy || status) && (
      <div className="sticky bottom-4 z-10 flex animate-rise flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-fg px-4 py-3 text-bg shadow-lift">
        <span className="min-w-0 flex-1 text-[12.5px]">
          {changed.length > 0 ? (
            <>
              <strong>{changed.length === 1 ? t("1 unsaved change") : t("{n} unsaved changes", { n: changed.length })}</strong>
              <span className="opacity-75">{" · "}{rich(t("Apply changes the running video only; Apply and save also writes the robot's {file}."), { file: <code>video.env</code> })}</span>
            </>
          ) : <span className="opacity-75">{t("Nothing left to apply.")}</span>}
        </span>
        <StatusText status={status} className="text-xs" />
        {changed.length > 0 && (
          <>
            <button type="button" disabled={busy} onClick={() => { setDraft(seed); setStatus(null); }}
              className="cursor-pointer rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold opacity-80 hover:opacity-100 disabled:opacity-40">
              {t("Discard")}
            </button>
            <Button variant="secondary" className="!border-transparent !bg-bg/15 !text-bg" disabled={busy || !reachable} onClick={() => apply(false)}>
              {t("Apply")}
            </Button>
            <Button variant="primary" disabled={busy || !reachable} onClick={() => apply(true)}>
              {t("Apply and save")}
            </Button>
          </>
        )}
      </div>
      )}
    </div>
  );
}

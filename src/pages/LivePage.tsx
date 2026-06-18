import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { askVlm, fetchClasses } from "../api/backend";
import { VideoStage } from "../components/live/VideoStage";
import { YoloPanel } from "../components/live/YoloPanel";
import { VlmPanel } from "../components/live/VlmPanel";
import { useStatus } from "../components/layout/StatusContext";
import { useCamera } from "../hooks/useCamera";
import { useDetectionSocket } from "../hooks/useDetectionSocket";
import { useOptions } from "../hooks/useOptions";
import type { DetectedObject, DetectionMessage, YoloConfig } from "../types";

const GREEN = "#4ade80";
const BLUE = "#60a5fa";

export function LivePage() {
  const { options, error: optionsError } = useOptions();
  const { setConnected } = useStatus();
  const { videoRef, active, error: cameraError, start, stop } = useCamera();

  // --- YOLO controls ---
  const [yoloModel, setYoloModel] = useState("");
  const [conf, setConf] = useState(0.25);
  const [imgsz, setImgsz] = useState(640);
  const [classes, setClasses] = useState<string[]>([]);
  const [classOptions, setClassOptions] = useState<string[]>([]);

  // --- VLM controls ---
  const [vlmModel, setVlmModel] = useState("");
  const [scope, setScope] = useState("");
  const [variant, setVariant] = useState("");

  // --- Overlay + metrics ---
  const [objects, setObjects] = useState<DetectedObject[]>([]);
  const [overlayColor, setOverlayColor] = useState(GREEN);
  const [fps, setFps] = useState("— ms/frame");
  const [count, setCount] = useState("0 objects");

  // --- VLM request state ---
  const [vlmBusy, setVlmBusy] = useState(false);
  const [vlmStatus, setVlmStatus] = useState("");
  const [vlmOutput, setVlmOutput] = useState("");

  const initialized = useRef(false);

  // Seed all controls from the server defaults once options arrive.
  useEffect(() => {
    if (!options || initialized.current) return;
    initialized.current = true;
    const d = options.defaults;
    setYoloModel(d.yolo_model);
    setConf(d.conf);
    setImgsz(d.imgsz);
    setClasses(d.classes);
    setVlmModel(d.vlm_model);
    setScope(d.scope);
    setVariant(d.variant);
    fetchClasses(d.yolo_model).then(setClassOptions).catch(console.error);
  }, [options]);

  const config = useMemo<YoloConfig>(
    () => ({ model: yoloModel, conf, imgsz, classes }),
    [yoloModel, conf, imgsz, classes],
  );

  const onResult = useCallback((msg: DetectionMessage) => {
    setObjects(msg.objects);
    setOverlayColor(GREEN);
    setFps(`${msg.elapsed_ms} ms/frame`);
    setCount(`${msg.n} objects`);
  }, []);

  const { connected } = useDetectionSocket({
    active,
    videoRef,
    config,
    onResult,
    onError: (m) => console.warn("server:", m),
  });

  useEffect(() => setConnected(connected), [connected, setConnected]);

  // --- Handlers ---
  const handleStart = useCallback(() => {
    start().catch(() => {
      /* error surfaced via cameraError */
    });
  }, [start]);

  const handleStop = useCallback(() => {
    stop();
    setObjects([]);
    setFps("— ms/frame");
    setCount("0 objects");
  }, [stop]);

  const handleModelChange = useCallback((model: string) => {
    setYoloModel(model);
    setClasses([]);
    fetchClasses(model).then(setClassOptions).catch(console.error);
  }, []);

  const handleScopeChange = useCallback(
    (s: string) => {
      setScope(s);
      const first = options?.scopes[s]?.variants[0] ?? "";
      setVariant(first);
    },
    [options],
  );

  const handleAsk = useCallback(async () => {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const { captureFrame } = await import("../lib/capture");
    const image = captureFrame(video);
    if (!image) return;

    setVlmBusy(true);
    setVlmStatus("Asking the VLM… (this can take several seconds)");
    setVlmOutput("");
    try {
      const res = await askVlm({ image, model: vlmModel, scope, variant });
      if (res.error) {
        setVlmStatus(`Error: ${res.error}`);
        return;
      }
      setVlmStatus(
        `${res.model} · ${res.elapsed_ms} ms · ${
          res.did_think ? "reasoned" : "no reasoning"
        }${res.ok ? "" : " · (invalid JSON)"}`,
      );
      setVlmOutput(JSON.stringify(res.parsed, null, 2));
      // Overlay the VLM boxes (blue) on top of the still frame.
      if (res.ok && Array.isArray(res.parsed?.objects)) {
        setObjects(res.parsed.objects);
        setOverlayColor(BLUE);
      }
    } catch (e) {
      setVlmStatus(`Request failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setVlmBusy(false);
    }
  }, [videoRef, vlmModel, scope, variant]);

  if (optionsError) {
    return (
      <main className="p-4 text-[#ff9aa6]">
        Could not reach the backend at its configured URL: {optionsError}. Check
        that the backend is running and that <code>BACKEND_URL</code> in{" "}
        <code>public/config.js</code> is correct.
      </main>
    );
  }

  if (!options) {
    return <main className="p-4 text-muted">Loading options…</main>;
  }

  const variants = options.scopes[scope]?.variants ?? [];

  return (
    <main className="grid grid-cols-1 items-start gap-4 p-4 lg:grid-cols-[1fr_320px]">
      <VideoStage
        videoRef={videoRef}
        objects={objects}
        overlayColor={overlayColor}
        active={active}
        fps={fps}
        count={count}
        onStart={handleStart}
        onStop={handleStop}
      />

      <aside className="rounded-lg border border-line bg-panel p-3.5">
        {cameraError && (
          <p className="mt-0 mb-2.5 text-xs text-[#ff9aa6]">{cameraError}</p>
        )}

        <YoloPanel
          models={options.yolo_models}
          classOptions={classOptions}
          model={yoloModel}
          conf={conf}
          imgsz={imgsz}
          classes={classes}
          onModelChange={handleModelChange}
          onConfChange={setConf}
          onImgszChange={setImgsz}
          onClassesChange={setClasses}
        />

        <hr className="my-4 border-0 border-t border-line" />

        <VlmPanel
          models={options.vlm_models}
          scopes={Object.keys(options.scopes)}
          variants={variants}
          model={vlmModel}
          scope={scope}
          variant={variant}
          canAsk={active}
          busy={vlmBusy}
          status={vlmStatus}
          output={vlmOutput}
          onModelChange={setVlmModel}
          onScopeChange={handleScopeChange}
          onVariantChange={setVariant}
          onAsk={handleAsk}
        />
      </aside>
    </main>
  );
}

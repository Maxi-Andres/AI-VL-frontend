import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { askVlm, fetchClasses } from "../api/backend";
import { VideoStage } from "../components/live/VideoStage";
import { YoloPanel } from "../components/live/YoloPanel";
import { VlmPanel } from "../components/live/VlmPanel";
import { useStatus } from "../components/layout/StatusContext";
import { useCamera } from "../hooks/useCamera";
import { useDetectionSocket } from "../hooks/useDetectionSocket";
import { useOptions } from "../hooks/useOptions";
import { useVoiceAssistant } from "../hooks/useVoiceAssistant";
import type {
  ConfigState,
  DetectedObject,
  DetectionMessage,
  YoloConfig,
} from "../types";

// VLM overlay boxes are drawn one flat color (they aren't YOLO classes). YOLO
// boxes are colored per-class by the palette in draw.ts (no override).
const BLUE = "#60a5fa";

export function LivePage() {
  const { options, error: optionsError } = useOptions();
  const { setConnected, setVoicePhase } = useStatus();
  const { videoRef, active, facing, error: cameraError, start, stop, flip } =
    useCamera();

  // --- YOLO controls ---
  const [yoloModel, setYoloModel] = useState("");
  const [conf, setConf] = useState(0.25);
  const [imgsz, setImgsz] = useState(320);
  const [classes, setClasses] = useState<string[]>([]);
  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [maxFps, setMaxFps] = useState(15); // default cap; 0 = unlimited

  // --- VLM controls ---
  const [vlmModel, setVlmModel] = useState("");
  const [scope, setScope] = useState("");
  const [variant, setVariant] = useState("");

  // --- Overlay + metrics ---
  const [objects, setObjects] = useState<DetectedObject[]>([]);
  // undefined => per-class YOLO colors; set to a color to force it (VLM overlay).
  const [overrideColor, setOverrideColor] = useState<string | undefined>(
    undefined,
  );
  const [fps, setFps] = useState("— fps");
  const [count, setCount] = useState("0 objects");

  // --- VLM request state ---
  const [vlmBusy, setVlmBusy] = useState(false);
  const [vlmStatus, setVlmStatus] = useState("");
  const [vlmOutput, setVlmOutput] = useState("");
  // Free-prompt text lives here (not in VlmPanel) so dictation can populate it.
  const [prompt, setPrompt] = useState("");

  const initialized = useRef(false);
  const lastFrameTsRef = useRef(0); // for measuring the actual processed FPS
  const fpsEmaRef = useRef(0);

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
    () => ({ model: yoloModel, conf, imgsz, classes, max_fps: maxFps }),
    [yoloModel, conf, imgsz, classes, maxFps],
  );

  const onResult = useCallback((msg: DetectionMessage) => {
    setObjects(msg.objects);
    setOverrideColor(undefined); // YOLO: color each box by its class
    // Actual processed FPS from the cadence of replies (smoothed), plus the
    // server-side inference time per frame.
    const now = performance.now();
    const dt = now - lastFrameTsRef.current;
    lastFrameTsRef.current = now;
    if (dt > 0 && dt < 5000) {
      const inst = 1000 / dt;
      fpsEmaRef.current = fpsEmaRef.current
        ? fpsEmaRef.current * 0.8 + inst * 0.2
        : inst;
      setFps(`${fpsEmaRef.current.toFixed(1)} fps · ${msg.elapsed_ms} ms`);
    } else {
      setFps(`${msg.elapsed_ms} ms`);
    }
    setCount(`${msg.n} objects`);
  }, []);

  // Adopt config the server pushes (e.g. changed from the monitor) so the phone's
  // controls stay in sync. Only refetch classes when the model actually changes.
  const applyServerConfig = useCallback(
    (state: ConfigState) => {
      if (state.model != null && state.model !== yoloModel) {
        setYoloModel(state.model);
        fetchClasses(state.model).then(setClassOptions).catch(console.error);
      }
      if (state.conf != null) setConf(state.conf);
      if (state.imgsz != null) setImgsz(state.imgsz);
      if (state.classes != null) setClasses(state.classes);
      if (state.max_fps != null) setMaxFps(state.max_fps);
    },
    [yoloModel],
  );

  const { connected } = useDetectionSocket({
    active,
    videoRef,
    config,
    onResult,
    onError: (m) => console.warn("server:", m),
    onConfig: applyServerConfig,
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
    setFps("— fps");
    setCount("0 objects");
    fpsEmaRef.current = 0;
    lastFrameTsRef.current = 0;
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
        setOverrideColor(BLUE);
      }
    } catch (e) {
      setVlmStatus(`Request failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setVlmBusy(false);
    }
  }, [videoRef, vlmModel, scope, variant]);

  // Free-form question about the current frame -> plain-text answer. Returns the
  // answer text (or null) so the voice assistant can read it aloud.
  const askPrompt = useCallback(
    async (prompt: string): Promise<string | null> => {
      // Reflect what we're about to send in the prompt box (esp. voice dictation).
      setPrompt(prompt);
      const video = videoRef.current;
      if (!video?.videoWidth) return null;
      const { captureFrame } = await import("../lib/capture");
      const image = captureFrame(video);
      if (!image) return null;

      setVlmBusy(true);
      setVlmStatus("Asking the VLM… (this can take several seconds)");
      setVlmOutput("");
      try {
        const res = await askVlm({ image, model: vlmModel, prompt });
        if (res.error) {
          setVlmStatus(`Error: ${res.error}`);
          return null;
        }
        setVlmStatus(
          `${res.model} · ${res.elapsed_ms} ms · ${
            res.did_think ? "reasoned" : "no reasoning"
          }`,
        );
        const answer = res.content?.trim() || "(no answer)";
        setVlmOutput(answer);
        return answer;
      } catch (e) {
        setVlmStatus(`Request failed: ${e instanceof Error ? e.message : e}`);
        return null;
      } finally {
        setVlmBusy(false);
      }
    },
    [videoRef, vlmModel],
  );

  // Hands-free voice: say "robot", speak the question, it auto-submits and (in
  // spoken mode) reads the answer aloud. Also drives the manual read-aloud button.
  const va = useVoiceAssistant({ askPrompt });

  // Surface the voice-assistant state in the header (next to the connection pill).
  useEffect(() => setVoicePhase(va.phase), [va.phase, setVoicePhase]);

  const handleAskPrompt = useCallback(
    (prompt: string) => {
      setPrompt(prompt);
      // In spoken mode, read the answer aloud even for typed/tapped questions.
      askPrompt(prompt).then((answer) => {
        if (answer && va.spokenMode) va.speak(answer);
      });
    },
    [askPrompt, va],
  );

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
        overrideColor={overrideColor}
        active={active}
        facing={facing}
        fps={fps}
        count={count}
        onStart={handleStart}
        onStop={handleStop}
        onFlip={flip}
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
          maxFps={maxFps}
          onModelChange={handleModelChange}
          onConfChange={setConf}
          onImgszChange={setImgsz}
          onClassesChange={setClasses}
          onMaxFpsChange={setMaxFps}
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
          prompt={prompt}
          onPromptChange={setPrompt}
          onModelChange={setVlmModel}
          onScopeChange={handleScopeChange}
          onVariantChange={setVariant}
          onAsk={handleAsk}
          onAskPrompt={handleAskPrompt}
          voice={{
            micSupported: va.micSupported,
            voiceMode: va.voiceMode,
            onToggleVoiceMode: va.toggleVoiceMode,
            speechSupported: va.speechSupported,
            spokenMode: va.spokenMode,
            onToggleSpokenMode: va.toggleSpokenMode,
            status: va.status,
            speaking: va.speaking,
            onSpeak: () => va.speak(vlmOutput),
            onStopSpeak: va.stopSpeak,
            voices: va.voices,
            voiceURI: va.voiceURI,
            onVoiceChange: va.onVoiceChange,
          }}
        />
      </aside>
    </main>
  );
}

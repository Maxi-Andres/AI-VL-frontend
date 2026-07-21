import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  askVlm,
  askVlmStream,
  executeCommand,
  fetchClasses,
  fetchRobots,
  interpretCommand,
  transcribeAudio,
} from "../api/backend";
import { VideoStage } from "../components/live/VideoStage";
import { YoloPanel } from "../components/live/YoloPanel";
import { VlmPanel } from "../components/live/VlmPanel";
import { CommandPanel } from "../components/live/CommandPanel";
import { useStatus } from "../components/layout/StatusContext";
import { fmtMs } from "../lib/format";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useCamera } from "../hooks/useCamera";
import { useDetectionSocket } from "../hooks/useDetectionSocket";
import { useOptions } from "../hooks/useOptions";
import { useVoiceAssistant } from "../hooks/useVoiceAssistant";
import type {
  CommandResponse,
  ConfigState,
  DetectedObject,
  DetectionMessage,
  RobotInfo,
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
  // Longer-side px of the frame sent to the VLM (0 = native). Smaller = faster.
  const [vlmMaxSize, setVlmMaxSize] = useState(768);

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

  // --- Robot command interpreter state (verification view) ---
  const cmdRecorder = useAudioRecorder();
  const [robots, setRobots] = useState<RobotInfo[]>([]);
  const [cmdRobot, setCmdRobot] = useState("g1");
  const [cmdModel, setCmdModel] = useState("");
  const [cmdText, setCmdText] = useState("");
  const [cmdBusy, setCmdBusy] = useState(false);
  const [cmdStatus, setCmdStatus] = useState("");
  const [cmdResult, setCmdResult] = useState<CommandResponse | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executeStatus, setExecuteStatus] = useState("");
  // Execution switches (persisted): master arm + auto-run. Default OFF (safe).
  const [execEnabled, setExecEnabled] = useState(
    () => typeof localStorage !== "undefined" &&
      localStorage.getItem("aivl.execEnabled") === "1");
  const [autoRun, setAutoRun] = useState(
    () => typeof localStorage !== "undefined" &&
      localStorage.getItem("aivl.autoRun") === "1");
  // SAFE_MODE (blocks acrobatics), controllable from here. Default OFF.
  const [safeMode, setSafeMode] = useState(
    () => typeof localStorage !== "undefined" &&
      localStorage.getItem("aivl.safeMode") === "1");
  // Refs so runInterpret (auto-run) / executeResult always see the latest toggles.
  const execEnabledRef = useRef(execEnabled);
  execEnabledRef.current = execEnabled;
  const autoRunRef = useRef(autoRun);
  autoRunRef.current = autoRun;
  const safeModeRef = useRef(safeMode);
  safeModeRef.current = safeMode;
  const cmdAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => cmdAbortRef.current?.abort(), []);
  // Load the robot list (G1, Go2) once for the command interpreter's selector.
  useEffect(() => {
    fetchRobots().then(setRobots).catch(console.error);
  }, []);

  const initialized = useRef(false);
  const lastFrameTsRef = useRef(0); // for measuring the actual processed FPS
  const fpsEmaRef = useRef(0);
  // Aborts the in-flight VLM request/stream on a new ask or on unmount, so a slow
  // answer never resolves into an unmounted page.
  const vlmAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => vlmAbortRef.current?.abort(), []);

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
    // Command parsing needs no reasoning: prefer an *-instruct model (much faster
    // time-to-answer) when one is installed, else fall back to the VLM default.
    const instruct = options.vlm_models.find((m) => m.includes("instruct"));
    setCmdModel(instruct ?? d.vlm_model);
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
    const image = captureFrame(video, 0.85, vlmMaxSize);
    if (!image) return;

    vlmAbortRef.current?.abort();
    const ac = new AbortController();
    vlmAbortRef.current = ac;
    setVlmBusy(true);
    setVlmStatus("Asking the VLM… (this can take several seconds)");
    setVlmOutput("");
    try {
      const res = await askVlm({ image, model: vlmModel, scope, variant }, ac.signal);
      if (res.error) {
        setVlmStatus(`Error: ${res.error}`);
        return;
      }
      setVlmStatus(
        `${res.model} · ${fmtMs(res.elapsed_ms)} · ${
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
      if (e instanceof DOMException && e.name === "AbortError") return;
      setVlmStatus(`Request failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setVlmBusy(false);
    }
  }, [videoRef, vlmModel, scope, variant, vlmMaxSize]);

  // Free-form question about the current frame, STREAMED. `onDelta` receives each
  // text chunk as the model generates it (shown live + spoken sentence by
  // sentence). Resolves with the full answer, or null on failure.
  const askPromptStream = useCallback(
    async (
      prompt: string,
      onDelta: (piece: string) => void,
    ): Promise<string | null> => {
      // Reflect what we're about to send in the prompt box (esp. voice dictation).
      setPrompt(prompt);
      const video = videoRef.current;
      if (!video?.videoWidth) return null;
      const { captureFrame } = await import("../lib/capture");
      const image = captureFrame(video, 0.85, vlmMaxSize);
      if (!image) return null;

      vlmAbortRef.current?.abort();
      const ac = new AbortController();
      vlmAbortRef.current = ac;
      setVlmBusy(true);
      setVlmStatus("Asking the VLM…");
      setVlmOutput("");
      const t0 = performance.now();
      let tFirst: number | null = null;
      try {
        let acc = "";
        const answer = await askVlmStream(
          { image, model: vlmModel, prompt },
          (piece) => {
            if (tFirst === null) tFirst = performance.now();
            acc += piece;
            setVlmOutput(acc); // live, token by token
            onDelta(piece);
          },
          ac.signal,
        );
        const total = performance.now() - t0;
        const firstMs = tFirst !== null ? tFirst - t0 : total;
        setVlmStatus(`${fmtMs(total)} · first reply ${fmtMs(firstMs)}`);
        const text = answer.trim() || "(no answer)";
        setVlmOutput(text);
        return text;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return null;
        setVlmStatus(`Request failed: ${e instanceof Error ? e.message : e}`);
        return null;
      } finally {
        setVlmBusy(false);
      }
    },
    [videoRef, vlmModel, vlmMaxSize],
  );

  // Hands-free voice: say "robot", speak the question, it auto-submits and (in
  // spoken mode) reads the answer aloud as it streams. Also drives the manual
  // read-aloud button.
  const va = useVoiceAssistant({ askPromptStream });

  // Surface the voice-assistant state in the header (next to the connection pill).
  useEffect(() => setVoicePhase(va.phase), [va.phase, setVoicePhase]);

  const handleAskPrompt = useCallback(
    (prompt: string) => {
      setPrompt(prompt);
      // In spoken mode, speak the answer as it streams (else just show it).
      const stream = va.spokenMode ? va.createStream() : null;
      askPromptStream(prompt, (piece) => stream?.push(piece)).then(() =>
        stream?.end(),
      );
    },
    [askPromptStream, va],
  );

  const toggleExecEnabled = useCallback(() => {
    setExecEnabled((v) => {
      const next = !v;
      if (typeof localStorage !== "undefined")
        localStorage.setItem("aivl.execEnabled", next ? "1" : "0");
      return next;
    });
  }, []);
  const toggleAutoRun = useCallback(() => {
    setAutoRun((v) => {
      const next = !v;
      if (typeof localStorage !== "undefined")
        localStorage.setItem("aivl.autoRun", next ? "1" : "0");
      return next;
    });
  }, []);
  const toggleSafeMode = useCallback(() => {
    setSafeMode((v) => {
      const next = !v;
      if (typeof localStorage !== "undefined")
        localStorage.setItem("aivl.safeMode", next ? "1" : "0");
      return next;
    });
  }, []);

  // Send ONE interpreted result to the robot executor. Shared by the manual button
  // and auto-run. No-op unless execution is armed (checked by callers).
  const executeResult = useCallback(async (res: CommandResponse | null) => {
    if (!res || res.skill === "unknown") return;
    setExecuting(true);
    setExecuteStatus("Sending to the robot…");
    try {
      const r = await executeCommand(
        res.robot, res.skill, res.params, safeModeRef.current);
      if (r.ok) {
        setExecuteStatus(
          `✓ ${r.detail ?? "sent"}${r.dry_run ? " (dry-run, not moved)" : ""}`);
      } else if (r.blocked) {
        setExecuteStatus(`⛔ ${r.error ?? "blocked by SAFE_MODE"}`);
      } else {
        setExecuteStatus(`✗ ${r.error ?? r.detail ?? "failed"}`);
      }
    } catch (e) {
      setExecuteStatus(`Request failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExecuting(false);
    }
  }, []);

  // --- Robot command interpreter (verification) ---
  // Send a command text to the interpreter and show the chosen skill + JSON.
  const runInterpret = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t) return;
      cmdAbortRef.current?.abort();
      const ac = new AbortController();
      cmdAbortRef.current = ac;
      setCmdBusy(true);
      setCmdStatus("Interpreting…");
      try {
        const res = await interpretCommand(t, cmdModel, cmdRobot, ac.signal);
        if (res.error) {
          setCmdStatus(`Error: ${res.error}`);
          return;
        }
        setCmdResult(res);
        setCmdStatus(
          `${res.model} · ${fmtMs(res.elapsed_ms)}${
            res.ok ? "" : " · (invalid JSON — fell back to unknown)"
          }`,
        );
        // Auto-run: fire immediately when armed + auto (no button needed).
        if (execEnabledRef.current && autoRunRef.current) void executeResult(res);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setCmdStatus(`Request failed: ${e instanceof Error ? e.message : e}`);
      } finally {
        setCmdBusy(false);
      }
    },
    [cmdModel, cmdRobot, executeResult],
  );

  const handleInterpret = useCallback(
    () => void runInterpret(cmdText),
    [runInterpret, cmdText],
  );

  // Speak one command: record → transcribe → interpret. Reuses the same STT path
  // as the voice assistant; here the transcript feeds the interpreter, not the VLM.
  const handleRecordCommand = useCallback(async () => {
    if (cmdBusy || cmdRecorder.recording) return;
    setCmdBusy(true);
    setCmdStatus("Listening… speak a command");
    try {
      const blob = await cmdRecorder.recordUtterance();
      if (!blob) {
        setCmdStatus("Didn't catch that — try again");
        return;
      }
      setCmdStatus("Transcribing…");
      const res = await transcribeAudio(blob);
      const text = res.text?.trim();
      if (res.error || !text) {
        setCmdStatus(res.error ? `Error: ${res.error}` : "Nothing recognized");
        return;
      }
      setCmdText(text);
      await runInterpret(text); // manages its own busy/status from here
    } catch (e) {
      setCmdStatus(`Voice error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCmdBusy(false);
    }
  }, [cmdBusy, cmdRecorder, runInterpret]);

  // Manual trigger: send the current interpreted skill to the robot.
  const handleExecuteOnRobot = useCallback(
    () => void executeResult(cmdResult), [executeResult, cmdResult]);

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
    <main className="grid grid-cols-1 items-start gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_640px]">
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

        {/* Two columns so the controls fit without a long scroll (col 1: live
            detection + robot command · col 2: on-demand VLM). Single column on
            narrow screens. */}
        <div className="grid grid-cols-1 items-start gap-x-5 gap-y-4 md:grid-cols-2">
          <div className="min-w-0">
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

            <CommandPanel
              robots={robots}
              robot={cmdRobot}
              onRobotChange={setCmdRobot}
              models={options.vlm_models}
              model={cmdModel}
              onModelChange={setCmdModel}
              text={cmdText}
              onTextChange={setCmdText}
              busy={cmdBusy}
              status={cmdStatus}
              result={cmdResult}
              micSupported={cmdRecorder.supported}
              recording={cmdRecorder.recording}
              onInterpret={handleInterpret}
              onRecord={handleRecordCommand}
              onExecuteOnRobot={handleExecuteOnRobot}
              executing={executing}
              executeStatus={executeStatus}
              execEnabled={execEnabled}
              onToggleExecEnabled={toggleExecEnabled}
              autoRun={autoRun}
              onToggleAutoRun={toggleAutoRun}
              safeMode={safeMode}
              onToggleSafeMode={toggleSafeMode}
            />
          </div>

          <div className="min-w-0">
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
              imageMaxSize={vlmMaxSize}
              onImageMaxSizeChange={setVlmMaxSize}
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
                fillerMode: va.fillerMode,
                onToggleFillerMode: va.toggleFillerMode,
                status: va.status,
                speaking: va.speaking,
                onSpeak: () => va.speak(vlmOutput),
                onStopSpeak: va.stopSpeak,
                voices: va.voices,
                voiceURI: va.voiceURI,
                onVoiceChange: va.onVoiceChange,
              }}
            />
          </div>
        </div>
      </aside>
    </main>
  );
}

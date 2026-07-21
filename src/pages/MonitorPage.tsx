import { useCallback, useEffect, useRef, useState } from "react";
import {
  askVlm,
  askVlmStream,
  executeCommand,
  fetchClasses,
  fetchRobots,
  interpretCommand,
  transcribeAudio,
} from "../api/backend";
import { WS_VIEW_URL } from "../config";
import { YoloPanel } from "../components/live/YoloPanel";
import { VlmPanel } from "../components/live/VlmPanel";
import { CommandPanel } from "../components/live/CommandPanel";
import { Button } from "../components/ui/Button";
import { fmtMs } from "../lib/format";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useStatus } from "../components/layout/StatusContext";
import { useOptions } from "../hooks/useOptions";
import { useVoiceAssistant } from "../hooks/useVoiceAssistant";
import { drawBoxes } from "../lib/draw";
import type {
  CommandResponse,
  ConfigState,
  DetectedObject,
  RobotInfo,
  ViewMessage,
  YoloConfig,
} from "../types";

// VLM overlay boxes are drawn one flat color (see LivePage).
const BLUE = "#60a5fa";

/**
 * Server-side monitor: mirrors what the phone sees (live video + detections)
 * and lets you drive the same controls, WITHOUT being a camera itself — the
 * phone is the only video source. It streams nothing until you press "Activar":
 * while inactive no socket is open, so an idle monitor uses zero bandwidth.
 */
export function MonitorPage() {
  const { options, error: optionsError } = useOptions();
  const { setConnected, setVoicePhase } = useStatus();

  const [activated, setActivated] = useState(false);
  const [waiting, setWaiting] = useState(false); // socket open, no frame yet
  const wsRef = useRef<WebSocket | null>(null);

  // --- YOLO controls (same as LivePage) ---
  const [yoloModel, setYoloModel] = useState("");
  const [conf, setConf] = useState(0.25);
  const [imgsz, setImgsz] = useState(320);
  const [classes, setClasses] = useState<string[]>([]);
  const [classOptions, setClassOptions] = useState<string[]>([]);
  const [maxFps, setMaxFps] = useState(15); // default cap; 0 = unlimited (caps the phone)

  // --- VLM controls ---
  const [vlmModel, setVlmModel] = useState("");
  const [scope, setScope] = useState("");
  const [variant, setVariant] = useState("");

  // --- Overlay + metrics + latest mirrored frame ---
  const [objects, setObjects] = useState<DetectedObject[]>([]);
  const [overrideColor, setOverrideColor] = useState<string | undefined>(
    undefined,
  );
  const [fps, setFps] = useState("— fps");
  const [count, setCount] = useState("0 objects");
  const [frameUrl, setFrameUrl] = useState("");
  const lastFrameRef = useRef(""); // last JPEG data URL, for the VLM request
  const lastFrameTsRef = useRef(0); // for measuring actual mirrored FPS
  const fpsEmaRef = useRef(0);

  // --- VLM request state ---
  const [vlmBusy, setVlmBusy] = useState(false);
  const [vlmStatus, setVlmStatus] = useState("");
  const [vlmOutput, setVlmOutput] = useState("");
  // Free-prompt text (lifted here so dictation can populate it).
  const [prompt, setPrompt] = useState("");

  // --- Robot command interpreter state (verification view; same as LivePage) ---
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
  // Always start each session SAFE ON / AUTO OFF (not persisted on purpose): never
  // dangerous and never automatic until you explicitly enable it.
  const [autoRun, setAutoRun] = useState(false);
  const [safeMode, setSafeMode] = useState(true);
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

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initialized = useRef(false);
  // Aborts the in-flight VLM request/stream on a new ask or on unmount.
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
    // Command parsing needs no reasoning: prefer an *-instruct model when present.
    const instruct = options.vlm_models.find((m) => m.includes("instruct"));
    setCmdModel(instruct ?? d.vlm_model);
    fetchClasses(d.yolo_model).then(setClassOptions).catch(console.error);
  }, [options]);

  // Push a config change into the shared session. The backend merges partials, so
  // we send only the field that changed. Called from the control handlers — NOT on
  // activation — so adopting the phone's config never echoes back and clobbers it.
  const pushConfig = useCallback((patch: Partial<YoloConfig>) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(patch));
    }
  }, []);

  // Adopt config the server pushes (from the phone or another monitor). Sets state
  // directly (no echo). Refetch the class list only when the model changes.
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
  const applyServerConfigRef = useRef(applyServerConfig);
  useEffect(() => {
    applyServerConfigRef.current = applyServerConfig;
  }, [applyServerConfig]);

  // Redraw the overlay on top of the mirrored frame. The canvas tracks the
  // frame's native size and uses the same object-contain CSS, so normalized
  // bboxes stay aligned.
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = imgRef.current;
    const w = img?.naturalWidth || 1280;
    const h = img?.naturalHeight || 960;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    drawBoxes(canvas, objects, overrideColor);
  }, [objects, overrideColor]);
  useEffect(redraw, [redraw, frameUrl]);

  const deactivate = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    if (ws) {
      ws.onopen = ws.onclose = ws.onerror = ws.onmessage = null;
      ws.close();
    }
    setActivated(false);
    setWaiting(false);
    setConnected(false);
    setFrameUrl("");
    lastFrameRef.current = "";
    setObjects([]);
    setFps("— fps");
    setCount("0 objects");
    fpsEmaRef.current = 0;
    lastFrameTsRef.current = 0;
  }, [setConnected]);

  const activate = useCallback(() => {
    if (wsRef.current) return;
    const ws = new WebSocket(WS_VIEW_URL);
    wsRef.current = ws;
    setWaiting(true);
    ws.onopen = () => {
      setActivated(true); // then we just adopt the server's seeded config
      setConnected(true);
    };
    ws.onclose = () => {
      setConnected(false);
      setActivated(false);
      setWaiting(false);
    };
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data as string) as ViewMessage;
      if (m.type === "frame") {
        const url = `data:image/jpeg;base64,${m.jpeg_b64}`;
        lastFrameRef.current = url;
        setFrameUrl(url);
        setObjects(m.objects ?? []);
        setOverrideColor(undefined); // YOLO: color each box by class
        const now = performance.now();
        const dt = now - lastFrameTsRef.current;
        lastFrameTsRef.current = now;
        if (dt > 0 && dt < 5000) {
          const inst = 1000 / dt;
          fpsEmaRef.current = fpsEmaRef.current
            ? fpsEmaRef.current * 0.8 + inst * 0.2
            : inst;
          setFps(`${fpsEmaRef.current.toFixed(1)} fps · ${m.elapsed_ms} ms`);
        } else {
          setFps(`${m.elapsed_ms} ms`);
        }
        setCount(`${m.n} objects`);
        setWaiting(false);
      } else if (m.type === "error") {
        console.warn("server:", m.message);
      } else if (m.type === "config") {
        applyServerConfigRef.current(m.state); // keep controls in sync with phone
      }
    };
  }, [setConnected]);

  // Tear the socket down if we navigate away.
  useEffect(() => () => deactivate(), [deactivate]);

  // --- Handlers ---
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
    const image = lastFrameRef.current;
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
  }, [vlmModel, scope, variant]);

  // Free-form question about the last mirrored frame -> plain-text answer.
  // Free-form question about the mirrored frame, STREAMED (shown live + spoken
  // sentence by sentence). Resolves with the full answer, or null on failure.
  const askPromptStream = useCallback(
    async (
      prompt: string,
      onDelta: (piece: string) => void,
    ): Promise<string | null> => {
      // Reflect what we're about to send in the prompt box (esp. voice dictation).
      setPrompt(prompt);
      const image = lastFrameRef.current;
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
            setVlmOutput(acc);
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
    [vlmModel],
  );

  // Hands-free voice assistant (wake word "robot", auto-submit, streamed spoken answers).
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
  const toggleAutoRun = useCallback(() => setAutoRun((v) => !v), []);
  const toggleSafeMode = useCallback(() => setSafeMode((v) => !v), []);

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

  // --- Robot command interpreter (verification; independent of the video) ---
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

  // Speak one command: record → transcribe → interpret (feeds the interpreter).
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
      await runInterpret(text);
    } catch (e) {
      setCmdStatus(`Voice error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCmdBusy(false);
    }
  }, [cmdBusy, cmdRecorder, runInterpret]);

  // Manual trigger: send the current interpreted skill to the robot.
  const handleExecuteOnRobot = useCallback(
    () => void executeResult(cmdResult), [executeResult, cmdResult]);

  // Emergency stop: halt the robot NOW, regardless of the switches.
  const handleStopRobot = useCallback(async () => {
    setExecuting(true);
    setExecuteStatus("⏹ Stopping the robot…");
    try {
      const r = await executeCommand(cmdRobot, "stop", {}, false);
      setExecuteStatus(r.ok ? "⏹ Stopped" : `✗ ${r.error ?? "stop failed"}`);
    } catch (e) {
      setExecuteStatus(`Stop failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setExecuting(false);
    }
  }, [cmdRobot]);

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

  // Inactive: just the button. No socket, no bandwidth.
  if (!activated) {
    return (
      <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <h2 className="m-0 text-lg font-semibold">Server monitor</h2>
        <p className="m-0 max-w-md text-sm text-muted">
          Mirrors what the phone sees (video + detections) and lets you drive the
          same controls from here. The phone stays the only camera. While inactive
          nothing is streamed, so it uses no bandwidth until you activate it.
        </p>
        <Button onClick={activate} className="text-base">
          Activate monitor
        </Button>
      </main>
    );
  }

  const variants = options.scopes[scope]?.variants ?? [];

  return (
    <main className="grid grid-cols-1 items-start gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_640px]">
      <section className="min-w-0">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-line bg-black">
          {frameUrl ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img
              ref={imgRef}
              src={frameUrl}
              alt=""
              onLoad={redraw}
              className="absolute inset-0 h-full w-full object-contain"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
              {waiting
                ? "Waiting for frames from the phone…"
                : "No signal from the phone"}
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <Button variant="secondary" onClick={deactivate}>
            Deactivate
          </Button>
          <span className="text-muted tabular-nums">{fps}</span>
          <span className="text-muted tabular-nums">{count}</span>
        </div>
      </section>

      <aside className="rounded-lg border border-line bg-panel p-3.5">
        {/* Two columns so the controls fit without a long scroll (col 1: live
            detection + robot command · col 2: on-demand VLM). Single column on
            narrow screens. Kept identical to LivePage. */}
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
              onModelChange={(m) => {
                handleModelChange(m);
                pushConfig({ model: m, classes: [] });
              }}
              onConfChange={(v) => {
                setConf(v);
                pushConfig({ conf: v });
              }}
              onImgszChange={(v) => {
                setImgsz(v);
                pushConfig({ imgsz: v });
              }}
              onClassesChange={(v) => {
                setClasses(v);
                pushConfig({ classes: v });
              }}
              onMaxFpsChange={(v) => {
                setMaxFps(v);
                pushConfig({ max_fps: v });
              }}
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
              onStop={handleStopRobot}
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
              canAsk={!!frameUrl}
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

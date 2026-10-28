import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  askVlm,
  askVlmStream,
  detectFrame,
  executeCommand,
  fetchClasses,
  interpretCommand,
  setRobotCamera,
  transcribeAudio,
} from "../api/backend";
import { VideoStage } from "../components/live/VideoStage";
import { RobotCameraStage } from "../components/live/RobotCameraStage";
import { ClassChips } from "../components/live/ClassChips";
import { YoloPanel } from "../components/live/YoloPanel";
import { VLM_IMG_DEFAULT, VlmPanel } from "../components/live/VlmPanel";
import { CommandPanel } from "../components/live/CommandPanel";
import { useStatus } from "../components/layout/StatusContext";
import { useRobot } from "../components/layout/RobotContext";
import { fmtMs } from "../lib/format";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useCamera } from "../hooks/useCamera";
import { useDetectionSocket } from "../hooks/useDetectionSocket";
import { useOptions } from "../hooks/useOptions";
import { usePresence } from "../hooks/usePresence";
import { useRobotVolume } from "../hooks/useRobotVolume";
import { useChats } from "../hooks/useChats";
import { setSpeechVolume, useSpeechVolume } from "../lib/speechVolume";
import { useVideoTransport } from "../components/layout/VideoTransportContext";
import { VideoTransportSwitch } from "../components/live/VideoTransportSwitch";
import { RobotCameraSwitch } from "../components/live/RobotCameraSwitch";
import { useRobotCameraView } from "../hooks/useRobotCameraView";
import { useVoiceAssistantContext } from "../components/layout/VoiceAssistantContext";
import { captureFrame, encodeFrame, snapshotFrame } from "../lib/capture";
import { startPairing } from "../lib/framePairing";
import { StatusText, type Status } from "../components/ui/StatusText";
import { useCan } from "../auth/permissions";
import { colorForObject } from "../lib/draw";
import {
  IconCameraRotate,
  IconDeviceLaptop,
  IconEye,
  IconPlayerPlayFilled,
  IconPlayerStopFilled,
  IconScan,
  IconSparkles,
  IconTerminal2,
  IconVideo,
} from "@tabler/icons-react";
import type {
  CommandResponse,
  ConfigState,
  DetectedObject,
  DetectionMessage,
  YoloConfig,
} from "../types";
import { Segmented } from "../components/ui/Segmented";
import { useT } from "../i18n";

// VLM overlay boxes are drawn one flat color (they aren't YOLO classes). YOLO
// boxes are colored per-class by the palette in draw.ts (no override).
const BLUE = "#60a5fa";

export function LivePage() {
  const t = useT();
  const { options, error: optionsError } = useOptions();
  const { setConnected } = useStatus();
  const { videoRef, active, facing, error: cameraError, start, stop, flip } =
    useCamera();

  // The camera source is EXCLUSIVE and one of three modes (this single page
  // replaces the old Live + Monitor pages):
  //   "own"   -> this device's webcam; we PRODUCE frames to /ws/detect.
  //   "robot" -> the robot camera; we start the bridge and VIEW /ws/view.
  //   "view"  -> a read-only MIRROR of whatever the session is showing (/ws/view),
  //              without producing or starting the robot camera.
  // What this role may do here: a viewer only mirrors the session (no camera of its own, no
  // YOLO/VLM/command panels — those spend GPU or reach the robot), an operator may also start
  // the robot camera. The backend refuses the rest anyway; this keeps it off the screen.
  const can = useCan();
  const mayAnalyze = can("analyze");
  const mayOperate = can("operate");
  // Live is the robot's console: it opens on the robot camera for whoever may start it, a
  // mirror for whoever may only watch. This device's webcam is a choice, never the default.
  const [source, setSource] = useState<"own" | "robot" | "view">(mayOperate ? "robot" : "view");
  // Presentation only: which side-panel tab is open.
  const [panel, setPanel] = useState<"vlm" | "yolo" | "command">("vlm");
  const [robotCamStatus, setRobotCamStatus] = useState<Status | null>(null);
  const viewing = source !== "own"; // true when we're a /ws/view consumer
  // Master YOLO on/off (shared session flag). Default OFF so no GPU is used until
  // it's turned on — it applies to whichever video is showing.
  const [yoloEnabled, setYoloEnabled] = useState(false);

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
  const [vlmMaxSize, setVlmMaxSize] = useState(VLM_IMG_DEFAULT);

  // --- Overlay + metrics ---
  const [objects, setObjects] = useState<DetectedObject[]>([]);
  // undefined => per-class YOLO colors; set to a color to force it (VLM overlay).
  const [overrideColor, setOverrideColor] = useState<string | undefined>(
    undefined,
  );
  const [fps, setFps] = useState("— fps");

  // --- VLM request state ---
  const [vlmBusy, setVlmBusy] = useState(false);
  const [vlmStatus, setVlmStatus] = useState("");
  const [vlmOutput, setVlmOutput] = useState("");
  // Free-prompt text lives here (not in VlmPanel) so dictation can populate it.
  const [prompt, setPrompt] = useState("");

  // --- Robot command interpreter state (verification view) ---
  const cmdRecorder = useAudioRecorder();
  // Robot is chosen globally in the header now (shared context).
  const { robot: cmdRobot } = useRobot();
  const [cmdModel, setCmdModel] = useState("");
  const [cmdText, setCmdText] = useState("");
  const [cmdBusy, setCmdBusy] = useState(false);
  const [cmdStatus, setCmdStatus] = useState("");
  const [cmdResult, setCmdResult] = useState<CommandResponse | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executeStatus, setExecuteStatus] = useState<Status | null>(null);
  // Execution switches (persisted): master arm + auto-run. Default OFF (safe).
  const [execEnabled, setExecEnabled] = useState(
    () => typeof localStorage !== "undefined" &&
      localStorage.getItem("aivl.execEnabled") === "1");
  // Always start each session SAFE ON / AUTO OFF (not persisted on purpose): never
  // dangerous and never automatic until you explicitly enable it.
  const [autoRun, setAutoRun] = useState(false);
  const [safeMode, setSafeMode] = useState(true);
  // Refs so runInterpret (auto-run) / executeResult always see the latest toggles.
  const execEnabledRef = useRef(execEnabled);
  execEnabledRef.current = execEnabled;
  const autoRunRef = useRef(autoRun);
  autoRunRef.current = autoRun;
  const safeModeRef = useRef(safeMode);
  safeModeRef.current = safeMode;
  const cmdAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => cmdAbortRef.current?.abort(), []);

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
    () => ({ model: yoloModel, conf, imgsz, classes, max_fps: maxFps, enabled: yoloEnabled }),
    [yoloModel, conf, imgsz, classes, maxFps, yoloEnabled],
  );

  // Turning YOLO off clears any boxes still on screen (no new frames arrive to
  // clear them, since the pump stops sending).
  useEffect(() => {
    if (!yoloEnabled) {
      setObjects([]);
      setOverrideColor(undefined);
    }
  }, [yoloEnabled]);

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
      if (state.enabled != null) setYoloEnabled(state.enabled);
    },
    [yoloModel],
  );

  // WebRTC picture straight off mediamtx, when this deployment has WHEP_URL set. The view
  // socket below stays connected either way: it still carries the shared config (and, on
  // MJPEG, the boxes), so only the PICTURE moves off the backend.
  //
  // Only for the robot source — a session mirror has no mediamtx path behind it.
  // Transport comes from the app-wide context: Drive and Live must not disagree about
  // which path is under test, or the comparison between them means nothing.
  const { transport, stream: h264Stream, intraCanvasRef, detail: videoDetail, receiving } = useVideoTransport();

  // WHO PAIRS A FRAME WITH ITS BOXES (PLAN_YOLO_FRAME_PAIRING.md §3.2 and §7: what you see is
  // what gets analysed). On MJPEG the picture comes through the backend, so the backend holds
  // each frame until its boxes are ready. On the two H.264 transports it never does — they go
  // browser <-> mediamtx or robot -> canvas — so THIS page pairs: grab what is on screen,
  // detect that grab, show that grab with its boxes. The backend then must not detect for us
  // at all, which is why `boxes` goes false on the view socket.
  const pairsLocally =
    source === "robot" && yoloEnabled && (transport === "h264" || transport === "intra");

  // Viewer/mirror source (robot camera or plain mirror of the session). Adopts the
  // server's shared config so the panels stay in sync, and exposes `sendViewConfig`
  // so panel changes here propagate to the producer + robot-cam detection.
  const {
    frameUrl: robotFrameUrl,
    connected: robotViewConnected,
    objects: robotObjects,
    getLastFrameBlob,
    sendConfig: sendViewConfig,
  } = useRobotCameraView(viewing, yoloEnabled && !pairsLocally, applyServerConfig, cmdRobot,
    // The boxes the server computes on the robot's frames carry their inference time: the
    // readings (inference, processed fps) come from them as they do from this page's own.
    (det) => onResult({ type: "detections", objects: det.objects ?? [], elapsed_ms: det.elapsed_ms, n: det.n }));

  // The element showing the robot picture on the H.264 transports, or null on MJPEG (whose
  // picture IS the view socket's JPEG). The one place that answers "what is on screen".
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const shownElement = useCallback(
    () =>
      transport === "h264" ? videoElRef.current
        : transport === "intra" ? intraCanvasRef?.current ?? null
          : null,
    [transport, intraCanvasRef],
  );
  const shownElementRef = useRef(shownElement);
  shownElementRef.current = shownElement;

  // The frame held on screen while its boxes are computed, and the pacing knobs the loop
  // reads every cycle (refs, so a slider move does not restart the loop).
  const [still, setStill] = useState<HTMLCanvasElement | null>(null);
  const pacingRef = useRef({ maxFps, imgsz });
  pacingRef.current = { maxFps, imgsz };

  useEffect(() => {
    if (!pairsLocally) return;
    const stop = startPairing<HTMLCanvasElement, Awaited<ReturnType<typeof detectFrame>>>({
      grab: async () => {
        const el = shownElementRef.current();
        const frame = el ? snapshotFrame(el) : null;
        if (!frame) return null;
        // Uploaded at YOLO's input size: iacore resizes to imgsz anyway, so more pixels only
        // cost upload time. Encoded FROM the snapshot, so shown and analysed are one image.
        const blob = await encodeFrame(frame, pacingRef.current.imgsz || 640);
        return blob ? { frame, blob } : null;
      },
      detect: (blob, signal) => detectFrame(blob, signal),
      onPair: (frame, det) => {
        setStill(frame);
        onResult({ type: "detections", ...det });
      },
      minIntervalMs: () => (pacingRef.current.maxFps > 0 ? 1000 / pacingRef.current.maxFps : 0),
    });
    return () => {
      stop();
      setStill(null);
    };
  }, [pairsLocally, transport, onResult]);

  // While viewing, push config changes over the view socket (no-op when producing;
  // the detect socket below handles that case). The hub only rebroadcasts real
  // changes, so this won't loop with the adopt above.
  useEffect(() => {
    if (viewing) sendViewConfig(config);
  }, [config, viewing, sendViewConfig]);

  // While viewing, the live boxes come from the fan-out (`robotObjects`); mirror
  // them into the shared overlay state (a VLM ask can still override with blue).
  useEffect(() => {
    if (viewing && !pairsLocally) {
      setObjects(robotObjects);
      setOverrideColor(undefined);
    }
  }, [viewing, pairsLocally, robotObjects]);

  const { connected } = useDetectionSocket({
    active,
    videoRef,
    config,
    onResult,
    onError: (m) => console.warn("server:", m),
    onConfig: applyServerConfig,
  });

  // Mirror this page's live socket into the header. The cleanup matters: the shared
  // state outlives this page (it sits above <Outlet/>), so without it the pill would
  // still claim "stream live" on Drive/About after the socket closed with the page.
  useEffect(() => {
    setConnected(viewing ? robotViewConnected : connected);
    return () => setConnected(false);
  }, [viewing, connected, robotViewConnected, setConnected]);

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
    fpsEmaRef.current = 0;
    lastFrameTsRef.current = 0;
  }, [stop]);

  // Use this device's own webcam (producer). Stops the robot camera if we started it.
  const chooseOwnCamera = useCallback(async () => {
    if (source === "robot") {
      try { await setRobotCamera("stop"); } catch { /* ignore */ }
    }
    setRobotCamStatus(null);
    setSource("own");
  }, [source]);

  // Use the robot camera: stop our webcam, start the bridge, view via /ws/view.
  const chooseRobotCamera = useCallback(async () => {
    handleStop();
    setSource("robot");
    setRobotCamStatus({ tone: "busy", text: t("Starting robot camera…") });
    try {
      const r = await setRobotCamera("start");
      setRobotCamStatus(r.error ? { tone: "error", text: r.error } : null);
    } catch (e) {
      setRobotCamStatus({
        tone: "error",
        text: e instanceof Error ? e.message : String(e),
      });
    }
  }, [handleStop, t]);

  // Opening on the robot camera starts it, as choosing it does.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    if (source === "robot") void chooseRobotCamera();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror the session read-only (what the old Monitor did): view /ws/view without
  // producing or starting the robot camera.
  const chooseMirror = useCallback(async () => {
    handleStop();
    if (source === "robot") {
      try { await setRobotCamera("stop"); } catch { /* ignore */ }
    }
    setRobotCamStatus(null);
    setSource("view");
  }, [handleStop, source]);

  // The current JPEG frame for a VLM ask: THE PICTURE ON SCREEN (plan §7), whichever source
  // and transport put it there — our webcam, the frame held by the YOLO pairing, the WebRTC
  // video or the intra canvas. Only on MJPEG is that picture the view socket's last JPEG.
  const getCurrentFrame = useCallback(async (): Promise<string | null> => {
    if (source === "own") {
      const video = videoRef.current;
      if (!video?.videoWidth) return null;
      return captureFrame(video, 0.85, vlmMaxSize);
    }
    const shown = source === "robot" ? still ?? shownElement() : null;
    if (shown) return captureFrame(shown, 0.85, vlmMaxSize);
    const blob = getLastFrameBlob();
    if (!blob) return null;
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  }, [source, videoRef, vlmMaxSize, getLastFrameBlob, still, shownElement]);

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
    const image = await getCurrentFrame();
    if (!image) return;

    vlmAbortRef.current?.abort();
    const ac = new AbortController();
    vlmAbortRef.current = ac;
    setVlmBusy(true);
    setVlmStatus(t("Asking the VLM… (this can take several seconds)"));
    setVlmOutput("");
    try {
      const res = await askVlm({ image, model: vlmModel, scope, variant }, ac.signal);
      if (res.error) {
        setVlmStatus(t("Error: {error}", { error: res.error }));
        return;
      }
      setVlmStatus(
        [res.model, fmtMs(res.elapsed_ms), res.did_think ? t("reasoned") : t("no reasoning"),
          ...(res.ok ? [] : [t("(invalid JSON)")])].join(" · "),
      );
      setVlmOutput(JSON.stringify(res.parsed, null, 2));
      // Overlay the VLM boxes (blue) on top of the still frame.
      if (res.ok && Array.isArray(res.parsed?.objects)) {
        setObjects(res.parsed.objects);
        setOverrideColor(BLUE);
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setVlmStatus(t("Request failed: {error}", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setVlmBusy(false);
    }
  }, [getCurrentFrame, vlmModel, scope, variant, t]);

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
      const image = await getCurrentFrame();
      if (!image) return null;

      vlmAbortRef.current?.abort();
      const ac = new AbortController();
      vlmAbortRef.current = ac;
      setVlmBusy(true);
      setVlmStatus(t("Asking the VLM…"));
      setVlmOutput("");
      const t0 = performance.now();
      let tFirst: number | null = null;
      try {
        let acc = "";
        const answer = await askVlmStream(
          { image, model: vlmModel, prompt, robot: cmdRobot },
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
        setVlmStatus(t("{total} · first reply {first}", { total: fmtMs(total), first: fmtMs(firstMs) }));
        const text = answer.trim() || t("(no answer)");
        setVlmOutput(text);
        return text;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return null;
        setVlmStatus(t("Request failed: {error}", { error: e instanceof Error ? e.message : String(e) }));
        return null;
      } finally {
        setVlmBusy(false);
      }
    },
    [getCurrentFrame, vlmModel, cmdRobot, t],
  );

  // Hands-free voice: say "robot", speak the question, it auto-submits and (in
  // spoken mode) reads the answer aloud as it streams. Also drives the manual
  // read-aloud button.
  const { va, registerAsk } = useVoiceAssistantContext();
  const { presence } = usePresence();
  // The assistant's conversations, kept per person on the server: they survive a camera switch,
  // a reload or another computer.
  const chats = useChats(mayAnalyze);
  // Spoken answers' volume: the robot speaker's when it speaks through the robot, else this
  // device's.
  const toRobotSpeaker = va.speechOutput === "robot" && va.robotSpeaker;
  const robotVolume = useRobotVolume(cmdRobot, toRobotSpeaker);
  const deviceVolume = useSpeechVolume();
  // While this page is open, questions are about ITS frame and the answer shows in its panel;
  // elsewhere the app-wide assistant asks about the robot's camera (VoiceAssistantContext).
  useEffect(() => {
    registerAsk(askPromptStream);
    return () => registerAsk(null);
  }, [askPromptStream, registerAsk]);

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
    setExecuteStatus({ tone: "busy", text: t("Sending to the robot…") });
    try {
      const r = await executeCommand(
        res.robot, res.skill, res.params, safeModeRef.current);
      if (r.ok) {
        const detail = r.detail ?? t("sent");
        setExecuteStatus({
          tone: "ok",
          text: r.dry_run ? t("{detail} (dry-run, not moved)", { detail }) : detail,
        });
      } else if (r.blocked) {
        setExecuteStatus({ tone: "blocked", text: r.error ?? t("blocked by SAFE_MODE") });
      } else {
        setExecuteStatus({ tone: "error", text: r.error ?? r.detail ?? t("failed") });
      }
    } catch (e) {
      setExecuteStatus({
        tone: "error",
        text: t("Request failed: {error}", { error: e instanceof Error ? e.message : String(e) }),
      });
    } finally {
      setExecuting(false);
    }
  }, [t]);

  // --- Robot command interpreter (verification) ---
  // Send a command text to the interpreter and show the chosen skill + JSON.
  const runInterpret = useCallback(
    async (text: string) => {
      const said = text.trim();
      if (!said) return;
      cmdAbortRef.current?.abort();
      const ac = new AbortController();
      cmdAbortRef.current = ac;
      setCmdBusy(true);
      setCmdStatus(t("Interpreting…"));
      try {
        const res = await interpretCommand(said, cmdModel, cmdRobot, ac.signal);
        if (res.error) {
          setCmdStatus(t("Error: {error}", { error: res.error }));
          return;
        }
        setCmdResult(res);
        setCmdStatus(
          [res.model, fmtMs(res.elapsed_ms),
            ...(res.ok ? [] : [t("(invalid JSON — fell back to unknown)")])].join(" · "),
        );
        // Auto-run: fire immediately when armed + auto (no button needed).
        if (execEnabledRef.current && autoRunRef.current) void executeResult(res);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setCmdStatus(t("Request failed: {error}", { error: e instanceof Error ? e.message : String(e) }));
      } finally {
        setCmdBusy(false);
      }
    },
    [cmdModel, cmdRobot, executeResult, t],
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
    setCmdStatus(t("Listening… speak a command"));
    try {
      const blob = await cmdRecorder.recordUtterance();
      if (!blob) {
        setCmdStatus(t("Didn't catch that — try again"));
        return;
      }
      setCmdStatus(t("Transcribing…"));
      const res = await transcribeAudio(blob);
      const text = res.text?.trim();
      if (res.error || !text) {
        setCmdStatus(res.error ? t("Error: {error}", { error: res.error }) : t("Nothing recognized"));
        return;
      }
      setCmdText(text);
      await runInterpret(text); // manages its own busy/status from here
    } catch (e) {
      setCmdStatus(t("Voice error: {error}", { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setCmdBusy(false);
    }
  }, [cmdBusy, cmdRecorder, runInterpret, t]);

  // Manual trigger: send the current interpreted skill to the robot.
  const handleExecuteOnRobot = useCallback(
    () => void executeResult(cmdResult), [executeResult, cmdResult]);

  // Emergency stop: halt the robot NOW, regardless of the switches. Sends the
  // `stop` skill (StopMove + cancels the executor's move loop) with safe_mode off
  // (stop is never blocked). Named *Robot to avoid the camera's handleStop.
  const handleStopRobot = useCallback(async () => {
    setExecuting(true);
    setExecuteStatus({ tone: "busy", text: t("Stopping the robot…") });
    try {
      const r = await executeCommand(cmdRobot, "stop", {}, false);
      setExecuteStatus(r.ok
        ? { tone: "stopped", text: t("Stopped") }
        : { tone: "error", text: r.error ?? t("stop failed") });
    } catch (e) {
      setExecuteStatus({
        tone: "error",
        text: t("Stop failed: {error}", { error: e instanceof Error ? e.message : String(e) }),
      });
    } finally {
      setExecuting(false);
    }
  }, [cmdRobot, t]);

  if (optionsError) {
    return (
      <main className="p-4 text-bad-fg">
        {t("Could not reach the backend at its configured URL: {error}.", { error: optionsError })}{" "}
        {t("Check that the backend is running and that {setting} in {file} is correct.", {
          setting: "BACKEND_URL", file: "public/config.js",
        })}
      </main>
    );
  }

  if (!options) {
    return <main className="p-4 text-muted">{t("Loading options…")}</main>;
  }

  const variants = options.scopes[scope]?.variants ?? [];
  // LIVE only while pictures arrive — a connected socket with nothing on it is not live.
  const live = source === "own" ? active : transport === "mjpeg" ? !!robotFrameUrl : receiving;
  const sourceText = source === "own"
    ? facing === "environment" ? t("My camera · rear") : t("My camera · front")
    : source === "robot"
      ? videoDetail ? t("Robot camera · {detail}", { detail: videoDetail }) : t("Robot camera")
      : t("View only · mirroring the session");
  // Boxes on screen, counted per class, for the strip under the video.
  // Most first, then by name: a stable order, so the chips do not swap places every frame.
  const perClass = Object.values(objects.reduce<Record<string, { label: string; n: number; color: string }>>((acc, o) => {
    const k = o.type;
    acc[k] ??= { label: k, n: 0, color: colorForObject(o) };
    acc[k].n += 1;
    return acc;
  }, {})).sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));

  const overlay = (
    <>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-black/35" />
      <div className="absolute top-3 left-3 z-10 flex max-w-[70%] flex-wrap items-center gap-2">
        <span className="on-video flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11.5px] font-extrabold tracking-wider">
          <span className={`size-2 rounded-full ${live ? "animate-pulse bg-[#ff5a5f]" : "bg-dim"}`} />
          {live ? t("LIVE") : source === "own" ? t("CAMERA OFF") : robotViewConnected ? t("NO VIDEO") : t("CONNECTING")}
        </span>
        <span className="on-video flex h-9 min-w-0 items-center rounded-lg px-3 text-[11.5px] font-semibold"><span className="truncate">{sourceText}</span></span>
      </div>
      <div className="absolute top-3 right-14 z-10">
        <button type="button" disabled={!mayAnalyze} onClick={() => setYoloEnabled(!yoloEnabled)}
          title={mayAnalyze ? t("Live detection on/off — off keeps the GPU idle") : t("Live detection")}
          className={`on-video flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-extrabold transition enabled:cursor-pointer ${
            yoloEnabled ? "" : "on-video-muted"}`}>
          <span className={`size-2 rounded-full ${yoloEnabled ? "bg-[#2fc1b1] shadow-[0_0_0_3px_rgba(47,193,177,0.25)]" : "bg-dim"}`} />
          YOLO
          {yoloEnabled && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-fg px-1 text-[11px] text-bg">{objects.length}</span>}
        </button>
      </div>
      {source === "own" && (
        <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center">
          <div className="flex items-center gap-1 rounded-2xl bg-white/90 p-1.5 shadow-lift backdrop-blur dark:bg-[#171922]/90">
            <button type="button" onClick={handleStart} disabled={active}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#0f1623] px-3 py-2 text-[12.5px] font-bold text-white transition disabled:cursor-default disabled:opacity-40 dark:bg-white dark:text-[#0f1623]">
              <IconPlayerPlayFilled size={14} />{t("Start camera")}
            </button>
            <button type="button" onClick={handleStop} disabled={!active}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-bold text-muted transition hover:bg-subtle hover:text-fg disabled:cursor-default disabled:opacity-40">
              <IconPlayerStopFilled size={14} />{t("Stop")}
            </button>
            <span className="h-5 w-px bg-line" />
            <button type="button" onClick={flip} title={t("Switch front/rear camera")}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-bold text-muted transition hover:bg-subtle hover:text-fg">
              <IconCameraRotate size={16} />{facing === "environment" ? t("Rear") : t("Front")}
            </button>
          </div>
        </div>
      )}
      {source === "view" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
          <span className="on-video flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold">
            <IconEye size={15} className="text-[#5fe3d4]" />{t("Read-only mirror of what this session is showing")}
          </span>
        </div>
      )}
    </>
  );

  // The readings under the picture. With the robot camera, the frame rate is what reaches the
  // gateway (presence), so it shows with detection off too; with this browser's camera it is
  // the cadence of detection replies. Inference time comes with each detection reply.
  const detFps = /^[\d.]+ fps/.test(fps) ? fps.replace(/ fps.*/, "") : null;
  const inferMs = /ms/.test(fps) ? fps.replace(/.*?(\d+) ms.*/, "$1") : null;
  const cam = presence?.robot_cam;
  const frameRate = source !== "own" ? (cam?.live && cam.fps ? cam.fps.toFixed(1) : null) : detFps;
  const camRes = cam?.live ? cam.resolution ?? null : null;
  // "View only" mirrors what someone else is streaming, so it is offered only when there is
  // something to mirror: another browser's camera, or the robot camera running while this page
  // is not on it. A viewer always has it (it is all they may do), and it never vanishes under
  // the person using it.
  const othersStreaming = (presence?.web.producers ?? 0) - (source === "own" && active ? 1 : 0) > 0;
  const mayMirror = !mayOperate || source === "view" || othersStreaming || (!!cam?.live && source !== "robot");

  return (
    <main className={`grid gap-4 p-4 lg:h-full lg:overflow-hidden ${mayAnalyze ? "lg:grid-cols-[minmax(0,1fr)_420px]" : ""}`}>
      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        {/* Source, and for the robot camera its picture settings */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Segmented className="flex rounded-xl bg-subtle p-1">
            {([
              ["own", t("My camera"), IconDeviceLaptop, mayAnalyze, chooseOwnCamera],
              ["robot", t("Robot camera"), IconVideo, mayOperate, chooseRobotCamera],
              ["view", t("View only"), IconEye, mayMirror, chooseMirror],
            ] as const).filter((b) => b[3]).map(([id, label, Icon, , go]) => (
              <button key={id} type="button" onClick={() => void go()} data-on={source === id}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
                  source === id ? "text-fg" : "text-muted hover:text-fg"}`}>
                <Icon size={15} />{label}
              </button>
            ))}
          </Segmented>
          <StatusText status={robotCamStatus} className="min-w-0 truncate text-xs text-muted" />
          {cameraError && <span className="min-w-0 truncate text-xs text-bad-fg">{cameraError}</span>}
          <span className="flex-1" />
          {/* The robot camera's picture, on the bar as in the mockup: which camera, and the
              path it takes here. */}
          {source === "robot" && (
            <div className="flex flex-wrap items-center gap-2">
              <RobotCameraSwitch />
              <VideoTransportSwitch />
            </div>
          )}
        </div>

        {source === "own" ? (
          <VideoStage videoRef={videoRef} objects={objects} overrideColor={overrideColor} overlay={overlay} />
        ) : (
          <RobotCameraStage
            intraCanvasRef={intraCanvasRef}
            frameUrl={robotFrameUrl}
            getBlob={getLastFrameBlob}
            connected={robotViewConnected}
            objects={objects}
            overrideColor={overrideColor}
            overlay={overlay}
            stream={transport === "h264" ? h264Stream : null}
            videoElRef={videoElRef}
            still={still}
          />
        )}

        {/* Readings + what is on screen */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-line bg-panel px-4 py-2.5 shadow-card">
          <Reading label={t("Frame rate")} value={frameRate ?? "—"} unit={frameRate ? "fps" : undefined} />
          {source !== "own" && camRes && <Reading label={t("Resolution")} value={camRes} />}
          <Reading label={t("YOLO inference")} value={yoloEnabled && inferMs ? inferMs : "—"} unit={yoloEnabled && inferMs ? "ms" : undefined} />
          <Reading label={t("Objects")} value={yoloEnabled ? String(objects.length) : "—"} />
          <Reading label={t("Model")} value={yoloEnabled ? `${yoloModel.replace(/\.pt$/, "")} · ${imgsz}px` : t("Detection off")} />
          <ClassChips classes={perClass} className="ml-auto max-w-full flex-1 justify-end" />
        </div>
      </div>

      {/* Side panel: the AI, detection and the command interpreter, each with its own scroll. */}
      {mayAnalyze && (
        <aside className="flex min-h-[480px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-card">
          <Segmented className="m-3 mb-0 flex gap-0.5 rounded-xl bg-subtle p-1">
            {([
              ["vlm", t("Ask VLM"), IconSparkles],
              ["yolo", t("Detection"), IconScan],
              ["command", t("Command"), IconTerminal2],
            ] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => setPanel(id)} data-on={panel === id}
                className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg py-1.5 text-[12.5px] font-bold transition-colors ${
                  panel === id ? "text-fg" : "text-muted hover:text-fg"}`}>
                <Icon size={15} />{label}
              </button>
            ))}
          </Segmented>
          {/* The chat keeps its own scroll (and stays mounted, so switching tabs keeps the
              conversation); the other two scroll as a whole. */}
          <div className={`min-h-0 flex-1 p-4 ${panel === "vlm" ? "flex flex-col" : "overflow-y-auto"}`}>
            <div className={panel === "vlm" ? "flex min-h-[520px] flex-1 flex-col lg:min-h-0" : "hidden"}>
              <VlmPanel
                chat={{
                  chats: chats.chats,
                  current: chats.current,
                  history: chats.history,
                  version: chats.version,
                  error: chats.error,
                  onOpen: (id) => void chats.open(id),
                  onDelete: (id) => void chats.remove(id),
                  onSave: (msg) => chats.save({ ...msg, robot: source === "own" ? "" : cmdRobot }),
                }}
                models={options.vlm_models}
                scopes={Object.keys(options.scopes)}
                variants={variants}
                model={vlmModel}
                scope={scope}
                variant={variant}
                canAsk={source === "own" ? active : !!robotFrameUrl}
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
                  wakeSupported: va.wakeSupported,
                  voiceMode: va.voiceMode,
                  onToggleVoiceMode: va.toggleVoiceMode,
                  listenMode: va.listenMode,
                  onListenModeChange: va.setListenMode,
                  onListenOnce: va.listenOnce,
                  phase: va.phase,
                  volume: toRobotSpeaker
                    ? { value: robotVolume.volume, max: robotVolume.max, where: "robot", onChange: robotVolume.change }
                    : { value: Math.round(deviceVolume * 100), max: 100, where: "device", onChange: (v) => setSpeechVolume(v / 100) },
                  speechSupported: va.speechSupported,
                  spokenMode: va.spokenMode,
                  onToggleSpokenMode: va.toggleSpokenMode,
                  fillerMode: va.fillerMode,
                  onToggleFillerMode: va.toggleFillerMode,
                  status: va.status,
                  robotMic: va.robotMic,
                  robotEar: va.robotEar,
                  onToggleRobotEar: va.toggleRobotEar,
                  robotEarStatus: va.robotEarStatus,
                  speaking: va.speaking,
                  onSpeak: (text) => va.speak(text ?? vlmOutput),
                  onStopSpeak: va.stopSpeak,
                  voices: va.voices,
                  voiceURI: va.voiceURI,
                  onVoiceChange: va.onVoiceChange,
                  speechOutput: va.speechOutput,
                  onSpeechOutputChange: va.onSpeechOutputChange,
                  robotSpeaker: va.robotSpeaker,
                  robotSpeakerError: va.robotSpeakerError,
                }}
              />
            </div>
            {panel === "yolo" && (
              <YoloPanel
                models={options.yolo_models}
                classOptions={classOptions}
                model={yoloModel}
                conf={conf}
                imgsz={imgsz}
                classes={classes}
                maxFps={maxFps}
                enabled={yoloEnabled}
                now={{ objects: objects.length, inferMs, fps: detFps, perClass }}
                onEnabledChange={setYoloEnabled}
                onModelChange={handleModelChange}
                onConfChange={setConf}
                onImgszChange={setImgsz}
                onClassesChange={setClasses}
                onMaxFpsChange={setMaxFps}
              />
            )}
            {panel === "command" && (
              <CommandPanel
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
            )}
          </div>
        </aside>
      )}
    </main>
  );
}

/** One reading in the strip under the video: a small label over a value. */
function Reading({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <small className="text-[10.5px] font-bold tracking-wider text-dim uppercase">{label}</small>
      <b className="text-[14.5px] font-bold">
        {value}
        {unit && <em className="ml-1 text-[11px] font-semibold text-muted not-italic">{unit}</em>}
      </b>
    </div>
  );
}

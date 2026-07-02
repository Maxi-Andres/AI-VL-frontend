import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { askVlm, fetchClasses } from "../api/backend";
import { WS_VIEW_URL } from "../config";
import { YoloPanel } from "../components/live/YoloPanel";
import { VlmPanel } from "../components/live/VlmPanel";
import { Button } from "../components/ui/Button";
import { useStatus } from "../components/layout/StatusContext";
import { useOptions } from "../hooks/useOptions";
import { drawBoxes } from "../lib/draw";
import type { DetectedObject, YoloConfig } from "../types";

// VLM overlay boxes are drawn one flat color (see LivePage).
const BLUE = "#60a5fa";

// The frame fan-out message the backend sends over /ws/view: the same detection
// payload as /ws/detect, plus the JPEG the phone uploaded (base64).
interface FrameMsg {
  type: "frame";
  jpeg_b64: string;
  objects: DetectedObject[];
  elapsed_ms: number;
  n: number;
}
type ViewMsg =
  | FrameMsg
  | { type: "config"; state: unknown }
  | { type: "error"; message: string };

/**
 * Server-side monitor: mirrors what the phone sees (live video + detections)
 * and lets you drive the same controls, WITHOUT being a camera itself — the
 * phone is the only video source. It streams nothing until you press "Activar":
 * while inactive no socket is open, so an idle monitor uses zero bandwidth.
 */
export function MonitorPage() {
  const { options, error: optionsError } = useOptions();
  const { setConnected } = useStatus();

  const [activated, setActivated] = useState(false);
  const [waiting, setWaiting] = useState(false); // socket open, no frame yet
  const wsRef = useRef<WebSocket | null>(null);

  // --- YOLO controls (same as LivePage) ---
  const [yoloModel, setYoloModel] = useState("");
  const [conf, setConf] = useState(0.25);
  const [imgsz, setImgsz] = useState(320);
  const [classes, setClasses] = useState<string[]>([]);
  const [classOptions, setClassOptions] = useState<string[]>([]);

  // --- VLM controls ---
  const [vlmModel, setVlmModel] = useState("");
  const [scope, setScope] = useState("");
  const [variant, setVariant] = useState("");

  // --- Overlay + metrics + latest mirrored frame ---
  const [objects, setObjects] = useState<DetectedObject[]>([]);
  const [overrideColor, setOverrideColor] = useState<string | undefined>(
    undefined,
  );
  const [fps, setFps] = useState("— ms/frame");
  const [count, setCount] = useState("0 objects");
  const [frameUrl, setFrameUrl] = useState("");
  const lastFrameRef = useRef(""); // last JPEG data URL, for the VLM request

  // --- VLM request state ---
  const [vlmBusy, setVlmBusy] = useState(false);
  const [vlmStatus, setVlmStatus] = useState("");
  const [vlmOutput, setVlmOutput] = useState("");

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  // Push config into the shared session whenever it changes (while activated).
  useEffect(() => {
    const ws = wsRef.current;
    if (activated && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(config));
    }
  }, [config, activated]);

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
    setFps("— ms/frame");
    setCount("0 objects");
  }, [setConnected]);

  const activate = useCallback(() => {
    if (wsRef.current) return;
    const ws = new WebSocket(WS_VIEW_URL);
    wsRef.current = ws;
    setWaiting(true);
    ws.onopen = () => {
      setActivated(true); // the config-change effect then pushes current config
      setConnected(true);
    };
    ws.onclose = () => {
      setConnected(false);
      setActivated(false);
      setWaiting(false);
    };
    ws.onerror = () => setConnected(false);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data as string) as ViewMsg;
      if (m.type === "frame") {
        const url = `data:image/jpeg;base64,${m.jpeg_b64}`;
        lastFrameRef.current = url;
        setFrameUrl(url);
        setObjects(m.objects ?? []);
        setOverrideColor(undefined); // YOLO: color each box by class
        setFps(`${m.elapsed_ms} ms/frame`);
        setCount(`${m.n} objects`);
        setWaiting(false);
      } else if (m.type === "error") {
        console.warn("server:", m.message);
      }
      // "config" is informational; the controls are seeded from /api/options.
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
      if (res.ok && Array.isArray(res.parsed?.objects)) {
        setObjects(res.parsed.objects);
        setOverrideColor(BLUE);
      }
    } catch (e) {
      setVlmStatus(`Request failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setVlmBusy(false);
    }
  }, [vlmModel, scope, variant]);

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
        <h2 className="m-0 text-lg font-semibold">Monitor del server</h2>
        <p className="m-0 max-w-md text-sm text-muted">
          Espeja en vivo lo que ve el celular (video + detecciones) y te deja
          controlar las opciones desde acá. El celular sigue siendo la única
          cámara. Mientras esté desactivado no se transmite nada, así que no
          consume ancho de banda hasta que lo actives.
        </p>
        <Button onClick={activate} className="text-base">
          Activar monitor
        </Button>
      </main>
    );
  }

  const variants = options.scopes[scope]?.variants ?? [];

  return (
    <main className="grid grid-cols-1 items-start gap-4 p-4 lg:grid-cols-[1fr_320px]">
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
                ? "Esperando frames del celular…"
                : "Sin señal del celular"}
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
          <Button variant="secondary" onClick={deactivate}>
            Desactivar
          </Button>
          <span className="text-muted tabular-nums">{fps}</span>
          <span className="text-muted tabular-nums">{count}</span>
        </div>
      </section>

      <aside className="rounded-lg border border-line bg-panel p-3.5">
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
          canAsk={!!frameUrl}
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

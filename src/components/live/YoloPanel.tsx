import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { IconCheck, IconScan, IconSearch, IconX } from "@tabler/icons-react";
import { Switch } from "../ui/Switch";
import { Segmented } from "../ui/Segmented";
import { msg, useT } from "../../i18n";

const IMG_SIZES = [320, 640, 960, 1280];
const FPS_CAPS = [1, 2, 5, 10, 15, 30, 0]; // 0 = unlimited

// One-tap class sets, offered when the model knows them (COCO's names).
const PRESETS: { label: string; classes: string[] }[] = [
  { label: msg("People"), classes: ["person"] },
  { label: msg("Vehicles"), classes: ["bicycle", "car", "motorcycle", "bus", "truck"] },
  { label: msg("Animals"), classes: ["bird", "cat", "dog", "horse"] },
];

/** What detection is seeing right now, measured on the page from the replies. */
export interface DetectionNow {
  objects: number;
  /** Server-side inference time per frame (ms), when replies are coming. */
  inferMs: string | null;
  /** Frames actually processed per second. */
  fps: string | null;
  perClass: { label: string; n: number; color: string }[];
}

interface Props {
  models: string[];
  classOptions: string[];
  model: string;
  conf: number;
  imgsz: number;
  classes: string[];
  /** Max frames/sec to send. 0 = unlimited. */
  maxFps: number;
  /** Master YOLO on/off (off = no detection runs, no GPU use). */
  enabled: boolean;
  now: DetectionNow;
  onEnabledChange: (v: boolean) => void;
  onModelChange: (v: string) => void;
  onConfChange: (v: number) => void;
  onImgszChange: (v: number) => void;
  onClassesChange: (v: string[]) => void;
  onMaxFpsChange: (v: number) => void;
}

/**
 * Live detection (YOLO), as in the mockup: one switch that says what it costs, then each
 * setting on its own row with a word on what it does, the image size and frame cap as buttons,
 * and the classes as chips you search and tap — with one-tap sets. While it runs, what it sees
 * right now sits under the switch.
 */
export function YoloPanel({
  models,
  classOptions,
  model,
  conf,
  imgsz,
  classes,
  maxFps,
  enabled,
  now,
  onEnabledChange,
  onModelChange,
  onConfChange,
  onImgszChange,
  onClassesChange,
  onMaxFpsChange,
}: Props) {
  const t = useT();
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle ? classOptions.filter((c) => c.toLowerCase().includes(needle)) : classOptions;
    // The chosen ones first, so a choice never scrolls out of sight.
    return [...list.filter((c) => classes.includes(c)), ...list.filter((c) => !classes.includes(c))];
  }, [q, classOptions, classes]);
  const presets = PRESETS.map((p) => ({ ...p, classes: p.classes.filter((c) => classOptions.includes(c)) }))
    .filter((p) => p.classes.length);
  const toggle = (c: string) => onClassesChange(classes.includes(c) ? classes.filter((x) => x !== c) : [...classes, c]);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

  return (
    <div>
      {/* The switch, and what it costs */}
      <div className={`flex items-center gap-3 rounded-2xl p-3.5 transition-colors duration-300 ${enabled ? "bg-good-bg" : "bg-subtle"}`}>
        <span className={`grid size-9 shrink-0 place-items-center rounded-[10px] bg-panel shadow-card transition-colors ${enabled ? "text-good-fg" : "text-muted"}`}>
          <IconScan size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-[13.5px]">{t("Live detection")}</b>
          <small className="block text-xs text-muted">
            {enabled
              ? t("Running {model} at {size}px on the server", { model: model.replace(/\.pt$/, ""), size: imgsz })
              : t("Off — nothing is detected and the GPU stays idle")}
          </small>
        </div>
        <Switch on={enabled} onChange={onEnabledChange} label={t("Live detection")} />
      </div>

      {/* What it sees right now */}
      <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${enabled ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="mt-2 rounded-2xl border border-line p-3">
            <div className="grid grid-cols-3 gap-2">
              <Stat label={t("In view")} value={String(now.objects)} />
              <Stat label={t("Inference")} value={now.inferMs ?? "—"} unit={now.inferMs ? "ms" : undefined} />
              <Stat label={t("Processed")} value={now.fps ?? "—"} unit={now.fps ? "fps" : undefined} />
            </div>
            <div className="mt-2.5 flex min-h-[26px] flex-wrap gap-1.5">
              {now.perClass.length ? now.perClass.map((c) => (
                <span key={c.label} className="flex animate-rise items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-xs font-bold">
                  <span className="size-2 rounded-sm" style={{ background: c.color }} />
                  {c.label}<span className="text-muted">×{c.n}</span>
                </span>
              )) : <span className="self-center text-xs text-dim">{classes.length ? t("Nothing in view of the chosen classes.") : t("Nothing in view.")}</span>}
            </div>
          </div>
        </div>
      </div>

      <div className={`transition-opacity ${enabled ? "" : "opacity-70"}`}>
        <Row label={t("Model")} hint={t("Bigger models see more, and cost more GPU")}>
          <select value={model} onChange={(e) => onModelChange(e.target.value)} aria-label={t("Model")}
            className="w-40 rounded-lg border border-line bg-bg px-2 py-1.5 text-xs font-semibold text-fg focus:border-accent focus:outline-none">
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </Row>

        <div className="border-b border-line py-3">
          <div className="flex items-baseline justify-between">
            <b className="text-[13px]">{t("Confidence")}</b>
            <b className="font-mono text-[12.5px]">{conf.toFixed(2)}</b>
          </div>
          <input type="range" min={0.05} max={0.9} step={0.05} value={conf} aria-label={t("Confidence")}
            onChange={(e) => onConfChange(parseFloat(e.target.value))}
            className="mt-2 w-full accent-[var(--color-accent)]" />
          <div className="flex justify-between text-[11px] text-dim">
            <span>{t("More boxes, more mistakes")}</span><span>{t("Fewer, surer")}</span>
          </div>
        </div>

        <Row label={t("Image size")} hint={t("Bigger finds smaller objects, costs GPU")}>
          <Segs options={IMG_SIZES.map((n) => [n, String(n)])} value={imgsz} onChange={onImgszChange} />
        </Row>

        <Row label={t("Max FPS")} hint={t("Frames sent per second: CPU and bandwidth")}>
          <Segs options={FPS_CAPS.map((n) => [n, n ? String(n) : "∞"])} value={maxFps} onChange={onMaxFpsChange} />
        </Row>

        <div className="mt-4 mb-1.5 flex items-center text-[11px] font-extrabold tracking-[.08em] text-dim uppercase">
          {t("Classes")}
          <span className="ml-auto text-[11.5px] font-semibold tracking-normal normal-case">
            {classes.length ? t("{n} chosen", { n: classes.length }) : t("Empty = detect everything")}
          </span>
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Preset on={classes.length === 0} onClick={() => onClassesChange([])}>{t("Everything")}</Preset>
          {presets.map((p) => (
            <Preset key={p.label} on={same(classes, p.classes)} onClick={() => onClassesChange(p.classes)}>{t(p.label)}</Preset>
          ))}
        </div>
        <label className="mb-2.5 flex h-9 items-center gap-2 rounded-lg border border-line bg-bg px-2.5 focus-within:border-accent">
          <IconSearch size={15} className="text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Filter {n} classes…", { n: classOptions.length })}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-fg outline-none placeholder:text-dim" />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label={t("Clear the filter")} className="cursor-pointer text-dim hover:text-fg">
              <IconX size={14} />
            </button>
          )}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {shown.map((c) => {
            const on = classes.includes(c);
            return (
              <button key={c} type="button" onClick={() => toggle(c)} aria-pressed={on}
                className={`flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold transition duration-150 active:scale-95 ${
                  on ? "border-fg bg-fg text-bg" : "border-line text-muted hover:border-dim hover:text-fg"}`}>
                {on && <IconCheck size={12} stroke={3} />}
                {c}
              </button>
            );
          })}
          {!shown.length && <span className="text-xs text-dim">{t("No class matches “{q}”.", { q })}</span>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <small className="block text-[10.5px] font-bold tracking-wider text-dim uppercase">{label}</small>
      <b className="font-mono text-[15px]">
        {value}
        {unit && <em className="ml-1 text-[11px] font-semibold text-muted not-italic">{unit}</em>}
      </b>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-line py-3">
      <div className="min-w-0 flex-1">
        <b className="block text-[13px]">{label}</b>
        {hint && <small className="block text-[11.5px] leading-snug text-dim">{hint}</small>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segs<T extends number>({ options, value, onChange }: {
  options: [T, string][]; value: T; onChange: (v: T) => void;
}) {
  return (
    <Segmented className="flex rounded-[10px] bg-subtle p-[3px]">
      {options.map(([v, label]) => (
        <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={value === v} data-on={value === v}
          className={`min-w-8 cursor-pointer rounded-lg px-2 py-1 text-xs font-bold transition-colors ${
            value === v ? "text-fg" : "text-muted hover:text-fg"}`}>
          {label}
        </button>
      ))}
    </Segmented>
  );
}

function Preset({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-bold transition active:scale-95 ${
        on ? "bg-good-bg text-good-fg" : "bg-subtle text-muted hover:text-fg"}`}>
      {children}
    </button>
  );
}

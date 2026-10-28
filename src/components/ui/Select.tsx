import { IconCheck, IconChevronDown } from "@tabler/icons-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";

// The app's own dropdown, in place of the native <select>: the browser draws a native list in
// the OS look (white and blue, greyed options), which matches neither theme. This one is a
// button that opens a listbox styled like the header menus (DropMenu).
//
// Where the list lives: a portal, with fixed positioning measured from the button. Inside the
// page it would be cut by any overflow-hidden parent, and the Drive cockpit's glass bars
// (backdrop-filter) would even become the containing block of a fixed child. When an element
// other than <html> is in the browser's fullscreen, only that element's subtree is drawn, so
// the portal goes INTO it; otherwise into <body>. It flips upward when there is less room below
// than it needs and more above, and sits above the dialogs (z 1000) and the expanded stage (200).
//
// Focus stays on the button (the "select-only combobox" pattern): the keys are handled there,
// and every key it handles stops at it — the Drive page drives on arrows and w/a/s/d from a
// window listener, and Escape from a document listener closes dialogs and fullscreen.

export interface SelectOption {
  value: string;
  /** Already translated: what the button and the list show. */
  label: string;
  /** Shown dimmed and cannot be picked. */
  disabled?: boolean;
  /** Tooltip, e.g. why the option is disabled. */
  title?: string;
}

interface Props {
  value: string;
  /** A plain string is both the value and the label. */
  options: readonly (SelectOption | string)[];
  /** Called with the picked value, only when it differs from `value` (like a native change). */
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  /** The button's whole look (border, background, padding, size, width); defaults to LOOK. */
  className?: string;
  title?: string;
  "aria-label"?: string;
  /** Shown when `value` matches no option. */
  placeholder?: string;
}

const LOOK = "w-full rounded-md border border-line bg-bg p-1.5 text-fg focus:border-accent focus:outline-none";
const MAX_HEIGHT = 288;
const GAP = 4;
const EDGE = 8;
const TYPEAHEAD_MS = 600;

interface Place {
  left: number;
  top?: number;
  bottom?: number;
  minWidth: number;
  maxHeight: number;
  up: boolean;
}

const norm = (o: SelectOption | string): SelectOption => (typeof o === "string" ? { value: o, label: o } : o);

export function Select({
  value, options, onChange, disabled = false, id, className = LOOK, title, placeholder,
  "aria-label": ariaLabel,
}: Props) {
  const opts = options.map(norm);
  const autoId = useId();
  const triggerId = id ?? `${autoId}-trigger`;
  const listId = `${autoId}-list`;
  const optId = (i: number) => `${autoId}-opt-${i}`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [place, setPlace] = useState<Place | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });

  // A select disabled while open (busy) closes, and does not reopen by itself when enabled again.
  if (open && disabled) setOpen(false);
  const shown = open && !disabled;
  const selected = opts.findIndex((o) => o.value === value);
  const current = selected >= 0 ? opts[selected].label : (placeholder ?? "");

  const close = useCallback(() => {
    setOpen(false);
    setPlace(null);
  }, []);

  const enabledFrom = (start: number, step: 1 | -1): number => {
    for (let i = start; i >= 0 && i < opts.length; i += step) if (!opts[i].disabled) return i;
    return -1;
  };

  /** Opens the list; returns the option it starts on. */
  const openList = (at?: "first" | "last"): number => {
    if (disabled || opts.length === 0) return -1;
    let i = selected >= 0 && !opts[selected].disabled ? selected : enabledFrom(0, 1);
    if (at === "first") i = enabledFrom(0, 1);
    if (at === "last") i = enabledFrom(opts.length - 1, -1);
    setActive(i);
    setOpen(true);
    return i;
  };

  const pick = (i: number) => {
    const o = opts[i];
    if (!o || o.disabled) return;
    close();
    trigger.current?.focus();
    if (o.value !== value) onChange(o.value);
  };

  const move = (to: number, step: 1 | -1) => {
    const clamped = Math.max(0, Math.min(opts.length - 1, to));
    const i = enabledFrom(clamped, step);
    const j = i >= 0 ? i : enabledFrom(clamped, step === 1 ? -1 : 1);
    if (j >= 0) setActive(j);
  };

  // Type-ahead: letters typed in quick succession jump to the next option starting with them;
  // the same letter again cycles through the options that start with it.
  const typing = () => !!typed.current.text && Date.now() - typed.current.at < TYPEAHEAD_MS;
  const typeAhead = (ch: string, base: number) => {
    const text = (typing() ? typed.current.text : "") + ch.toLowerCase();
    typed.current = { text, at: Date.now() };
    const cycling = text.length > 1 && [...text].every((c) => c === text[0]);
    const needle = cycling ? text[0] : text;
    const from = cycling || text.length === 1 ? base + 1 : Math.max(base, 0);
    for (let k = 0; k < opts.length; k++) {
      const i = (from + k) % opts.length;
      if (!opts[i].disabled && opts[i].label.toLowerCase().startsWith(needle)) {
        setActive(i);
        return;
      }
    }
  };

  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (disabled) return;
    const k = e.key;
    const printable = k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!shown) {
      if (k === "ArrowDown" || k === "ArrowUp" || k === "Enter" || k === " ") openList();
      else if (k === "Home") openList("first");
      else if (k === "End") openList("last");
      else if (printable) {
        typeAhead(k, openList());
      } else return; // Escape, Tab… are not ours while closed
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (k === "Tab") {
      close();
      return;
    }
    if (k === "ArrowDown") move(active + 1, 1);
    else if (k === "ArrowUp" && e.altKey) pick(active);
    else if (k === "ArrowUp") move(active - 1, -1);
    else if (k === "Home") move(0, 1);
    else if (k === "End") move(opts.length - 1, -1);
    else if (k === "PageDown") move(active + 8, 1);
    else if (k === "PageUp") move(active - 8, -1);
    else if (k === "Enter" || (k === " " && !typing())) pick(active);
    else if (k === "Escape") close();
    else if (printable) typeAhead(k, active); // a space mid-word types ("new york")
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  // Where the list goes: measured from the button, below it unless it fits better above.
  const measure = useCallback(() => {
    const btn = trigger.current;
    const el = list.current;
    if (!btn || !el) return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const want = Math.min(el.scrollHeight, MAX_HEIGHT);
    const below = vh - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const up = want > below && above > below;
    const width = Math.max(r.width, el.offsetWidth);
    const left = Math.max(EDGE, Math.min(r.left, vw - EDGE - width));
    setPlace({
      left,
      top: up ? undefined : r.bottom + GAP,
      bottom: up ? vh - r.top + GAP : undefined,
      minWidth: r.width,
      maxHeight: Math.max(80, Math.min(MAX_HEIGHT, up ? above : below)),
      up,
    });
  }, []);

  useLayoutEffect(() => {
    if (shown) measure();
  }, [shown, measure]);

  // While open: follow the button when the page scrolls or resizes; close on a press outside
  // and when fullscreen changes (the list would be in the wrong layer).
  useEffect(() => {
    if (!shown) return;
    let frame = 0;
    const follow = (e: Event) => {
      if (e.target instanceof Node && list.current?.contains(e.target)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const outside = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!trigger.current?.contains(n) && !list.current?.contains(n)) close();
    };
    window.addEventListener("resize", follow);
    document.addEventListener("scroll", follow, true);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("fullscreenchange", close);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", follow);
      document.removeEventListener("scroll", follow, true);
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("fullscreenchange", close);
    };
  }, [shown, measure, close]);

  // Keep the active option in view inside the list (never scrolls the page).
  useEffect(() => {
    const el = list.current;
    if (!shown || !place || !el || active < 0) return;
    const item = el.children[active] as HTMLElement | undefined;
    if (!item) return;
    if (item.offsetTop < el.scrollTop) el.scrollTop = item.offsetTop - 4;
    else if (item.offsetTop + item.offsetHeight > el.scrollTop + el.clientHeight) {
      el.scrollTop = item.offsetTop + item.offsetHeight - el.clientHeight + 4;
    }
  }, [shown, place, active]);

  const host = shown
    ? (document.fullscreenElement && document.fullscreenElement !== document.documentElement
      ? document.fullscreenElement
      : document.body)
    : null;
  // A forced-light screen (.theme-light) keeps its look in the portal, which leaves its subtree.
  const forcedLight = shown && !!trigger.current?.closest(".theme-light");

  return (
    <>
      <button ref={trigger} id={triggerId} type="button" role="combobox" disabled={disabled} title={title}
        aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={shown} aria-controls={shown ? listId : undefined}
        aria-activedescendant={shown && active >= 0 ? optId(active) : undefined}
        onClick={() => (shown ? close() : void openList())} onKeyDown={onKeyDown}
        // Space is handled on keydown; Firefox would still click the button on keyup and toggle it back.
        onKeyUp={(e) => e.key === " " && e.preventDefault()}
        className={`flex cursor-pointer items-center gap-1.5 text-left disabled:cursor-default ${className}`}>
        {/* Every label sits in the same grid cell, invisible: the button is as wide as the
            widest option, like a native select, so it does not jump when the value changes. */}
        <span className="grid min-w-0 flex-1">
          <span className="col-start-1 row-start-1 truncate">{current}</span>
          {opts.map((o, i) => (
            <span key={i} aria-hidden className="invisible col-start-1 row-start-1 h-0 truncate">{o.label}</span>
          ))}
        </span>
        <IconChevronDown size={14} stroke={2.25}
          className={`shrink-0 text-muted transition-transform duration-150 ${shown ? "rotate-180" : ""}`} />
      </button>
      {host && createPortal(
        <div ref={list} id={listId} role="listbox" aria-labelledby={triggerId} onKeyDown={onKeyDown}
          style={place
            ? { left: place.left, top: place.top, bottom: place.bottom, minWidth: place.minWidth, maxHeight: place.maxHeight }
            : { left: 0, top: 0, visibility: "hidden" }}
          className={`${forcedLight ? "theme-light" : ""} fixed z-[1100] max-w-[min(360px,calc(100vw-16px))] animate-pop overflow-y-auto overscroll-contain rounded-xl border border-line bg-panel p-1 text-[12.5px] text-fg shadow-lift ${
            place?.up ? "origin-bottom" : "origin-top"}`}>
          {opts.map((o, i) => {
            const isSelected = i === selected;
            return (
              <div key={`${o.value}-${i}`} id={optId(i)} role="option" aria-selected={isSelected}
                aria-disabled={o.disabled || undefined} title={o.title}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => !o.disabled && active !== i && setActive(i)}
                onClick={() => pick(i)}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${
                  o.disabled ? "cursor-not-allowed text-dim" : "cursor-pointer"} ${
                  i === active && !o.disabled ? "bg-subtle" : ""} ${isSelected ? "font-semibold" : ""}`}>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                <IconCheck size={14} stroke={2.5} className={`shrink-0 text-accent ${isSelected ? "" : "invisible"}`} />
              </div>
            );
          })}
        </div>,
        host,
      )}
    </>
  );
}

interface MultiProps {
  options: string[];
  selected: string[];
  onSelectionChange: (values: string[]) => void;
  /** Visible rows before the list scrolls. */
  rows?: number;
}

/**
 * Toggle-list multi-select: each option is a full-width tappable row that
 * flips in/out of the selection. Works with a single tap/click on both mouse
 * and touch — unlike a native `<select multiple>`, which needs Ctrl/Cmd-click
 * and is unusable on phones.
 */
export function MultiSelect({
  options,
  selected,
  onSelectionChange,
  rows = 6,
}: MultiProps) {
  const toggle = (value: string) => {
    onSelectionChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  return (
    <div
      role="listbox"
      aria-multiselectable
      className="w-full overflow-y-auto rounded-md border border-line bg-bg"
      style={{ maxHeight: `${rows * 2}rem` }}
    >
      {options.map((o) => {
        const isSelected = selected.includes(o);
        return (
          <button
            key={o}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => toggle(o)}
            className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-fg transition-colors ${
              isSelected ? "bg-accent/15" : "hover:bg-line/40"
            }`}
          >
            <span
              className={`flex h-4 w-4 flex-none items-center justify-center rounded border ${
                isSelected
                  ? "border-accent bg-accent text-bg"
                  : "border-line bg-transparent text-transparent"
              }`}
            >
              <IconCheck size={12} stroke={3} />
            </span>
            <span className="truncate">{o}</span>
          </button>
        );
      })}
    </div>
  );
}

import { msg, useT } from "../../i18n";

/** One gamepad face/d-pad button and the action it fires on this robot (already resolved). */
export interface PadAction {
  button: string;
  action: string;
}

interface Props {
  /** Keys held right now (lower-case `KeyboardEvent.key`): their caps light up. */
  pressed: Set<string>;
  /** The face and d-pad buttons that do something on this robot. */
  padActions: PadAction[];
}

const KEYBOARD: [string[], string][] = [
  [["w", "s"], msg("Forward / back")],
  [["a", "d"], msg("Sideways")],
  [["arrowleft", "arrowright"], msg("Turn")],
  [["f"], msg("Fullscreen")],
  [["escape"], msg("Leave fullscreen")],
];
const CAP: Record<string, string> = { arrowleft: "←", arrowright: "→", escape: "Esc" };

const PAD_FIXED: [string, string][] = [
  [msg("Left stick"), msg("Move")],
  [msg("Right stick"), msg("Turn")],
  ["Start", msg("Arm / disarm")],
  ["Back", msg("Emergency stop")],
  ["LB / RB", msg("Slower / faster")],
];

const TOUCH: [string, string][] = [
  [msg("Left stick"), msg("Move: forward, back and sideways")],
  [msg("Right stick"), msg("Turn")],
];

/**
 * Every way to drive, in one place: the drive page's info popover. Replaces the key strip that
 * used to sit over the middle of the picture.
 */
export function ControlsHelp({ pressed, padActions }: Props) {
  const t = useT();
  const cap = (k: string) => (
    <kbd key={k} className={`inline-grid h-6 min-w-6 place-items-center rounded-md border px-1.5 font-mono text-[11px] font-semibold transition ${
      pressed.has(k) ? "translate-y-px border-accent bg-accent text-on-accent" : "border-line bg-bg"}`}>
      {CAP[k] ?? k.toUpperCase()}
    </kbd>
  );
  const section = (title: string, rows: [React.ReactNode, string][]) => (
    <section>
      <h4 className="m-0 mb-1.5 text-[10.5px] font-bold tracking-wider text-dim uppercase">{title}</h4>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {rows.map(([what, does], i) => (
          <li key={i} className="flex items-center gap-3 text-[12.5px]">
            <span className="flex w-[104px] shrink-0 items-center gap-1 font-semibold">{what}</span>
            <span className="text-muted">{t(does)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
  const named = (s: string) => <span className="rounded-md bg-subtle px-1.5 py-0.5 text-[11.5px]">{t(s)}</span>;

  return (
    <div className="flex flex-col gap-3.5">
      <p className="m-0 rounded-lg bg-subtle px-3 py-2 text-xs text-muted">
        {t("Nothing moves until you arm. STOP (or Back on a gamepad) stops the robot and disarms.")}
      </p>
      {section(t("Keyboard"), KEYBOARD.map(([keys, does]) => [<>{keys.map(cap)}</>, does]))}
      {section(t("Gamepad"), [
        ...PAD_FIXED.map(([b, does]): [React.ReactNode, string] => [named(b), does]),
        ...padActions.map(({ button, action }): [React.ReactNode, string] => [named(button), action]),
      ])}
      {section(t("Touch screen"), TOUCH.map(([b, does]) => [named(b), does]))}
    </div>
  );
}

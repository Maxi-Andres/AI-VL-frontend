import { useState } from "react";
import { Button } from "../ui/Button";
import type { SkillInfo } from "../../api/backend";

interface Props {
  /** The robot's skill catalog (from GET /api/skills). */
  skills: Record<string, SkillInfo>;
  /** Names the executor refuses while safe mode is on — straight from the catalog,
   * so this pad never keeps its own guess of what is dangerous. */
  dangerous: string[];
  /** Disabled until the pad is armed. */
  disabled: boolean;
  /** When true, `dangerous` skills render disabled (the executor blocks them too). */
  safeMode: boolean;
  onAction: (skill: string, params?: Record<string, unknown>) => void;
}

// Skills handled elsewhere (joysticks / e-stop) or not a real action.
const EXCLUDE = new Set(["walk", "turn", "stop", "move", "unknown"]);

// Preferred grouping + order (Go2 + G1 names mixed; missing ones are just skipped).
// Any catalog skill not listed here still shows up under "More"; `hidden` catalog
// skills (raw mode control) go to their own "Advanced" group at the end.
const GROUPS: { title: string; skills: string[] }[] = [
  // Startup order first — the G1 only works as damping -> Preparation -> a locomotion
  // mode, so the buttons read in the order an operator presses them.
  { title: "Mode", skills: ["damp", "stand_up", "lie_up", "walk_waist", "run_waist", "climb", "start", "run", "balance_stand", "zero_torque"] },
  { title: "Posture", skills: ["stand_down", "sit", "rise_sit", "recovery_stand", "squat", "high_stand", "low_stand"] },
  { title: "Gestures", skills: ["hello", "stretch", "scrape", "heart", "dance1", "dance2", "pose", "wave_hand", "shake_hand"] },
  { title: "Acrobatics", skills: ["front_jump", "front_pounce", "front_flip", "back_flip", "left_flip", "handstand", "walk_upright"] },
];

// Fallback display names for catalog entries that carry no `label` of their own
// (older iacore). The catalog is the source of truth — add names there, not here.
const LABELS: Record<string, string> = {
  stand_down: "Lie down", rise_sit: "Rise", recovery_stand: "Recover",
  hello: "Wave / greet", scrape: "Bow", dance1: "Dance 1", dance2: "Dance 2",
  front_jump: "Jump", front_pounce: "Pounce", front_flip: "Front flip",
  back_flip: "Back flip", left_flip: "Side flip", walk_upright: "Upright",
  set_gait: "Gait",
};

const prettify = (name: string) =>
  name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Display name for a skill: the catalog's label wins (it is matched to the Unitree
 * app's wording), then a local fallback, then a prettified id. */
const pretty = (name: string, info?: SkillInfo) =>
  info?.label ?? LABELS[name] ?? prettify(name);

/** First param of a skill that offers a fixed set of `values` (e.g. arm_action's
 * `action`, set_gait's `gait`) — rendered as a row of value buttons. */
function choiceParam(
  info: SkillInfo | undefined,
): { key: string; values: string[]; labels?: Record<string, string> } | null {
  const params = info?.params ?? {};
  for (const key of Object.keys(params)) {
    const values = params[key]?.values;
    if (Array.isArray(values) && values.length)
      return { key, values, labels: params[key]?.labels };
  }
  return null;
}

/** A single free-value param (number/string, no fixed `values`) — rendered as an
 * input + Go instead of a plain button, since the value IS the command. */
function freeParam(
  info: SkillInfo | undefined,
): { key: string; type: string; def: unknown } | null {
  const params = info?.params ?? {};
  const keys = Object.keys(params);
  if (keys.length !== 1) return null;
  const p = params[keys[0]];
  if (!p || p.values || p.type === "bool") return null;
  return { key: keys[0], type: p.type ?? "string", def: p.default };
}

export function ActionPad({ skills, dangerous, disabled, safeMode, onAction }: Props) {
  const blockedBySafe = new Set(dangerous);
  // Which side (on/off) was last chosen per flag skill, so the pad shows the
  // current selection. Undefined until the user picks one.
  const [flagOn, setFlagOn] = useState<Record<string, boolean>>({});
  const chooseFlag = (name: string, on: boolean) => {
    setFlagOn((s) => ({ ...s, [name]: on }));
    onAction(name, { on });
  };
  // Typed values for the free-value skills (raw FSM / mode ids).
  const [freeVals, setFreeVals] = useState<Record<string, string>>({});

  const names = Object.keys(skills).filter((n) => !EXCLUDE.has(n));
  // Skills with a choice param render as their own titled block (not in the grids).
  const choiceNames = names.filter((n) => choiceParam(skills[n]));
  const choiceSet = new Set(choiceNames);
  const hidden = new Set(names.filter((n) => skills[n]?.hidden));

  const grouped = new Set<string>();
  const groups = GROUPS.map((g) => ({
    title: g.title,
    items: g.skills.filter(
      (n) => n in skills && !EXCLUDE.has(n) && !choiceSet.has(n) && !hidden.has(n),
    ),
  })).filter((g) => g.items.length > 0);
  groups.forEach((g) => g.items.forEach((n) => grouped.add(n)));
  const more = names.filter(
    (n) => !grouped.has(n) && !choiceSet.has(n) && !hidden.has(n),
  );
  if (more.length) groups.push({ title: "More", items: more });
  // Raw mode control last, clearly separated from the normal actions.
  const advanced = [...hidden].filter((n) => !choiceSet.has(n));
  if (advanced.length) groups.push({ title: "Advanced (raw mode)", items: advanced });

  const renderSimple = (name: string) => {
    const info = skills[name];
    const blocked = safeMode && blockedBySafe.has(name); // Safe mode disables these
    const title = blocked
      ? `Blocked by Safe mode: it can make the robot lose its support or change ` +
        `control mode. Turn Safe off to allow.\n\n${info?.desc ?? ""}`
      : info?.desc;
    const free = freeParam(info);
    if (free) {
      // One free value (an FSM/mode id): type it, then send. This is how an operator
      // reaches — and discovers — the app modes Unitree does not document.
      const value = freeVals[name] ?? String(free.def ?? "");
      return (
        <div key={name} className="col-span-2 flex items-center gap-1.5">
          <span className="flex-1 truncate text-xs text-fg" title={title}>
            {pretty(name, info)}
          </span>
          <input
            type={free.type.startsWith("number") ? "number" : "text"}
            value={value}
            disabled={disabled || blocked}
            title={title}
            onChange={(e) => setFreeVals((s) => ({ ...s, [name]: e.target.value }))}
            className="w-20 rounded-md border border-line bg-bg px-1.5 py-1 text-[11px] text-fg focus:border-accent focus:outline-none"
          />
          <Button
            variant="secondary" className="px-2 py-1 text-[11px]"
            disabled={disabled || blocked || value.trim() === ""} title={title}
            onClick={() =>
              onAction(name, {
                [free.key]: free.type.startsWith("number") ? Number(value) : value,
              })
            }
          >
            Go
          </Button>
        </div>
      );
    }
    const flag = info?.params?.on; // on/off toggle skill
    if (flag) {
      const sel = flagOn[name]; // true=on selected, false=off selected, undefined=none
      return (
        <div key={name} className="col-span-2 flex items-center gap-1.5">
          <span className="flex-1 truncate text-xs text-fg" title={title}>
            {pretty(name, info)}
          </span>
          <Button variant={sel === true ? "primary" : "secondary"}
            className="px-2 py-1 text-[11px]" aria-pressed={sel === true}
            disabled={disabled || blocked} title={title}
            onClick={() => chooseFlag(name, true)}>On</Button>
          <Button variant={sel === false ? "primary" : "secondary"}
            className="px-2 py-1 text-[11px]" aria-pressed={sel === false}
            disabled={disabled || blocked} title={title}
            onClick={() => chooseFlag(name, false)}>Off</Button>
        </div>
      );
    }
    return (
      <Button key={name} variant="secondary" className="px-2 py-1.5 text-xs"
        disabled={disabled || blocked} title={title} onClick={() => onAction(name)}>
        {pretty(name, info)}
      </Button>
    );
  };

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <div key={g.title}>
          <h3 className="m-0 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
            {g.title}
          </h3>
          <div className="grid grid-cols-2 gap-1.5">{g.items.map(renderSimple)}</div>
        </div>
      ))}

      {choiceNames.map((name) => {
        const info = skills[name];
        const choice = choiceParam(info)!;
        const blocked = safeMode && blockedBySafe.has(name);
        return (
          <div key={name}>
            <h3 className="m-0 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
              {pretty(name, info)}
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {choice.values.map((v) => (
                <Button key={v} variant="secondary" className="px-2 py-1.5 text-xs"
                  disabled={disabled || blocked} title={info?.desc}
                  onClick={() => onAction(name, { [choice.key]: v })}>
                  {choice.labels?.[v] ?? prettify(v)}
                </Button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

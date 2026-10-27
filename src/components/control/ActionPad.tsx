import { useState } from "react";
import type { ReactNode } from "react";
import { IconChevronDown, IconLock } from "@tabler/icons-react";
import type { SkillInfo } from "../../api/backend";
import type { ChoiceSendable } from "./unsendableSkills";
import { choiceGroups } from "./choiceGroups";
import { msg, useT } from "../../i18n";

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
  /** Skills this robot's transport cannot deliver (the relay's allowlist leaves them out).
   * Still drawn — struck through and disabled — so what is missing stays visible. */
  unsendable: Set<string>;
  /** Per value of a choice skill: whether the transport can deliver it (struck out if not). */
  choiceOk: ChoiceSendable;
  onAction: (skill: string, params?: Record<string, unknown>) => void;
  /** Only show actions whose name contains this (case-insensitive). */
  query?: string;
  /** Group titles folded shut. Owned by the caller so "collapse all" can reach them. */
  collapsed: Set<string>;
  onToggleGroup: (title: string) => void;
  /** Glass styling for the fullscreen cockpit's drawer. */
  glass?: boolean;
}

// Skills handled elsewhere (joysticks / e-stop) or not a real action.
const EXCLUDE = new Set(["walk", "turn", "stop", "move", "unknown"]);

// Preferred grouping + order (Go2 + G1 names mixed; missing ones are just skipped).
// Any catalog skill not listed here still shows up under "More"; `hidden` catalog
// skills (raw mode control) go to their own "Advanced" group at the end. Titles are marked with
// msg() and stay English as identities (the folded set); t() translates them where drawn.
const GROUPS: { title: string; skills: string[] }[] = [
  // Startup order first — the G1 only works as damping -> Preparation -> a locomotion
  // mode, so the buttons read in the order an operator presses them.
  { title: msg("Mode"), skills: ["damp", "stand_up", "lie_up", "walk_waist", "run_waist", "climb", "start", "run", "balance_stand", "zero_torque"] },
  { title: msg("Posture"), skills: ["stand_down", "sit", "rise_sit", "recovery_stand", "squat", "high_stand", "low_stand"] },
  { title: msg("Gestures"), skills: ["hello", "stretch", "scrape", "heart", "dance1", "dance2", "pose", "wave_hand", "shake_hand"] },
  { title: msg("Acrobatics"), skills: ["front_jump", "front_pounce", "front_flip", "back_flip", "left_flip", "handstand", "walk_upright"] },
];

export const ADVANCED_GROUP = msg("Advanced (raw mode)");
const MORE_GROUP = msg("More");

// Fallback display names for catalog entries that carry no `label` of their own
// (older iacore). The catalog is the source of truth — add names there, not here.
const LABELS: Record<string, string> = {
  stand_down: msg("Lie down"), rise_sit: msg("Rise"), recovery_stand: msg("Recover"),
  hello: msg("Wave / greet"), scrape: msg("Bow"), dance1: msg("Dance 1"), dance2: msg("Dance 2"),
  front_jump: msg("Jump"), front_pounce: msg("Pounce"), front_flip: msg("Front flip"),
  back_flip: msg("Back flip"), left_flip: msg("Side flip"), walk_upright: msg("Upright"),
  set_gait: msg("Gait"),
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
): {
  key: string; values: string[]; labels?: Record<string, string>;
  groups?: Record<string, string[]>;
} | null {
  const params = info?.params ?? {};
  for (const key of Object.keys(params)) {
    const values = params[key]?.values;
    if (Array.isArray(values) && values.length)
      return { key, values, labels: params[key]?.labels, groups: params[key]?.groups };
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

const NOT_ON_RELAY = msg("Not available over the relay yet: the executor refuses it before it reaches the robot. It needs adding to the relay's allowlist (robot-command-relay) and the executor's map.");

/** The robot's preset actions, grouped and foldable, filtered by `query`. Group headers stick
 * to the top of the caller's scroll box, so a long G1 catalog never loses its place. */
export function ActionPad({
  skills, dangerous, disabled, safeMode, unsendable, choiceOk, onAction,
  query = "", collapsed, onToggleGroup, glass,
}: Props) {
  const t = useT();
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
  const q = query.trim().toLowerCase();
  // Searched as drawn: in the language on screen.
  const matches = (label: string) => !q || t(label).toLowerCase().includes(q);

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
  if (more.length) groups.push({ title: MORE_GROUP, items: more });
  // Raw mode control last, clearly separated from the normal actions.
  const advanced = [...hidden].filter((n) => !choiceSet.has(n));
  if (advanced.length) groups.push({ title: ADVANCED_GROUP, items: advanced });

  // Glass is the same theme colours, translucent: the cockpit's frosted panel shows through.
  const ui = {
    card: glass ? "border-line bg-panel/55" : "border-line bg-panel",
    head: glass ? "bg-panel/95 text-fg" : "bg-panel text-fg",
    count: "bg-subtle text-muted",
    btn: `border-line ${glass ? "bg-panel/70" : "bg-panel"} text-fg hover:border-accent hover:bg-good-bg hover:text-good-fg`,
    input: `border-line ${glass ? "bg-bg/70" : "bg-bg"} text-fg`,
    sub: "text-dim",
  };
  const btn = `flex min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-left text-[12.5px] font-semibold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100 ${ui.btn}`;

  const renderSimple = (name: string) => {
    const info = skills[name];
    const offRelay = unsendable.has(name);
    // Safe mode disables these; so does a transport that cannot deliver them.
    const bySafe = safeMode && blockedBySafe.has(name);
    const blocked = bySafe || offRelay;
    const title = offRelay
      ? `${t(NOT_ON_RELAY)}\n\n${info?.desc ?? ""}`
      : bySafe
      ? `${t("Blocked by Safe mode: it can make the robot lose its support or change control mode. Turn Safe off to allow.")}\n\n${info?.desc ?? ""}`
      : info?.desc;
    const label = pretty(name, info);
    const lock = blocked && <IconLock size={13} className="shrink-0 opacity-70" />;
    const text = <span className={`truncate ${offRelay ? "line-through" : ""}`}>{t(label)}</span>;
    const free = freeParam(info);
    if (free) {
      // One free value (an FSM/mode id): type it, then send. This is how an operator
      // reaches — and discovers — the app modes Unitree does not document.
      const value = freeVals[name] ?? String(free.def ?? "");
      return (
        <div key={name} className="col-span-2 flex items-center gap-1.5" title={title}>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] font-semibold">{lock}{text}</span>
          <input
            type={free.type.startsWith("number") ? "number" : "text"}
            value={value}
            disabled={disabled || blocked}
            onChange={(e) => setFreeVals((s) => ({ ...s, [name]: e.target.value }))}
            className={`w-20 rounded-lg border px-2 py-1.5 text-xs focus:border-accent focus:outline-none disabled:opacity-40 ${ui.input}`}
          />
          <button type="button" className={`${btn} justify-center px-3`}
            disabled={disabled || blocked || value.trim() === ""}
            onClick={() => onAction(name, { [free.key]: free.type.startsWith("number") ? Number(value) : value })}>
            {t("Go")}
          </button>
        </div>
      );
    }
    const flag = info?.params?.on; // on/off toggle skill
    if (flag) {
      const sel = flagOn[name]; // true=on selected, false=off selected, undefined=none
      const on = "border-accent bg-good-bg text-good-fg";
      return (
        <div key={name} className="col-span-2 flex items-center gap-1.5" title={title}>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-[12.5px] font-semibold">{lock}{text}</span>
          <button type="button" aria-pressed={sel === true} disabled={disabled || blocked}
            className={`${btn} justify-center px-3 ${sel === true ? on : ""}`} onClick={() => chooseFlag(name, true)}>{t("On")}</button>
          <button type="button" aria-pressed={sel === false} disabled={disabled || blocked}
            className={`${btn} justify-center px-3 ${sel === false ? on : ""}`} onClick={() => chooseFlag(name, false)}>{t("Off")}</button>
        </div>
      );
    }
    return (
      <button key={name} type="button" className={btn} disabled={disabled || blocked} title={title}
        onClick={() => onAction(name)}>
        {lock}{text}
      </button>
    );
  };

  const simpleGroups = groups
    .map((g) => ({ ...g, items: g.items.filter((n) => matches(pretty(n, skills[n])) || matches(g.title)) }))
    .filter((g) => g.items.length);

  return (
    <div>
      {simpleGroups.map((g) => (
        <Group key={g.title} title={g.title} count={g.items.length} ui={ui}
          shut={collapsed.has(g.title) && !q} onToggle={() => onToggleGroup(g.title)}>
          <div className="grid grid-cols-2 gap-1.5">{g.items.map(renderSimple)}</div>
        </Group>
      ))}

      {choiceNames.map((name) => {
        const info = skills[name];
        const choice = choiceParam(info)!;
        const offRelay = unsendable.has(name);
        const blocked = (safeMode && blockedBySafe.has(name)) || offRelay;
        const title = pretty(name, info);
        const sets = choiceGroups(choice.values, choice.groups)
          .map((g) => ({ ...g, values: g.values.filter((v) => matches(choice.labels?.[v] ?? prettify(v)) || matches(title)) }))
          .filter((g) => g.values.length);
        if (!sets.length) return null;
        return (
          <Group key={name} title={title} count={sets.reduce((n, g) => n + g.values.length, 0)} ui={ui}
            shut={collapsed.has(title) && !q} onToggle={() => onToggleGroup(title)}>
            {offRelay && <p className={`m-0 mb-2 text-[11px] ${ui.sub}`} title={t(NOT_ON_RELAY)}>{t("Not available over the relay yet.")}</p>}
            {sets.map((g) => (
              <div key={g.title ?? ""} className="mb-1.5 last:mb-0">
                {g.title && <h4 className={`m-0 mt-1 mb-1.5 text-[10.5px] font-bold tracking-wider uppercase ${ui.sub}`}>{g.title}</h4>}
                <div className="grid grid-cols-2 gap-1.5">
                  {g.values.map((v) => {
                    const off = !choiceOk(name, v);
                    return (
                      <button key={v} type="button" className={btn} disabled={disabled || blocked || off}
                        title={off ? t(NOT_ON_RELAY) : g.title
                          ? `${t("Needs: {mode}.", { mode: g.title })}\n\n${info?.desc ?? ""}` : info?.desc}
                        onClick={() => onAction(name, { [choice.key]: v })}>
                        {(off || blocked) && <IconLock size={13} className="shrink-0 opacity-70" />}
                        <span className={`truncate ${off ? "line-through" : ""}`}>{choice.labels?.[v] ?? prettify(v)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </Group>
        );
      })}
    </div>
  );
}

function Group({ title, count, shut, onToggle, ui, children }: {
  title: string; count: number; shut: boolean; onToggle: () => void;
  ui: { card: string; head: string; count: string }; children: ReactNode;
}) {
  const t = useT();
  return (
    <section className={`mb-2 rounded-xl border ${ui.card}`}>
      <button type="button" onClick={onToggle} aria-expanded={!shut}
        className={`sticky top-0 z-[1] flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-left text-[12.5px] font-extrabold ${ui.head}`}>
        {t(title)}
        <span className={`rounded-full px-1.5 text-[11px] font-bold ${ui.count}`}>{count}</span>
        <IconChevronDown size={16} className={`ml-auto opacity-60 transition-transform ${shut ? "-rotate-90" : ""}`} />
      </button>
      {!shut && <div className="px-2.5 pb-2.5">{children}</div>}
    </section>
  );
}

/** Every group title the pad would draw for this catalog — for "collapse all". */
export function actionGroupTitles(skills: Record<string, SkillInfo>): string[] {
  const names = Object.keys(skills).filter((n) => !EXCLUDE.has(n));
  const choice = names.filter((n) => choiceParam(skills[n])).map((n) => pretty(n, skills[n]));
  return [...GROUPS.map((g) => g.title), MORE_GROUP, ADVANCED_GROUP, ...choice];
}

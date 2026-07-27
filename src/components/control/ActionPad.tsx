import { Button } from "../ui/Button";
import type { SkillInfo } from "../../api/backend";

interface Props {
  /** The robot's skill catalog (from GET /api/skills). */
  skills: Record<string, SkillInfo>;
  /** Disabled until the pad is armed. */
  disabled: boolean;
  onAction: (skill: string, params?: Record<string, unknown>) => void;
}

// Skills handled elsewhere (joysticks / e-stop) or not a real action.
const EXCLUDE = new Set(["walk", "turn", "stop", "move", "unknown"]);

// Preferred grouping + order (Go2 + G1 names mixed; missing ones are just skipped).
// Any catalog skill not listed here still shows up under "More".
const GROUPS: { title: string; skills: string[] }[] = [
  { title: "Posture", skills: ["stand_up", "balance_stand", "stand_down", "sit", "rise_sit", "recovery_stand", "damp", "squat", "high_stand", "low_stand", "zero_torque", "start"] },
  { title: "Gestures", skills: ["hello", "stretch", "scrape", "heart", "dance1", "dance2", "pose", "wave_hand", "shake_hand"] },
  { title: "Acrobatics", skills: ["front_jump", "front_pounce", "front_flip", "back_flip", "left_flip", "handstand", "walk_upright"] },
];

// Nicer labels; anything missing falls back to a prettified skill name.
const LABELS: Record<string, string> = {
  stand_up: "Stand up", balance_stand: "Balance", stand_down: "Lie down", sit: "Sit",
  rise_sit: "Rise", recovery_stand: "Recover", damp: "Relax", hello: "Wave / greet",
  stretch: "Stretch", scrape: "Bow", heart: "Heart", dance1: "Dance 1", dance2: "Dance 2",
  pose: "Pose", front_jump: "Jump", front_pounce: "Pounce", front_flip: "Front flip",
  back_flip: "Back flip", left_flip: "Side flip", handstand: "Handstand", walk_upright: "Upright",
  set_gait: "Gait", squat: "Squat", high_stand: "High stand", low_stand: "Low stand",
  zero_torque: "Zero torque", start: "Start", wave_hand: "Wave", shake_hand: "Shake hand",
  arm_action: "Arm action",
};

const pretty = (name: string) =>
  LABELS[name] ??
  name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** First param of a skill that offers a fixed set of `values` (e.g. arm_action's
 * `action`, set_gait's `gait`) — rendered as a row of value buttons. */
function choiceParam(info: SkillInfo | undefined): { key: string; values: string[] } | null {
  const params = info?.params ?? {};
  for (const key of Object.keys(params)) {
    const values = params[key]?.values;
    if (Array.isArray(values) && values.length) return { key, values };
  }
  return null;
}

export function ActionPad({ skills, disabled, onAction }: Props) {
  const names = Object.keys(skills).filter((n) => !EXCLUDE.has(n));
  // Skills with a choice param render as their own titled block (not in the grids).
  const choiceNames = names.filter((n) => choiceParam(skills[n]));
  const choiceSet = new Set(choiceNames);

  const grouped = new Set<string>();
  const groups = GROUPS.map((g) => ({
    title: g.title,
    items: g.skills.filter((n) => n in skills && !EXCLUDE.has(n) && !choiceSet.has(n)),
  })).filter((g) => g.items.length > 0);
  groups.forEach((g) => g.items.forEach((n) => grouped.add(n)));
  const more = names.filter((n) => !grouped.has(n) && !choiceSet.has(n));
  if (more.length) groups.push({ title: "More", items: more });

  const renderSimple = (name: string) => {
    const info = skills[name];
    const flag = info?.params?.on; // on/off toggle skill
    if (flag) {
      return (
        <div key={name} className="col-span-2 flex items-center gap-1.5">
          <span className="flex-1 truncate text-xs text-fg" title={info.desc}>
            {pretty(name)}
          </span>
          <Button variant="secondary" className="px-2 py-1 text-[11px]" disabled={disabled}
            onClick={() => onAction(name, { on: true })}>On</Button>
          <Button variant="secondary" className="px-2 py-1 text-[11px]" disabled={disabled}
            onClick={() => onAction(name, { on: false })}>Off</Button>
        </div>
      );
    }
    return (
      <Button key={name} variant="secondary" className="px-2 py-1.5 text-xs"
        disabled={disabled} title={info?.desc} onClick={() => onAction(name)}>
        {pretty(name)}
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
        const choice = choiceParam(skills[name])!;
        return (
          <div key={name}>
            <h3 className="m-0 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
              {pretty(name)}
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {choice.values.map((v) => (
                <Button key={v} variant="secondary" className="px-2 py-1.5 text-xs capitalize"
                  disabled={disabled} onClick={() => onAction(name, { [choice.key]: v })}>
                  {v.replace(/_/g, " ")}
                </Button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

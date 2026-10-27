import { IconBone, IconRobot } from "@tabler/icons-react";
import { SOLID, colorOf } from "../../lib/colors";

const GLYPH: Record<string, typeof IconRobot> = { go2: IconBone, g1: IconRobot };

/** A robot's glyph (by model) on its own colour, the way people have theirs. */
export function RobotIcon({ slot, color, id = "", size = 28 }: {
  slot: string; color?: string | null; id?: string; size?: number;
}) {
  const Icon = GLYPH[slot] ?? IconRobot;
  const tone = SOLID[colorOf(color, id || slot)];
  return (
    <span style={{ width: size, height: size, color: tone, background: `${tone}1f` }}
      className="grid shrink-0 place-items-center rounded-full">
      <Icon size={Math.round(size * 0.6)} />
    </span>
  );
}

// The colours a person or a robot wears (avatar, robot icon). The server stores the NAME
// (db.COLORS in the backend) and picks one at random on creation; the shades live here.
// Pastel gradients with a dark ink of the same hue read on both themes; the solid tone is the
// robot icon and the picker swatch.
import { msg } from "../i18n";

export const COLORS = ["teal", "indigo", "amber", "rose", "green", "violet", "sky", "slate"] as const;
export type ColorName = (typeof COLORS)[number];

/** Each colour's name as people read it (the picker's tooltip); translate with t() where shown. */
export const COLOR_LABEL: Record<ColorName, string> = {
  teal: msg("teal"), indigo: msg("indigo"), amber: msg("amber"), rose: msg("rose"),
  green: msg("green"), violet: msg("violet"), sky: msg("sky"), slate: msg("slate"),
};

const AVATAR: Record<ColorName, string> = {
  teal: "from-[#d6f1ed] to-[#f4efc4] text-[#0f5a52]",
  indigo: "from-[#dfe7fb] to-[#efe4fb] text-[#3b3f9e]",
  amber: "from-[#fde6d8] to-[#fbf2c8] text-[#8a4a12]",
  rose: "from-[#fbe0e6] to-[#f3e4fb] text-[#9b2c4a]",
  green: "from-[#e3f4d9] to-[#d8f0ef] text-[#2f6b1f]",
  violet: "from-[#ece3fb] to-[#f8e3f4] text-[#6b2fa0]",
  sky: "from-[#dbeefb] to-[#e0f7f4] text-[#1e5f8a]",
  slate: "from-[#e5e7eb] to-[#f3f4f6] text-[#4b5563]",
};

export const SOLID: Record<ColorName, string> = {
  teal: "#1f9e91",
  indigo: "#4f5bd5",
  amber: "#c97a10",
  rose: "#d6456b",
  green: "#3f9a2e",
  violet: "#8b4fd1",
  sky: "#2b8fd6",
  slate: "#64748b",
};

/** A stored colour name, or — for a row from before colours existed — one derived from its
 * id, so it is at least stable. */
export function colorOf(name: string | null | undefined, id = ""): ColorName {
  if (name && (COLORS as readonly string[]).includes(name)) return name as ColorName;
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export const avatarClass = (c: ColorName) => AVATAR[c];

export function randomColor(): ColorName {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

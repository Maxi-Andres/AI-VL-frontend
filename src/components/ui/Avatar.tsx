import { initials } from "../../lib/password";

// One person, one colour: the palette is picked from a hash of their id, so the same person
// reads the same everywhere (header, Fleet, Team) and two people side by side tell apart.
// Pastel gradients with a dark ink of the same hue read on both themes.
const PALETTES = [
  "from-[#d6f1ed] to-[#f4efc4] text-[#0f5a52]",
  "from-[#dfe7fb] to-[#efe4fb] text-[#3b3f9e]",
  "from-[#fde6d8] to-[#fbf2c8] text-[#8a4a12]",
  "from-[#fbe0e6] to-[#f3e4fb] text-[#9b2c4a]",
  "from-[#e3f4d9] to-[#d8f0ef] text-[#2f6b1f]",
  "from-[#e5e7eb] to-[#f3f4f6] text-[#4b5563]",
];

function palette(key: string): string {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

export function Avatar({ id, name, size = 34, className = "" }: {
  /** Stable key for the colour: the user id (an email works for an invitation). */
  id: string;
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span title={name} style={{ width: size, height: size, fontSize: Math.round(size * 0.35) }}
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-extrabold ${palette(id)} ${className}`}>
      {initials(name)}
    </span>
  );
}

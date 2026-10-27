import { initials } from "../../lib/password";
import { avatarClass, colorOf } from "../../lib/colors";

/** A person's circle: initials on their colour — random when they joined, theirs to change
 * in Settings → Profile. The same everywhere (header, Fleet, Team). */
export function Avatar({ id, name, color, size = 34, className = "" }: {
  /** Stable key, used for the colour only when none is stored. */
  id: string;
  name: string;
  color?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <span title={name} style={{ width: size, height: size, fontSize: Math.round(size * 0.35) }}
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-extrabold ${avatarClass(colorOf(color, id))} ${className}`}>
      {initials(name)}
    </span>
  );
}

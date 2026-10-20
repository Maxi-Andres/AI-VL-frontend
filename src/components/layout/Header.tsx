import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
// Recolored from the official transparent PNG: its wordmark is dark gray and vanishes on this
// dark-only theme, so the gray went to --color-fg; the gradient "S" is untouched.
import silkLogo from "../../assets/silk-logo.webp";

interface Props {
  /** Optional slot on the right (e.g. the connection status badge). */
  children?: ReactNode;
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `text-xs ${isActive ? "text-fg font-bold" : "text-muted hover:text-fg"}`;

export function Header({ children }: Props) {
  return (
    <header className="flex items-center gap-3 border-b border-line px-[18px] py-3">
      <img src={silkLogo} alt="Silk Technologies" className="h-7 w-auto" />
      <h1 className="m-0 text-base font-semibold">Max's Control Panel</h1>
      <nav className="flex gap-3">
        <NavLink to="/" className={linkClass} end>
          Live
        </NavLink>
        <NavLink to="/drive" className={linkClass}>
          Drive
        </NavLink>
        <NavLink to="/robot" className={linkClass}>
          Robot
        </NavLink>
        <NavLink to="/video" className={linkClass}>
          Video
        </NavLink>
        <NavLink to="/joints" className={linkClass}>
          Joints
        </NavLink>
      </nav>
      <div className="ml-auto">{children}</div>
    </header>
  );
}

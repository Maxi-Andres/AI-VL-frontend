import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";

interface Props {
  /** Optional slot on the right (e.g. the connection status badge). */
  children?: ReactNode;
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `text-xs ${isActive ? "text-fg font-bold" : "text-muted hover:text-fg"}`;

export function Header({ children }: Props) {
  return (
    <header className="flex items-center gap-3 border-b border-line px-[18px] py-3">
      <h1 className="m-0 text-base font-semibold">Max's Control Panel</h1>
      <nav className="flex gap-3">
        <NavLink to="/" className={linkClass} end>
          Live
        </NavLink>
        <NavLink to="/monitor" className={linkClass}>
          Monitor
        </NavLink>
        <NavLink to="/drive" className={linkClass}>
          Drive
        </NavLink>
        <NavLink to="/about" className={linkClass}>
          About
        </NavLink>
      </nav>
      <div className="ml-auto">{children}</div>
    </header>
  );
}

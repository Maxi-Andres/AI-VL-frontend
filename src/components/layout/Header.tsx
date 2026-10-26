import { NavLink } from "react-router-dom";
import { useCan } from "../../auth/permissions";
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
  // Pages a role cannot use are not offered (App.tsx guards the routes themselves).
  const can = useCan();
  return (
    <header className="flex items-center gap-3 border-b border-line px-[18px] py-3">
      <img src={silkLogo} alt="Silk Technologies" className="h-[34px] w-auto" />
      {/* The product is "Silk Pilot": the Silk logo beside it supplies the first word. */}
      <h1 className="m-0 text-base font-semibold">Pilot</h1>
      <nav className="flex gap-3">
        <NavLink to="/" className={linkClass} end>
          Live
        </NavLink>
        {can("operate") && (
          <NavLink to="/drive" className={linkClass}>
            Drive
          </NavLink>
        )}
        {can("configure") && (
          <NavLink to="/robot" className={linkClass}>
            Robot
          </NavLink>
        )}
        {can("configure") && (
          <NavLink to="/video" className={linkClass}>
            Video
          </NavLink>
        )}
        <NavLink to="/joints" className={linkClass}>
          Joints
        </NavLink>
        {can("manage_users") && (
          <NavLink to="/team" className={linkClass}>
            Team
          </NavLink>
        )}
      </nav>
      <div className="ml-auto">{children}</div>
    </header>
  );
}

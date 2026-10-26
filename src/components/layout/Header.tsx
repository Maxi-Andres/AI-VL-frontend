import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import {
  IconBroadcast,
  IconLayoutGrid,
  IconMan,
  IconSettings,
  IconSteeringWheel,
} from "@tabler/icons-react";
import { useCan, type Permission } from "../../auth/permissions";
import { useMe } from "../../auth/AuthContext";
// Two renders of the logo: the wordmark is light on the dark theme and dark on the light one;
// the gradient "S" is the same in both.
import silkLogoOnDark from "../../assets/silk-logo.webp";
import silkLogoOnLight from "../../assets/silk-logo-light-bg.webp";

interface Props {
  /** The right side: robot status, voice, the signed-in person. */
  children?: ReactNode;
}

const TABS: { to: string; label: string; icon: typeof IconBroadcast; perm?: Permission; end?: boolean }[] = [
  { to: "/", label: "Fleet", icon: IconLayoutGrid, end: true },
  { to: "/live", label: "Live", icon: IconBroadcast },
  { to: "/drive", label: "Drive", icon: IconSteeringWheel, perm: "operate" },
  { to: "/joints", label: "Joints", icon: IconMan },
  // Everyone has Settings: Profile is there. The team and the robot sections show by role.
  { to: "/settings", label: "Settings", icon: IconSettings },
];

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex h-full items-center gap-[7px] px-3 text-[13.5px] font-bold whitespace-nowrap transition-colors ${
    isActive
      ? "text-fg after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-fg"
      : "text-muted hover:text-fg"
  }`;

/** The app bar: brand, company, the pages this role may use, and a right-hand slot. */
export function Header({ children }: Props) {
  const can = useCan();
  const me = useMe();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-panel/85 backdrop-blur-md backdrop-saturate-150">
      <div className="flex h-16 items-center gap-4 px-4 lg:gap-6 lg:px-6">
        <div className="flex shrink-0 items-center gap-2.5">
          <img src={silkLogoOnLight} alt="Silk Technologies" className="h-7 w-auto dark:hidden" />
          <img src={silkLogoOnDark} alt="Silk Technologies" className="hidden h-7 w-auto dark:block" />
          {/* The product is "Silk Pilot": the Silk logo beside it supplies the first word. */}
          <span className="border-l border-line pl-2.5 text-[17px] font-bold tracking-tight">Pilot</span>
        </div>
        <span className="hidden shrink-0 items-center gap-2 rounded-[10px] border border-line bg-panel px-2.5 py-1.5 text-[13px] font-bold xl:flex" title="Your company">
          <span className="size-5 rounded-md bg-gradient-to-br from-[#2fc1b1] to-[#d8cf3c]" />
          {me.org.name}
        </span>
        <nav className="-mb-px flex h-full min-w-0 overflow-x-auto [scrollbar-width:none]">
          {TABS.filter((t) => !t.perm || can(t.perm)).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={tabClass}>
              <Icon size={18} stroke={1.8} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2.5">{children}</div>
      </div>
    </header>
  );
}

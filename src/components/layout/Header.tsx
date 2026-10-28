import { useLayoutEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
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
import { msg, useT } from "../../i18n";

interface Props {
  /** The right side: robot status, voice, the signed-in person. */
  children?: ReactNode;
}

const TABS: { to: string; label: string; icon: typeof IconBroadcast; perm?: Permission; end?: boolean }[] = [
  { to: "/", label: msg("Fleet"), icon: IconLayoutGrid, end: true },
  { to: "/live", label: msg("Live"), icon: IconBroadcast },
  { to: "/drive", label: msg("Drive"), icon: IconSteeringWheel, perm: "operate" },
  { to: "/joints", label: msg("Joints"), icon: IconMan },
  // Everyone has Settings: Profile is there. The team and the robot sections show by role.
  { to: "/settings", label: msg("Settings"), icon: IconSettings },
];

const tabClass = ({ isActive }: { isActive: boolean }) =>
  `flex h-full items-center gap-[7px] px-3 text-[13.5px] font-bold whitespace-nowrap transition-colors ${
    isActive ? "text-fg" : "text-muted hover:text-fg"
  }`;

/** Where the active tab's underline sits, measured off the link React Router marks current —
 * one bar that slides to the new tab instead of one per tab that blinks on and off. */
function useTabBar(nav: React.RefObject<HTMLElement | null>) {
  const { pathname } = useLocation();
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = nav.current;
    if (!el) return;
    const measure = () => {
      const a = el.querySelector<HTMLElement>('a[aria-current="page"]');
      setBar(a ? { left: a.offsetLeft + 12, width: a.offsetWidth - 24 } : null);
    };
    measure();
    const ro = new ResizeObserver(measure); // fonts loading, tabs appearing with permissions
    ro.observe(el);
    return () => ro.disconnect();
  }, [nav, pathname]);
  return bar;
}

/** The app bar: brand, company, the pages this role may use, and a right-hand slot. */
export function Header({ children }: Props) {
  const t = useT();
  const can = useCan();
  const me = useMe();
  const nav = useRef<HTMLElement>(null);
  const bar = useTabBar(nav);
  // No slide on the very first paint: the bar appears under the current tab, then moves.
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    if (bar && !ready) requestAnimationFrame(() => setReady(true));
  }, [bar, ready]);
  return (
    <header className="relative z-40 shrink-0 border-b border-line bg-panel/85 backdrop-blur-md backdrop-saturate-150">
      <div className="flex h-16 items-center gap-4 px-4 lg:gap-6 lg:px-6">
        <div className="flex shrink-0 items-center gap-2.5">
          <img src={silkLogoOnLight} alt="Silk Technologies" className="h-7 w-auto dark:hidden" />
          <img src={silkLogoOnDark} alt="Silk Technologies" className="hidden h-7 w-auto dark:block" />
          {/* The product is "Silk Pilot": the Silk logo beside it supplies the first word. */}
          <span className="border-l border-line pl-2.5 text-[17px] font-bold tracking-tight">Pilot</span>
        </div>
        <span className="hidden shrink-0 items-center gap-2 rounded-[10px] border border-line bg-panel px-2.5 py-1.5 text-[13px] font-bold xl:flex" title={t("Your company")}>
          <span className="size-5 rounded-md bg-gradient-to-br from-[#2fc1b1] to-[#d8cf3c]" />
          {me.org.name}
        </span>
        <nav ref={nav} className="relative -mb-px flex h-full min-w-0 overflow-x-auto [scrollbar-width:none]">
          {TABS.filter((t) => !t.perm || can(t.perm)).map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={tabClass}>
              <Icon size={18} stroke={1.8} />
              {t(label)}
            </NavLink>
          ))}
          {bar && (
            <span aria-hidden style={{ left: bar.left, width: bar.width }}
              className={`pointer-events-none absolute bottom-0 h-[3px] rounded-t-full bg-fg ${
                ready ? "transition-[left,width] duration-300 ease-[cubic-bezier(.2,.8,.2,1)]" : ""}`} />
          )}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2.5">{children}</div>
      </div>
    </header>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  IconChevronDown,
  IconDeviceDesktop,
  IconLogout,
  IconMoon,
  IconSun,
  IconUsers,
} from "@tabler/icons-react";
import { useAuth, useMe } from "../../auth/AuthContext";
import { useCan } from "../../auth/permissions";
import { initials } from "../../lib/password";
import { followSystem, applyTheme, savedTheme, saveTheme, type ThemeChoice } from "../../lib/theme";
import { ROLE_LABEL } from "../../auth/roles";

const THEMES: { value: ThemeChoice; label: string; icon: typeof IconSun }[] = [
  { value: "light", label: "Light", icon: IconSun },
  { value: "dark", label: "Dark", icon: IconMoon },
  { value: "system", label: "System", icon: IconDeviceDesktop },
];

/** The signed-in person, top right: who you are, in which company, with what role — and the
 * few things that are about you: the theme, the team (admins), signing out. */
export function UserMenu() {
  const me = useMe();
  const can = useCan();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeChoice>(savedTheme);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  // "System" follows the OS live, not only at load.
  useEffect(() => (theme === "system" ? followSystem(() => applyTheme("system")) : undefined), [theme]);

  const pick = (t: ThemeChoice) => {
    setTheme(t);
    saveTheme(t);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-2.5 rounded-xl py-1 pr-1.5 pl-1 transition hover:bg-subtle"
      >
        <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-[#d6f1ed] to-[#f4efc4] text-[11px] font-extrabold text-[#0f5a52]">
          {initials(me.user.name || me.user.email)}
        </span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-[13px] font-bold">{me.user.name}</span>
          <span className="block text-[11px] text-muted">{ROLE_LABEL[me.role]}</span>
        </span>
        <IconChevronDown size={15} className="text-muted" />
      </button>
      {open && (
        <div className="absolute top-12 right-0 z-50 w-72 animate-rise rounded-2xl border border-line bg-panel p-1.5 shadow-lift">
          <div className="flex items-center gap-3 border-b border-line px-2.5 pt-2 pb-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#d6f1ed] to-[#f4efc4] text-xs font-extrabold text-[#0f5a52]">
              {initials(me.user.name || me.user.email)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{me.user.name}</div>
              <div className="truncate text-xs text-muted">{me.user.email}</div>
              <div className="mt-0.5 text-xs text-muted">{ROLE_LABEL[me.role]} · {me.org.name}</div>
            </div>
          </div>
          {can("manage_users") && (
            <Link to="/team" onClick={() => setOpen(false)}
              className="mt-1 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold hover:bg-subtle">
              <IconUsers size={17} className="text-muted" />
              Team &amp; roles
            </Link>
          )}
          <div className="px-2.5 pt-2 pb-1.5">
            <div className="mb-1.5 text-[11px] font-bold tracking-wider text-dim uppercase">Appearance</div>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-subtle p-1">
              {THEMES.map(({ value, label, icon: Icon }) => (
                <button key={value} onClick={() => pick(value)} aria-pressed={theme === value}
                  className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold transition ${
                    theme === value ? "bg-panel text-fg shadow-card" : "text-muted hover:text-fg"}`}>
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-1 border-t border-line pt-1">
            <button onClick={() => void signOut()}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-semibold hover:bg-subtle">
              <IconLogout size={17} className="text-muted" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

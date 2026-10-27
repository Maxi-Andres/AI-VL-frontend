import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  IconChevronDown,
  IconDeviceDesktop,
  IconLogout,
  IconMoon,
  IconSun,
  IconUserCircle,
  IconUsers,
} from "@tabler/icons-react";
import { useAuth, useMe } from "../../auth/AuthContext";
import { useCan } from "../../auth/permissions";
import { followSystem, applyTheme, saveTheme, useThemeChoice, type ThemeChoice } from "../../lib/theme";
import { ROLE_LABEL } from "../../auth/roles";
import { Avatar } from "../ui/Avatar";
import { DropMenu, useDropdown } from "../ui/DropMenu";
import { Segmented } from "../ui/Segmented";

const THEMES: { value: ThemeChoice; label: string; icon: typeof IconSun }[] = [
  { value: "light", label: "Light", icon: IconSun },
  { value: "dark", label: "Dark", icon: IconMoon },
  { value: "system", label: "System", icon: IconDeviceDesktop },
];

/** Light / Dark / System, as one segmented control (the menu and Settings → Profile). */
export function ThemePicker({ className = "" }: { className?: string }) {
  const theme = useThemeChoice();
  return (
    <Segmented className={`grid grid-cols-3 gap-1 rounded-lg bg-subtle p-1 ${className}`}>
      {THEMES.map(({ value, label, icon: Icon }) => (
        <button key={value} type="button" onClick={() => saveTheme(value)} aria-pressed={theme === value} data-on={theme === value}
          className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
            theme === value ? "text-fg" : "text-muted hover:text-fg"}`}>
          <Icon size={14} />
          {label}
        </button>
      ))}
    </Segmented>
  );
}

/** The signed-in person, top right: who you are, in which company, with what role — and the
 * few things that are about you: your profile, the team (admins), the theme, signing out. */
export function UserMenu() {
  const me = useMe();
  const can = useCan();
  const { signOut } = useAuth();
  const { open, setOpen, ref } = useDropdown();
  const theme = useThemeChoice();

  // "System" follows the OS live, not only at load.
  useEffect(() => (theme === "system" ? followSystem(() => applyTheme("system")) : undefined), [theme]);

  const item = "flex items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-[13px] font-semibold hover:bg-subtle";

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex cursor-pointer items-center gap-2.5 rounded-xl py-1 pr-2 pl-1 transition hover:bg-subtle">
        <Avatar id={me.user.id} name={me.user.name || me.user.email} color={me.user.color} size={34} />
        <span className="hidden text-left md:block">
          <b className="block text-[13px] leading-tight">{me.user.name}</b>
          <small className="block text-[11.5px] leading-tight text-dim">{ROLE_LABEL[me.role]}</small>
        </span>
        <IconChevronDown size={15} className="text-dim" />
      </button>
      <DropMenu open={open} className="top-[52px] w-[270px]">
        <div className="mb-1 flex items-center gap-2.5 border-b border-line p-2.5">
          <Avatar id={me.user.id} name={me.user.name || me.user.email} color={me.user.color} size={34} />
          <div className="min-w-0">
            <b className="block truncate text-[13px]">{me.user.name}</b>
            <small className="block truncate text-[11.5px] text-dim">{me.user.email}</small>
          </div>
        </div>
        <Link to="/settings#profile" onClick={() => setOpen(false)} className={item}>
          <IconUserCircle size={17} className="text-muted" />Profile
        </Link>
        {can("manage_users") && (
          <Link to="/settings#team" onClick={() => setOpen(false)} className={item}>
            <IconUsers size={17} className="text-muted" />Team &amp; roles
          </Link>
        )}
        <div className="px-2.5 pt-2 pb-1.5">
          <div className="mb-1.5 text-[11px] font-bold tracking-wider text-dim uppercase">Appearance</div>
          <ThemePicker />
        </div>
        <div className="my-1 h-px bg-line" />
        <button onClick={() => void signOut()} className={`${item} w-full cursor-pointer text-left`}>
          <IconLogout size={17} className="text-muted" />Sign out
        </button>
      </DropMenu>
    </div>
  );
}

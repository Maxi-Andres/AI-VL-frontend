import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconLogout } from "@tabler/icons-react";
import { useAuth, useMe } from "../../auth/AuthContext";
import { initials } from "../../lib/password";
import { ROLE_LABEL } from "../../auth/roles";


/** The signed-in person, top right: who you are, in which company, with what role. */
export function UserMenu() {
  const me = useMe();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
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

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-2 rounded-lg py-1 pr-1.5 pl-1 hover:bg-panel"
      >
        <span className="grid size-7 place-items-center rounded-full bg-gradient-to-br from-[#2fc1b1] to-[#d8cf3c] text-[11px] font-extrabold text-[#05302b]">
          {initials(me.user.name || me.user.email)}
        </span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-xs font-semibold text-fg">{me.user.name}</span>
          <span className="block text-[10.5px] text-muted">{ROLE_LABEL[me.role]}</span>
        </span>
        <IconChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div className="absolute top-11 right-0 z-50 w-64 rounded-xl border border-line bg-panel p-1.5 shadow-2xl">
          <div className="border-b border-line px-2.5 pt-1.5 pb-2.5">
            <div className="text-sm font-semibold text-fg">{me.user.name}</div>
            <div className="truncate text-xs text-muted">{me.user.email}</div>
            <div className="mt-1.5 text-xs text-muted">
              {ROLE_LABEL[me.role]} · {me.org.name}
            </div>
          </div>
          <button
            onClick={() => void signOut()}
            className="mt-1 flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-fg hover:bg-bg"
          >
            <IconLogout size={16} className="text-muted" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

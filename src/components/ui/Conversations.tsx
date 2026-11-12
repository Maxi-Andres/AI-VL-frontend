import { useState } from "react";
import { IconChevronDown, IconMessages, IconPlus, IconTrash } from "@tabler/icons-react";
import type { ChatSummary } from "../../api/chats";
import { DropMenu, useDropdown } from "./DropMenu";
import { useT, type Vars } from "../../i18n";

/** What the switcher needs from useChats: the list, the one open, and what to do. */
export interface ConversationsControls {
  chats: ChatSummary[];
  current: string | null;
  error: string | null;
  onOpen: (id: string | null) => void;
  onDelete: (id: string) => void;
}

function ago(iso: string, t: (text: string, vars?: Vars) => string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return t("just now");
  if (m < 60) return t("{n} min ago", { n: m });
  if (m < 1440) return t("{n} h ago", { n: Math.floor(m / 60) });
  return new Date(iso).toLocaleDateString();
}

/** Which conversation is open, the others to switch to, a new one, and deleting. */
export function Conversations({ chat, busy, className = "" }: { chat: ConversationsControls; busy: boolean; className?: string }) {
  const t = useT();
  const { open, setOpen, ref } = useDropdown();
  const [confirm, setConfirm] = useState<string | null>(null);
  const title = chat.chats.find((c) => c.id === chat.current)?.title ?? t("New conversation");
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div ref={ref} className="relative min-w-0 flex-1">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} disabled={busy}
          className="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-bold transition hover:bg-subtle disabled:cursor-default disabled:opacity-60">
          <IconMessages size={15} className="shrink-0 text-muted" />
          <span className="min-w-0 truncate">{title}</span>
          {chat.chats.length > 0 && <span className="shrink-0 text-[11px] font-semibold text-dim">{chat.chats.length}</span>}
          <IconChevronDown size={14} className={`ml-auto shrink-0 text-dim transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        <DropMenu open={open} className="top-9 right-auto left-0 w-full">
          {chat.chats.length === 0 && <p className="m-0 px-2.5 py-3 text-center text-[12.5px] text-muted">{t("No saved conversations yet.")}</p>}
          <ul className="m-0 max-h-[320px] list-none overflow-y-auto p-0">
            {chat.chats.map((c) => (
              <li key={c.id} className={`group flex items-center gap-1 rounded-[9px] ${c.id === chat.current ? "bg-subtle" : "hover:bg-subtle"}`}>
                <button type="button" onClick={() => { chat.onOpen(c.id); setOpen(false); setConfirm(null); }}
                  className="min-w-0 flex-1 cursor-pointer px-2.5 py-2 text-left">
                  <b className="block truncate text-[12.5px]">{c.title || t("Untitled")}</b>
                  <small className="block text-[11px] text-dim">{ago(c.updated_at, t)}{c.messages ? ` · ${c.messages === 1 ? t("1 message") : t("{n} messages", { n: c.messages })}` : ""}</small>
                </button>
                {confirm === c.id ? (
                  <button type="button" onClick={() => { chat.onDelete(c.id); setConfirm(null); }}
                    className="mr-1.5 shrink-0 cursor-pointer rounded-md bg-bad-bg px-2 py-1 text-[11px] font-bold text-bad-fg">
                    {t("Delete")}
                  </button>
                ) : (
                  <button type="button" onClick={() => setConfirm(c.id)} aria-label={t("Delete {title}", { title: c.title })} title={t("Delete this conversation")}
                    className="mr-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-dim opacity-60 transition group-hover:opacity-100 hover:bg-bad-bg hover:text-bad-fg">
                    <IconTrash size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </DropMenu>
      </div>
      <button type="button" onClick={() => chat.onOpen(null)} disabled={busy || chat.current === null} title={t("New conversation")}
        className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[12px] font-bold transition hover:bg-subtle active:scale-95 disabled:cursor-default disabled:opacity-40">
        <IconPlus size={14} />{t("New")}
      </button>
      {chat.error && (
        <span role="alert" title={chat.error} className="max-w-[40%] shrink truncate text-[11px] font-semibold text-bad-fg">{chat.error}</span>
      )}
    </div>
  );
}

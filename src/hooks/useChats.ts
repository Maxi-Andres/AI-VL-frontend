import { useCallback, useEffect, useRef, useState } from "react";
import { addMessage, deleteChat, getChat, listChats } from "../api/chats";
import { rememberPref } from "../lib/prefs";
import type { ChatKind, ChatMessage, ChatSummary, NewMessage } from "../api/chats";
import { t } from "../i18n";

// The conversation this browser had open last, one per kind (Live's and the agent's).
const LAST: Record<ChatKind, string> = { vlm: "pilot.chat", agent: "pilot.agent-chat" };

/** The conversation this browser had open last (null: none, or a new one not saved yet). */
export function lastChat(kind: ChatKind = "vlm"): string | null {
  try {
    return localStorage.getItem(LAST[kind]);
  } catch {
    return null; // private mode
  }
}

// A message saved outside the chat view (a question spoken on another page, maybe in another tab)
// is announced here, so a page showing that conversation reloads it.
const SAVED: Record<ChatKind, string> = { vlm: "pilot.chat-saved", agent: "pilot.agent-chat-saved" };

/** Tell this browser's other pages that conversation `id` has a new message. */
export function announceSaved(id: string, kind: ChatKind = "vlm"): void {
  if (typeof BroadcastChannel === "undefined") return;
  const ch = new BroadcastChannel(SAVED[kind]);
  ch.postMessage(id);
  ch.close();
}

/** Remember `id` as the conversation open in this browser. */
export function rememberChat(id: string | null, kind: ChatKind = "vlm"): void {
  try {
    rememberPref(LAST[kind], id);
  } catch {
    /* private mode */
  }
}

/**
 * The person's conversations of one kind — with the vision assistant (Live, "vlm") or with
 * the agent ("agent") — kept on the server: the list, the one
 * open, and what it said. A new chat exists only once its first message is saved. `version`
 * changes when another conversation is opened (or a new one started) — not when a message is
 * saved — so the chat view reloads its history exactly then. `history` follows the saves too:
 * it is what the next question sends as context, and before 2026-10-28 it held only what was
 * loaded on opening, so the second question of a new chat went without the first.
 *
 * Saves run one after another: a second answer that lands while the first message is still
 * making the chat goes into that same chat, not into a new one.
 */
export function useChats(enabled: boolean, kind: ChatKind = "vlm") {
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const currentRef = useRef<string | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const list = await listChats(kind, signal);
    setChats(list);
    return list;
  }, [kind]);

  const open = useCallback(async (id: string | null, signal?: AbortSignal) => {
    currentRef.current = id;
    setCurrent(id);
    rememberChat(id, kind);
    if (!id) {
      setHistory([]);
      setVersion((v) => v + 1);
      return;
    }
    try {
      const chat = await getChat(id, signal);
      setHistory(chat.messages);
      setError(null);
    } catch (e) {
      if (signal?.aborted) return;
      setHistory([]);
      setError(e instanceof Error ? e.message : t("Could not open the conversation."));
    }
    setVersion((v) => v + 1);
  }, [kind]);

  // On arrival: the conversation this browser had open, else the latest one.
  useEffect(() => {
    if (!enabled) return;
    const ctl = new AbortController();
    refresh(ctl.signal)
      .then((list) => {
        const last = lastChat(kind);
        const pick = list.find((c) => c.id === last)?.id ?? list[0]?.id ?? null;
        return open(pick, ctl.signal);
      })
      .catch(() => undefined);
    return () => ctl.abort();
  }, [enabled, kind, refresh, open]);

  // Saved elsewhere into the conversation open here: show it (and send it as context).
  useEffect(() => {
    if (!enabled || typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(SAVED[kind]);
    ch.onmessage = (e) => {
      if (e.data === currentRef.current) void open(currentRef.current);
      else void refresh().catch(() => undefined);
    };
    return () => ch.close();
  }, [enabled, kind, open, refresh]);

  const save = useCallback((msg: NewMessage) => {
    queue.current = queue.current.then(async () => {
      try {
        const before = currentRef.current;
        const chat = await addMessage(before, msg);
        // The conversation the question belongs to: kept for the next question's context
        // (a conversation opened meanwhile has loaded its own).
        if (currentRef.current === before) {
          setHistory((h) => [...h, { id: -Date.now(), at: new Date().toISOString(), ...msg }]);
        }
        if (currentRef.current !== chat.id) {
          currentRef.current = chat.id; // the chat this first message made; no reload
          setCurrent(chat.id);
          rememberChat(chat.id, kind);
        }
        setError(null);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? t("Not saved: {error}", { error: e.message }) : t("Not saved."));
      }
    });
  }, [kind, refresh]);

  const remove = useCallback(async (id: string) => {
    try {
      await deleteChat(id);
      const list = await refresh();
      if (currentRef.current === id) await open(list[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Could not delete it."));
    }
  }, [refresh, open]);

  return { chats, current, history, version, error, open, startNew: () => void open(null), save, remove };
}

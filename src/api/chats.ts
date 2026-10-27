// The vision assistant's conversations, kept on the server per person (chats.py): private to
// whoever had them. The page asks the model; this only keeps what was said.
import { backendFetch } from "./backend";
import { check, json } from "./fleet";

export interface ChatSummary {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages?: number;
}

export interface ChatMessage {
  id: number;
  at: string;
  kind: "question" | "analysis";
  question: string;
  answer: string;
  status: string;
  robot: string;
}

export interface NewMessage {
  kind: "question" | "analysis";
  question: string;
  answer: string;
  status: string;
  robot: string;
}

export async function listChats(signal?: AbortSignal): Promise<ChatSummary[]> {
  return (await check(await backendFetch("/api/chats", { signal }))).json();
}

export async function getChat(id: string, signal?: AbortSignal): Promise<ChatSummary & { messages: ChatMessage[] }> {
  return (await check(await backendFetch(`/api/chats/${encodeURIComponent(id)}`, { signal }))).json();
}

/** Add a message — to a new chat when `chatId` is null (it is made, titled after it). */
export async function addMessage(chatId: string | null, msg: NewMessage): Promise<ChatSummary> {
  const path = chatId ? `/api/chats/${encodeURIComponent(chatId)}/messages` : "/api/chats/messages";
  return (await check(await backendFetch(path, json("POST", msg)))).json();
}

export async function deleteChat(id: string): Promise<void> {
  await check(await backendFetch(`/api/chats/${encodeURIComponent(id)}`, { method: "DELETE" }));
}

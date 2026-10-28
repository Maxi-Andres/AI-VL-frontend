import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { askVlmStream, fetchRobotFrame, type ChatTurn } from "../../api/backend";
import { addMessage, getChat } from "../../api/chats";
import { announceSaved, lastChat, rememberChat } from "../../hooks/useChats";
import { useVoiceAssistant } from "../../hooks/useVoiceAssistant";
import { sentAsHistory } from "../../lib/chatMemory";
import { useRobot } from "./RobotContext";
import { useStatus } from "./StatusContext";

/** Ask the VLM `prompt` about a frame, streaming the answer; null on failure. */
export type AskPromptStream = (
  prompt: string,
  onDelta: (piece: string) => void,
) => Promise<string | null>;

interface VoiceAssistantContextValue {
  va: ReturnType<typeof useVoiceAssistant>;
  /** A page that shows video registers how to ask about ITS frame (and show the answer);
   * null when it goes away. */
  registerAsk: (ask: AskPromptStream | null) => void;
}

const VoiceAssistantContext = createContext<VoiceAssistantContextValue | null>(null);

/**
 * The voice assistant for the WHOLE app, not one page: the robot's microphone ("Bender, …")
 * and the device's wake word keep working on Drive, Joints or any other page. It used to live
 * in the Live page, so leaving it closed the robot's mic (reported 2026-10-19).
 *
 * Which frame a question is about: the page's own, when a page with video registered one
 * (Live, which also shows the answer in its panel); otherwise the newest frame from the
 * robot's camera (/api/robot-frame), so the robot always answers about what it sees.
 *
 * Off Live the conversation still counts: the one this browser has open (useChats) goes as
 * context, and the question is saved to it, so it shows in the chat later. Spoken on another
 * page, it was answered without context and never saved (2026-10-28).
 */
export function VoiceAssistantProvider({ children }: { children: ReactNode }) {
  const { robot } = useRobot();
  const { setVoicePhase } = useStatus();
  const pageAsk = useRef<AskPromptStream | null>(null);
  // The last save: the next question waits for it, so its context has the turn before.
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  const askPromptStream = useCallback<AskPromptStream>(
    async (prompt, onDelta) => {
      if (pageAsk.current) return pageAsk.current(prompt, onDelta);
      const image = await fetchRobotFrame();
      if (!image) return null;
      await saving.current;
      let chat = lastChat();
      let history: ChatTurn[] = [];
      if (chat) {
        try {
          history = (await getChat(chat)).messages.filter(sentAsHistory)
            .map((m) => ({ question: m.question, answer: m.answer }));
        } catch {
          chat = null; // deleted meanwhile, or not ours: a new conversation
        }
      }
      try {
        const answer = (await askVlmStream({ image, prompt, robot, history }, onDelta)).trim();
        if (answer) {
          saving.current = addMessage(chat, { kind: "question", question: prompt, answer, status: "", robot })
            .then((c) => {
              rememberChat(c.id);
              announceSaved(c.id);
            })
            .catch(() => undefined); // not saved: the answer was still given
        }
        return answer || null;
      } catch {
        return null;
      }
    },
    [robot],
  );

  const va = useVoiceAssistant({ askPromptStream });
  useEffect(() => setVoicePhase(va.phase), [va.phase, setVoicePhase]);

  const registerAsk = useCallback((ask: AskPromptStream | null) => {
    pageAsk.current = ask;
  }, []);

  return (
    <VoiceAssistantContext value={{ va, registerAsk }}>{children}</VoiceAssistantContext>
  );
}

export function useVoiceAssistantContext(): VoiceAssistantContextValue {
  const ctx = useContext(VoiceAssistantContext);
  if (!ctx) throw new Error("useVoiceAssistantContext must be used within a VoiceAssistantProvider");
  return ctx;
}

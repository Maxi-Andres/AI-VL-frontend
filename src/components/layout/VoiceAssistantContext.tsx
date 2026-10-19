import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { askVlmStream, fetchRobotFrame } from "../../api/backend";
import { useVoiceAssistant } from "../../hooks/useVoiceAssistant";
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
 */
export function VoiceAssistantProvider({ children }: { children: ReactNode }) {
  const { robot } = useRobot();
  const { setVoicePhase } = useStatus();
  const pageAsk = useRef<AskPromptStream | null>(null);

  const askPromptStream = useCallback<AskPromptStream>(
    async (prompt, onDelta) => {
      if (pageAsk.current) return pageAsk.current(prompt, onDelta);
      const image = await fetchRobotFrame();
      if (!image) return null;
      try {
        const answer = await askVlmStream({ image, prompt, robot }, onDelta);
        return answer.trim() || null;
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

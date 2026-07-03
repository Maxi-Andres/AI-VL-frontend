import { createContext, useContext, useState, type ReactNode } from "react";
import type { VoicePhase } from "../../types";

interface StatusContextValue {
  connected: boolean;
  setConnected: (v: boolean) => void;
  voicePhase: VoicePhase;
  setVoicePhase: (v: VoicePhase) => void;
}

const StatusContext = createContext<StatusContextValue | null>(null);

/** Shares the live connection + voice-assistant state between the Header and the
 * active page. */
export function StatusProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>("off");
  return (
    <StatusContext
      value={{ connected, setConnected, voicePhase, setVoicePhase }}
    >
      {children}
    </StatusContext>
  );
}

export function useStatus(): StatusContextValue {
  const ctx = useContext(StatusContext);
  if (!ctx) throw new Error("useStatus must be used within a StatusProvider");
  return ctx;
}

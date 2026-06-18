import { createContext, useContext, useState, type ReactNode } from "react";

interface StatusContextValue {
  connected: boolean;
  setConnected: (v: boolean) => void;
}

const StatusContext = createContext<StatusContextValue | null>(null);

/** Shares the live connection state between the Header and the active page. */
export function StatusProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  return (
    <StatusContext value={{ connected, setConnected }}>
      {children}
    </StatusContext>
  );
}

export function useStatus(): StatusContextValue {
  const ctx = useContext(StatusContext);
  if (!ctx) throw new Error("useStatus must be used within a StatusProvider");
  return ctx;
}

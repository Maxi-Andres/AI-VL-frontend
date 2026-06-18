interface Props {
  connected: boolean;
}

/** Pill showing the live WebSocket connection state. */
export function StatusBadge({ connected }: Props) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${
        connected
          ? "bg-[#173a26] text-accent"
          : "bg-[#3a2330] text-[#ff9aa6]"
      }`}
    >
      {connected ? "connected" : "disconnected"}
    </span>
  );
}

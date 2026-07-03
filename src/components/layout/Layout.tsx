import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { StatusBadge } from "./StatusBadge";
import { StatusProvider, useStatus } from "./StatusContext";
import { VoiceStatusBadge } from "./VoiceStatusBadge";

function HeaderWithStatus() {
  const { connected, voicePhase } = useStatus();
  return (
    <Header>
      <div className="flex items-center gap-2">
        <VoiceStatusBadge phase={voicePhase} />
        <StatusBadge connected={connected} />
      </div>
    </Header>
  );
}

/** App shell: header (with nav + live/voice status) over the routed page. */
export function Layout() {
  return (
    <StatusProvider>
      <HeaderWithStatus />
      <Outlet />
    </StatusProvider>
  );
}

import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { StatusBadge } from "./StatusBadge";
import { StatusProvider, useStatus } from "./StatusContext";
import { RobotProvider, useRobot } from "./RobotContext";
import { CameraControls } from "./CameraControls";
import { VoiceStatusBadge } from "./VoiceStatusBadge";

function HeaderWithStatus() {
  const { connected, voicePhase } = useStatus();
  const { robot, setRobot, robots } = useRobot();
  return (
    <Header>
      <div className="flex items-center gap-2">
        {robots.length > 1 && (
          <select
            value={robot}
            onChange={(e) => setRobot(e.target.value)}
            title="Robot the interpreter and Drive target"
            className="rounded-md border border-line bg-bg px-1.5 py-1 text-xs text-fg focus:border-accent focus:outline-none"
          >
            {robots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        )}
        <CameraControls />
        <VoiceStatusBadge phase={voicePhase} />
        <StatusBadge connected={connected} />
      </div>
    </Header>
  );
}

/** App shell: header (nav + robot selector + live/voice status) over the page. */
export function Layout() {
  return (
    <StatusProvider>
      <RobotProvider>
        <HeaderWithStatus />
        <Outlet />
      </RobotProvider>
    </StatusProvider>
  );
}

import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { StatusBadge } from "./StatusBadge";
import { StatusProvider, useStatus } from "./StatusContext";
import { RobotProvider, useRobot } from "./RobotContext";
import { VideoTransportProvider } from "./VideoTransportContext";
import { PresencePills } from "./PresencePills";
import { VoiceStatusBadge } from "./VoiceStatusBadge";

function HeaderWithStatus() {
  const { connected, voicePhase } = useStatus();
  const { robot, setRobot, robots } = useRobot();
  return (
    <Header>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
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
        <VoiceStatusBadge phase={voicePhase} />
        <PresencePills />
        <StatusBadge connected={connected} />
      </div>
    </Header>
  );
}

/** App shell: header (nav + robot selector + who-is-connected pills + live/voice
 * status) over the page. Settings live on the Robot page, not here: the header holds what
 * you look at while driving, and the camera/network popovers that used to sit here wrote the
 * same values as the robot selector under other names. */
export function Layout() {
  return (
    <StatusProvider>
      <RobotProvider>
        <VideoTransportProvider>
        <HeaderWithStatus />
        <Outlet />
        </VideoTransportProvider>
      </RobotProvider>
    </StatusProvider>
  );
}

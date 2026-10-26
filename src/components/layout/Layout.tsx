import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { StatusProvider, useStatus } from "./StatusContext";
import { RobotProvider } from "./RobotContext";
import { VideoTransportProvider } from "./VideoTransportContext";
import { RobotStatus } from "./RobotStatus";
import { VoiceAssistantProvider, useVoiceAssistantContext } from "./VoiceAssistantContext";
import { VoiceStatusBadge } from "./VoiceStatusBadge";
import { UserMenu } from "./UserMenu";
import { SystemStatus } from "./SystemStatus";

function HeaderWithStatus() {
  const { connected, voicePhase } = useStatus();
  const { va } = useVoiceAssistantContext();
  const wakeWords = [va.voiceMode && "“robot”", va.robotMic && va.robotEar && "“Bender”"]
    .filter(Boolean).join(" or ");
  return (
    <Header>
      <VoiceStatusBadge phase={voicePhase} wakeWords={wakeWords} />
      <RobotStatus />
      <SystemStatus connected={connected} />
      <UserMenu />
    </Header>
  );
}

/** App shell: header (nav + robot selector + who-is-connected pills + live/voice
 * status) over the page. Settings live on the Settings page, not here: the header holds what
 * you look at while driving, and the camera/network popovers that used to sit here wrote the
 * same values as the robot selector under other names. */
export function Layout() {
  return (
    <StatusProvider>
      <RobotProvider>
        <VideoTransportProvider>
          <VoiceAssistantProvider>
            <HeaderWithStatus />
            <Outlet />
          </VoiceAssistantProvider>
        </VideoTransportProvider>
      </RobotProvider>
    </StatusProvider>
  );
}

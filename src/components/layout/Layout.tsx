import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { StatusProvider, useStatus } from "./StatusContext";
import { RobotProvider } from "./RobotContext";
import { VideoTransportProvider } from "./VideoTransportContext";
import { VoiceAssistantProvider, useVoiceAssistantContext } from "./VoiceAssistantContext";
import { VoiceStatusBadge } from "./VoiceStatusBadge";
import { UserMenu } from "./UserMenu";
import { SystemStatus } from "./SystemStatus";
import { NotificationBell } from "./NotificationBell";
import { SearchPalette } from "./SearchPalette";
import { useT } from "../../i18n";

function HeaderWithStatus() {
  const t = useT();
  const { connected, voicePhase } = useStatus();
  const { va } = useVoiceAssistantContext();
  // The wake words are what is said aloud, the same in every language; only the "or" is ours.
  const local = va.voiceMode ? "“robot”" : "";
  const robot = va.robotMic && va.robotEar ? "“Bender”" : "";
  const wakeWords = local && robot ? t("{a} or {b}", { a: local, b: robot }) : local || robot;
  return (
    <Header>
      <VoiceStatusBadge phase={voicePhase} wakeWords={wakeWords} />
      <SystemStatus connected={connected} />
      <SearchPalette />
      <NotificationBell />
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

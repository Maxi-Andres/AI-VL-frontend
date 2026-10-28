import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
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
  // The page scrolls in its own box under the header, not the document: a document scrollbar
  // ran the full height of the window and cut the header's right edge (Fleet, 2026-10-28).
  // A new page starts at its top, as the document scroll did.
  const page = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    page.current?.scrollTo(0, 0);
  }, [pathname]);
  return (
    <StatusProvider>
      <RobotProvider>
        <VideoTransportProvider>
          <VoiceAssistantProvider>
            <div className="flex h-dvh flex-col">
              <HeaderWithStatus />
              <div ref={page} className="min-h-0 flex-1 overflow-y-auto">
                <Outlet />
              </div>
            </div>
          </VoiceAssistantProvider>
        </VideoTransportProvider>
      </RobotProvider>
    </StatusProvider>
  );
}

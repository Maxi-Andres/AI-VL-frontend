import { Button } from "../ui/Button";
import { StatusText } from "../ui/StatusText";
import { useVideoTransport } from "../layout/VideoTransportContext";

/**
 * Pick the path the picture takes. Renders nothing where there is nothing to switch to.
 *
 * It belongs on every page that shows the robot camera, not just one: the two paths only
 * compare honestly when they can be alternated on the SAME link while looking at the same
 * thing, and that comparison has to be repeated on cable, on LTE and on Starlink.
 */
export function VideoTransportSwitch() {
  const { transport, setTransport, available, detail, lastError, whepUrl } =
    useVideoTransport();
  if (!available) return null;
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="text-xs text-muted">Video</span>
      <Button
        variant={transport === "mjpeg" ? "primary" : "secondary"}
        onClick={() => setTransport("mjpeg")}
      >
        MJPEG
      </Button>
      <Button
        variant={transport === "h264" ? "primary" : "secondary"}
        onClick={() => setTransport("h264")}
      >
        H.264
      </Button>
      <Button
        variant={transport === "intra" ? "primary" : "secondary"}
        onClick={() => setTransport("intra")}
        title="All-intra H.264 from the robot, decoded here. Half the bytes of MJPEG, no jitter buffer."
      >
        H.264 intra
      </Button>
      <span className="text-xs text-muted">{detail}</span>
      {lastError && (
        // The one failure a user can fix themselves, and the only one worth a link.
        //
        // The video server answers on its own origin (:8889) with a self-signed certificate,
        // so a browser that has never been there refuses the request outright — no prompt, no
        // console entry the operator would look at. Opening the endpoint once and accepting
        // the warning is the whole fix, and it is per browser, so it comes back on every new
        // machine. Shown after the fall-back rather than instead of it: the drive view keeps
        // working on MJPEG while this explains why the other button did nothing.
        <a
          href={whepUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-accent2 underline underline-offset-2 hover:opacity-80"
          title={lastError}
        >
          <StatusText
            status={{
              tone: "warn",
              text: "Open this once and accept the certificate to enable H.264",
            }}
          />
        </a>
      )}
    </div>
  );
}

import { Button } from "../ui/Button";
import { useVideoTransport } from "../layout/VideoTransportContext";

/**
 * Pick the path the picture takes. Renders nothing where there is nothing to switch to.
 *
 * It belongs on every page that shows the robot camera, not just one: the two paths only
 * compare honestly when they can be alternated on the SAME link while looking at the same
 * thing, and that comparison has to be repeated on cable, on LTE and on Starlink.
 */
export function VideoTransportSwitch() {
  const { transport, setTransport, available, detail } = useVideoTransport();
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
      <span className="text-xs text-muted">{detail}</span>
    </div>
  );
}

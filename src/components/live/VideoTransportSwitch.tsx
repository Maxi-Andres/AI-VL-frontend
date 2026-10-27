import { StatusText } from "../ui/StatusText";
import { useVideoTransport } from "../layout/VideoTransportContext";
import { Segmented } from "../ui/Segmented";
import { useT } from "../../i18n";

/**
 * Pick the path the picture takes. Renders nothing where there is nothing to switch to.
 *
 * It belongs on every page that shows the robot camera, not just one: the two paths only
 * compare honestly when they can be alternated on the SAME link while looking at the same
 * thing, and that comparison has to be repeated on cable, on LTE and on Starlink.
 */
export function VideoTransportSwitch() {
  const t = useT();
  const { transport, setTransport, available, detail, lastError, whepUrl, mjpegRetired } =
    useVideoTransport();
  if (!available) return null;
  const options: { id: typeof transport; label: string; title?: string; off?: boolean }[] = [
    {
      id: "mjpeg", label: "MJPEG", off: mjpegRetired,
      title: mjpegRetired
        ? t("Retired for this robot: H.264 intra arrives as early with fewer bytes (measured 2026-10-07)")
        : t("A JPEG per frame through this server: lowest delay on a healthy link"),
    },
    { id: "h264", label: "H.264", title: t("WebRTC from the video server: holds up on a lossy link") },
    { id: "intra", label: "H.264 intra", title: t("All-intra H.264 from the robot, decoded here. Half the bytes of MJPEG, no jitter buffer.") },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented role="radiogroup" aria-label={t("Video transport")} title={detail || undefined}
        className="flex rounded-[10px] bg-subtle p-[3px]">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={transport === o.id} data-on={transport === o.id}
            onClick={() => setTransport(o.id)} disabled={o.off} title={o.title}
            className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-50 ${
              transport === o.id ? "text-fg" : "text-muted hover:text-fg"}`}>
            {o.label}
          </button>
        ))}
      </Segmented>
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
              text: t("Open this once and accept the certificate to enable H.264"),
            }}
          />
        </a>
      )}
    </div>
  );
}

import { Button } from "../ui/Button";

interface Props {
  /** Latest robot-camera JPEG as a data URL (empty until the first frame). */
  frameUrl: string;
  connected: boolean;
  /** Switch back to this device's own camera. */
  onExit: () => void;
}

/**
 * Shows the robot camera feed on the Live page (when the device is acting as a
 * remote monitor instead of using its own webcam). Presentational: it just renders
 * the frame + a control to go back to the own camera.
 */
export function RobotCameraStage({ frameUrl, connected, onExit }: Props) {
  return (
    <section className="min-w-0">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-line bg-black">
        {frameUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img
            src={frameUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            {connected ? "Waiting for the robot camera…" : "Connecting…"}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
        <Button variant="secondary" onClick={onExit}>
          Use my camera
        </Button>
        <span className="text-xs text-muted">
          Robot camera {connected ? "· live" : "· connecting"}
        </span>
      </div>
    </section>
  );
}

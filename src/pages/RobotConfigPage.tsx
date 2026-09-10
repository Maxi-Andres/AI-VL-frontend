import { useCallback, useEffect, useState } from "react";
import { getRobotTransport, type RobotTransports } from "../api/backend";
import { useRobot } from "../components/layout/RobotContext";

/**
 * Everything that is configured ON THE ROBOT, and how to change it.
 *
 * WHY A PAGE OF ITS OWN: three services run on the robot's own computer (telemetry, video,
 * command relay), because DDS cannot cross a subnet boundary on these robots — measured, 122
 * topics from the robot's own subnet versus 2 from another one. So the processes that touch
 * DDS have to sit next to it, and the addresses they push to live in .env files there rather
 * than in this app. That is what lets the robot report from any network; the cost is that
 * those values are invisible from here unless the robot reports them, which is what this page
 * is for.
 *
 * Values come from /proc of the RUNNING processes on the robot, not from the .env files: a
 * file edited without a restart shows the OLD value, which is the truth about what is running.
 */

const REPO_TELEMETRY = "~/robot-telemetry-agent";
const REPO_RELAY = "~/robot-command-relay";
const REPO_VIDEO = "~/robot-video-pipeline";

function Steps({ lines }: { lines: string[] }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-line bg-[#0a0b0f] p-2 font-mono text-xs text-fg">
      {lines.join("\n")}
    </pre>
  );
}

function Facts({ rows }: { rows: [string, string | undefined][] }) {
  const shown = rows.filter(([, v]) => v);
  if (!shown.length) return null;
  return (
    <dl className="my-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {shown.map(([k, v]) => (
        <div key={k} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-muted">{k}</dt>
          <dd className="m-0 break-all font-mono text-xs text-fg">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function RobotConfigPage() {
  const { robot } = useRobot();
  const [data, setData] = useState<RobotTransports["transports"] | null>(null);

  const load = useCallback(() => {
    getRobotTransport()
      .then((t) => setData(t.transports ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  const cur = data?.[robot];
  const relay = cur?.relay;
  const video = relay?.video;
  const telemetry = relay?.telemetry;
  const limits = relay?.limits;

  return (
    <main className="mx-auto max-w-3xl p-6 leading-relaxed">
      <h2 className="mt-0 text-lg font-semibold">Robot configuration</h2>
      <p className="text-muted">
        These values are set on <strong>{robot}</strong> itself, in <code>.env</code> files on
        the robot — not in this app and not in source code. They are shown here as the
        <em> running processes</em> report them, so a file edited without restarting its
        service will still show the old value. That is deliberate: it is what is actually in
        effect.
      </p>

      {cur?.mode !== "relay" && (
        <p className="rounded-md border border-line bg-panel p-2 text-sm text-muted">
          Command transport for {robot} is <strong>{cur?.mode ?? "dds"}</strong>. These values
          travel through the on-robot relay, so switch <em>Net → Command transport</em> to
          “relay” to read them.
        </p>
      )}

      {cur?.mode === "relay" && relay?.ok !== true && (
        <p className="rounded-md border border-line bg-panel p-2 text-sm text-amber-500">
          The relay at {cur?.url || "—"} is not answering, so the robot cannot report its
          configuration right now.
        </p>
      )}

      <section>
        <h3 className="mb-1 text-base font-semibold">Video</h3>
        {video?.running ? (
          <Facts
            rows={[
              [
                "publishes to",
                `${video.proto}://${video.publish_host}${video.port ? `:${video.port}` : ""}/${video.stream}`,
              ],
              ["frame rate", video.maxfps ? `${video.maxfps} fps` : undefined],
              ["bitrate", video.bitrate],
            ]}
          />
        ) : (
          <p className="text-muted">Not publishing (or not reported yet).</p>
        )}
        <p className="mb-1 text-sm text-muted">
          The robot encodes H.264 in hardware and pushes it out; mediamtx re-serves it. The
          values above are that RTMP push only.
        </p>
        <p className="mb-1 text-sm text-amber-500">
          There is a <strong>second</strong> video stream the relay does not report: the raw
          MJPEG on port 8093, which <code>robot_camera_bridge</code> pulls directly. Measured
          on 2026-09-09 over the field link it was <strong>218 KB/s against the RTMP’s 42</strong>
          — five times bigger. <code>MJPEG_FPS=0</code> means <em>no cap</em>, which is the
          default. If you are trying to cut what the robot uploads, that is the knob, not{" "}
          <code>BITRATE</code>.
        </p>
        <p className="mb-1 text-sm text-muted">
          Both live in the same file. Useful keys: <code>PUBLISH_HOST</code>,{" "}
          <code>BITRATE</code>, <code>IDR_FRAMES</code>, <code>NVR_FPS</code> for the RTMP
          push; <code>MJPEG_FPS</code>, <code>MJPEG_QUALITY</code>, <code>MJPEG_WIDTH</code>{" "}
          for the direct stream. All are read at start-up, so a restart is required — there is
          no live knob.
        </p>
        <Steps
          lines={[
            `nano ${REPO_VIDEO}/robot/video.env`,
            "sudo systemctl restart robot-video",
          ]}
        />
      </section>

      <section>
        <h3 className="mb-1 text-base font-semibold">Telemetry</h3>
        {telemetry?.running ? (
          <Facts
            rows={[
              ["HEC endpoint", telemetry.hec_url],
              ["index", telemetry.index],
              ["interval", telemetry.period_s ? `${telemetry.period_s}s` : undefined],
              [
                "daily byte cap",
                // The unit does not set DAILY_BYTE_CAP, so the relay reports "" while a cap
                // IS in force: hec_shipper defaults to 150 MB. Facts drops empty rows, so
                // without this the page would silently omit a limit that is active — the
                // opposite of what this page promises.
                telemetry.daily_byte_cap || "150 MB (hec_shipper default — not set in the unit)",
              ],
              ["robot name", telemetry.robot_name],
            ]}
          />
        ) : (
          <p className="text-muted">Not reported yet.</p>
        )}
        <p className="mb-1 text-sm text-muted">
          The daily byte cap stops the agent rather than letting it run away. It was sized
          when the licence was a shared 500 MB/day trial; since 2026-09-04 the licence is a
          50 GB/day Partner NFR, so the cap is now a runaway guard, not a budget.
        </p>
        <Steps
          lines={[
            "sudo nano /etc/systemd/system/robot-telemetry-agent.service",
            "sudo systemctl daemon-reload",
            "sudo systemctl restart robot-telemetry-agent",
          ]}
        />
      </section>

      <section>
        <h3 className="mb-1 text-base font-semibold">Safety envelope</h3>
        {limits ? (
          <Facts
            rows={[
              ["max forward / lateral", `${limits.max_vx} / ${limits.max_vy} m/s`],
              ["max yaw", `${limits.max_vyaw} rad/s`],
              ["dead-man window", `${limits.deadman_ms} ms`],
              ["rate limit", `${limits.max_per_sec}/s`],
              ["DDS interface", limits.dds_iface],
            ]}
          />
        ) : (
          <p className="text-muted">Not reported yet.</p>
        )}
        <p className="mb-1 text-sm text-muted">
          Enforced on the robot, not by the caller: velocities are clamped whatever is asked
          for, and a movement not refreshed within the dead-man window is stopped
          automatically. Acrobatics (flips, jumps, handstand, dances) are not in the relay’s
          verb list at all, so they cannot be commanded remotely.
        </p>
        <Steps
          lines={[
            `nano ${REPO_RELAY}/relay.env`,
            "sudo systemctl restart robot-command-relay",
          ]}
        />
      </section>

      <section>
        <h3 className="mb-1 text-base font-semibold">Updating the robot’s code</h3>
        <p className="mb-1 text-sm text-muted">
          Four git repos live on the robot. Three are ours — one per service, since the
          telemetry agent and the command relay are separate repos: the relay is the only
          thing that can move the robot, so it is named and audited on its own.
          <code> ~/unitree_sdk2</code> is Unitree’s, needed only to compile against.
        </p>
        <Steps
          lines={[
            "ssh unitree@192.168.123.18      # robot on the local LAN",
            "ssh unitree@10.1.254.18         # robot in the field, via the IR1101 tunnel",
            "",
            "# telemetry  ->  telemetry_reader (read-only; cannot move the robot)",
            `cd ${REPO_TELEMETRY} && git pull && ./build.sh`,
            "sudo systemctl restart robot-telemetry-agent",
            "",
            "# command relay  ->  command_sender (the only path that can move it)",
            `cd ${REPO_RELAY} && git pull && ./build.sh`,
            "sudo systemctl restart robot-command-relay",
            "",
            "# video  ->  go2_jpeg_stream (this is what reads the camera off DDS)",
            `cd ${REPO_VIDEO} && git pull && ./build.sh`,
            "sudo systemctl restart robot-video",
          ]}
        />
        <p className="mb-1 text-sm text-muted">
          All three of ours compile C++ and all three need <code>./build.sh</code>: the
          binaries are gitignored, so a pull brings new source without rebuilding it. In the
          video repo the GStreamer pipeline is only the encode half —
          <code> go2_jpeg_stream</code> is the C++ that reads the camera over DDS. Running
          <code> build.sh</code> when nothing changed is harmless, so just always run it.
        </p>
        <p className="mb-1 text-sm text-muted">
          Pull the SDK only to take an upstream update — and then rebuild <em>all three</em>,
          since their binaries are statically linked against it:
        </p>
        <Steps
          lines={[
            "cd ~/unitree_sdk2 && git pull",
            `cd ${REPO_TELEMETRY} && ./build.sh`,
            `cd ${REPO_RELAY} && ./build.sh`,
            `cd ${REPO_VIDEO} && ./build.sh`,
          ]}
        />
      </section>

      <section>
        <h3 className="mb-1 text-base font-semibold">Services on the robot</h3>
        <p className="mb-1 text-sm text-muted">
          All three are enabled at boot, so powering the robot on is enough — nothing here has
          to be started by hand.
        </p>
        <Steps
          lines={[
            "systemctl status robot-telemetry-agent robot-video robot-command-relay",
            "journalctl -u robot-command-relay -f    # Ctrl-C closes the view, not the service",
          ]}
        />
      </section>
    </main>
  );
}

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

const REPO_RELAY = "~/robot-splunk-bridge";
const REPO_VIDEO = "~/robot-nvr-bridge";

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
          The robot encodes H.264 in hardware and pushes it out; mediamtx re-serves it. Change
          the destination on the robot:
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
              ["daily byte cap", telemetry.daily_byte_cap],
              ["robot name", telemetry.robot_name],
            ]}
          />
        ) : (
          <p className="text-muted">Not reported yet.</p>
        )}
        <p className="mb-1 text-sm text-muted">
          The daily byte cap exists because the Splunk licence is shared: the agent stops
          sending rather than eating someone else’s quota.
        </p>
        <Steps
          lines={[
            "sudo nano /etc/systemd/system/robot-splunk-bridge.service",
            "sudo systemctl daemon-reload",
            "sudo systemctl restart robot-splunk-bridge",
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
            `nano ${REPO_RELAY}/relay/relay.env`,
            "sudo systemctl restart robot-command-relay",
          ]}
        />
      </section>

      <section>
        <h3 className="mb-1 text-base font-semibold">Updating the robot’s code</h3>
        <p className="mb-1 text-sm text-muted">
          Three git repos live on the robot. Two are ours; <code>~/unitree_sdk2</code> is
          Unitree’s, needed only to compile against.
        </p>
        <Steps
          lines={[
            "ssh unitree@<robot>",
            "",
            "# telemetry + command relay  ->  telemetry_reader, command_sender",
            `cd ${REPO_RELAY} && git pull && ./build.sh`,
            "sudo systemctl restart robot-splunk-bridge robot-command-relay",
            "",
            "# video  ->  go2_jpeg_stream (this is what reads the camera off DDS)",
            `cd ${REPO_VIDEO} && git pull && ./build.sh`,
            "sudo systemctl restart robot-video",
          ]}
        />
        <p className="mb-1 text-sm text-muted">
          <strong>Both</strong> repos compile C++ and <strong>both</strong> need
          <code> ./build.sh</code>: the binaries are gitignored, so a pull brings new source
          without rebuilding it. In the video repo the GStreamer pipeline is only the encode
          half — <code>go2_jpeg_stream</code> is the C++ that reads the camera over DDS.
          Running <code>build.sh</code> when nothing changed is harmless, so just always run
          it.
        </p>
        <p className="mb-1 text-sm text-muted">
          Pull the SDK only to take an upstream update — and then rebuild <em>both</em> repos,
          since their binaries are statically linked against it:
        </p>
        <Steps
          lines={[
            "cd ~/unitree_sdk2 && git pull",
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
            "systemctl status robot-splunk-bridge robot-video robot-command-relay",
            "journalctl -u robot-command-relay -f    # Ctrl-C closes the view, not the service",
          ]}
        />
      </section>
    </main>
  );
}

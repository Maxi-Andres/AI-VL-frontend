import { useCallback, useEffect, useState } from "react";
import { getRobotTransport, type RobotTransports } from "../../api/backend";
import { useRobot } from "./RobotContext";

/**
 * Header panel: everything that is configured ON THE ROBOT and therefore read-only here.
 *
 * WHY IT EXISTS: three services run on the robot's own computer (telemetry, video, command
 * relay) because DDS cannot cross a subnet boundary on these robots — so the processes that
 * touch DDS must sit next to it, and the addresses they push to live in .env files there,
 * not in this app. That is not a wart: it is what lets the robot report from any network.
 * The cost is that those values are invisible from here unless the robot reports them, which
 * is exactly what this panel shows.
 *
 * Values come from /proc of the RUNNING processes on the robot, not from the .env files, so
 * a file edited without a restart shows as the old value — which is the truth.
 *
 * Each block names the file to edit and the exact commands to apply it.
 */

const REPO_RELAY = "~/robot-splunk-bridge";
const REPO_VIDEO = "~/robot-nvr-bridge";

function Steps({ lines }: { lines: string[] }) {
  return (
    <pre className="m-0 mt-1 overflow-x-auto rounded border border-line/60 bg-bg/60 px-1.5 py-1 text-[9.5px] leading-snug text-muted">
      {lines.join("\n")}
    </pre>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className="truncate text-fg" title={value}>{value}</span>
    </div>
  );
}

export function RobotFacts() {
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
  const reachable = relay?.ok === true;

  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-fg">
        Robot config
      </summary>
      <div className="absolute right-0 z-30 mt-1 max-h-[70vh] w-80 space-y-2.5 overflow-y-auto rounded-md border border-line bg-panel p-2.5 text-[10.5px] shadow-lg">
        <p className="m-0 leading-tight text-muted">
          Set on <span className="text-fg">{robot}</span> itself, in <code>.env</code> files —
          not in this app and not in code. Shown here as the running processes report them.
        </p>

        {cur?.mode !== "relay" && (
          <p className="m-0 rounded border border-line/60 bg-bg/40 px-1.5 py-1 leading-tight text-muted">
            Transport is <span className="text-fg">{cur?.mode ?? "dds"}</span>. These values
            arrive through the on-robot relay, so switch Net → transport to “relay” to read
            them.
          </p>
        )}

        {cur?.mode === "relay" && !reachable && (
          <p className="m-0 rounded border border-line/60 bg-bg/40 px-1.5 py-1 leading-tight text-amber-500">
            The relay at {cur?.url || "—"} is not answering, so the robot cannot report its
            configuration right now.
          </p>
        )}

        {video && (
          <section>
            <h4 className="m-0 mb-0.5 text-[11px] text-fg">Video</h4>
            {video.running ? (
              <>
                <Row
                  label="publishes to"
                  value={`${video.proto}://${video.publish_host}${video.port ? `:${video.port}` : ""}/${video.stream}`}
                />
                <Row label="fps / bitrate" value={`${video.maxfps} · ${video.bitrate}`} />
              </>
            ) : (
              <p className="m-0 text-muted">Not publishing.</p>
            )}
            <Steps
              lines={[
                `nano ${REPO_VIDEO}/robot/video.env`,
                "sudo systemctl restart robot-video",
              ]}
            />
          </section>
        )}

        {telemetry && (
          <section>
            <h4 className="m-0 mb-0.5 text-[11px] text-fg">Telemetry</h4>
            {telemetry.running ? (
              <>
                <Row label="HEC" value={telemetry.hec_url} />
                <Row label="index" value={telemetry.index} />
                <Row label="every" value={telemetry.period_s ? `${telemetry.period_s}s` : ""} />
                <Row label="daily cap" value={telemetry.daily_byte_cap} />
              </>
            ) : (
              <p className="m-0 text-muted">Not running.</p>
            )}
            <Steps
              lines={[
                "sudo nano /etc/systemd/system/robot-splunk-bridge.service",
                "sudo systemctl daemon-reload",
                "sudo systemctl restart robot-splunk-bridge",
              ]}
            />
          </section>
        )}

        {limits && (
          <section>
            <h4 className="m-0 mb-0.5 text-[11px] text-fg">Safety envelope</h4>
            <Row
              label="max speed"
              value={`${limits.max_vx}/${limits.max_vy} m/s · ${limits.max_vyaw} rad/s`}
            />
            <Row label="dead-man" value={`${limits.deadman_ms} ms`} />
            <Row label="rate limit" value={`${limits.max_per_sec}/s`} />
            <Row label="DDS interface" value={limits.dds_iface} />
            <Steps
              lines={[
                `nano ${REPO_RELAY}/relay/relay.env`,
                "sudo systemctl restart robot-command-relay",
              ]}
            />
          </section>
        )}

        <section>
          <h4 className="m-0 mb-0.5 text-[11px] text-fg">Updating the robot’s code</h4>
          <Steps
            lines={[
              "ssh unitree@<robot>",
              `cd ${REPO_RELAY} && git pull && ./build.sh`,
              "sudo systemctl restart robot-splunk-bridge robot-command-relay",
              `cd ${REPO_VIDEO} && git pull`,
              "sudo systemctl restart robot-video",
            ]}
          />
          <p className="m-0 mt-1 leading-tight text-muted/70">
            ./build.sh is not optional after a pull: the binaries are gitignored, so a pull
            brings new source without rebuilding it.
          </p>
        </section>
      </div>
    </details>
  );
}

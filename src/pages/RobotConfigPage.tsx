import { useCallback, useEffect, useState } from "react";
import { getRobotTransport, type RobotTransports } from "../api/backend";
import { BACKEND_URL } from "../config";
import { useRobot } from "../components/layout/RobotContext";
import { CameraSettings } from "../components/robot/CameraSettings";
import { ConnectionSettings } from "../components/robot/ConnectionSettings";
import { StatusText } from "../components/ui/StatusText";
import { NAMING_RULE, REPO_RELAY, REPO_VIDEO, deployFor, type RobotService } from "./robotDeploy";

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
 *
 * The Go2 and the G1 run different code from the same repos. What goes on which robot, and
 * the commands for each, are data in ./robotDeploy.ts — this page only renders the selected
 * robot's table.
 */

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

function ServiceRow({ s }: { s: RobotService }) {
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-baseline gap-2 text-sm">
        <code className="text-fg">{s.unit}</code>
        <StatusText
          status={
            s.state === "running"
              ? { tone: "ok", text: "installed" }
              : { tone: "blocked", text: "not built yet" }
          }
          className={s.state === "running" ? "text-emerald-500" : "text-muted"}
        />
      </div>
      <p className="m-0 text-sm text-muted">
        <code>{s.repo}</code> — {s.specific}
      </p>
      {s.note && <p className="m-0 text-xs text-muted">{s.note}</p>}
      {s.update.length > 0 && <Steps lines={s.update} />}
    </div>
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
  const deploy = deployFor(robot);

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

      <section className="rounded-md border border-line bg-panel p-3">
        <h3 className="mb-1 mt-0 text-base font-semibold">Which code runs on which robot</h3>
        <p className="mb-2 text-sm text-muted">
          The Go2 and the G1 run <strong>different code from the same three repos</strong>. The
          file name says which: read it before building or copying anything onto a robot.
        </p>
        <dl className="my-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {NAMING_RULE.map(([k, v]) => (
            <div key={k} className="col-span-2 grid grid-cols-subgrid">
              <dt className="font-mono text-xs text-fg">{k}</dt>
              <dd className="m-0 text-muted">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mb-0 mt-2 text-xs text-muted">
          <code>ROBOT_MODEL</code> (<code>go2</code> by default, <code>g1</code>) picks the
          variant; everything after the binary is shared. Full map:{" "}
          <code>robot-splunk-docs/QUE-CORRE-EN-CADA-ROBOT.md</code>.
        </p>
      </section>

      <section>
        <h3 className="mb-1 text-base font-semibold">Connection — {robot}</h3>
        <ConnectionSettings />
      </section>

      <section>
        <h3 className="mb-1 text-base font-semibold">Camera stream</h3>
        <CameraSettings />
      </section>

      {cur?.mode !== "relay" && (
        <p className="rounded-md border border-line bg-panel p-2 text-sm text-muted">
          Command transport for {robot} is <strong>{cur?.mode ?? "dds"}</strong>. The values
          below travel through the on-robot relay, so set the transport to “relay” in
          <em> Connection</em> above to read them.
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
          The robot sends <strong>two</strong> H.264 streams, both encoded in hardware on its own
          computer:
        </p>
        <ul className="mb-1 mt-0 pl-5 text-sm text-muted">
          <li>
            <strong>Recorder</strong> — the full-size picture over SRT to mediamtx, which Frigate
            records and the camera bridge re-reads (WHEP) for YOLO and the VLM. Lost packets are
            repaired within the SRT latency, set on THIS machine's receiver
            (<code>srt-bridge.service</code>, 900 ms): raise it there, not on the robot, if the
            recording breaks up.
          </li>
          <li>
            <strong>Drive view</strong> — small all-intra frames over UDP, one picture per
            message, so a lost one costs a single frame and never a freeze. This is what Drive
            shows ({robot === "g1" ? "480×270 at QP 36 by default on the G1" : "640×360 at QP 38 on the Go2"}).
          </li>
        </ul>
        {robot === "g1" ? (
          <p className="mb-1 text-sm text-muted">
            On the G1 the camera bridge still reads the robot&apos;s own MJPEG (port 8093) for
            YOLO and the VLM. The G1 runs the same video code as the Go2 with
            <code> video.g1.env.example</code>, publishing to its own mediamtx path,
            <code> g1</code>.
          </p>
        ) : (
          <p className="mb-1 text-sm text-muted">
            The robot&apos;s MJPEG on port 8093 still exists, but nothing reads it on the Go2 any
            more: Drive uses the all-intra stream and the camera bridge reads the recorder. That
            took ~0.55 Mbps off an LTE uplink with about 1 Mbps to spare.
          </p>
        )}
        <p className="mb-1 text-sm text-muted">
          Useful keys in <code>video.env</code>: <code>BITRATE</code>, <code>IDR_FRAMES</code>,{" "}
          <code>NVR_FPS</code> for the recorder; <code>H264_QP</code>, <code>H264_WIDTH</code>,{" "}
          <code>H264_HEIGHT</code> for the drive view; <code>PUBLISH_HOST</code> for where it all
          goes. The file is read when the service starts, so editing it needs a restart; the
          Video tab changes a few values on the running service without one.
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
        <h3 className="mb-1 text-base font-semibold">
          What is installed on the {deploy.label}, and how to update it
        </h3>
        <p className="mb-1 text-sm text-muted">
          Everything below runs on <strong>{deploy.host}</strong>. Log in first:
        </p>
        <Steps lines={deploy.ssh} />
        <div className="mt-3">
          {deploy.services.map((s) => (
            <ServiceRow key={s.unit} s={s} />
          ))}
        </div>
        <p className="mb-1 text-sm text-muted">
          Every repo of ours compiles C++, so every pull needs <code>./build.sh</code>: the
          binaries are gitignored, and a pull brings new source without rebuilding it. Running
          it when nothing changed is harmless, so just always run it.
        </p>
        <p className="mb-1 text-sm text-muted">
          Pull the SDK only to take an upstream update — and then rebuild every repo, since
          the binaries are statically linked against it:
        </p>
        <Steps
          lines={[
            "cd ~/unitree_sdk2 && git pull",
            ...deploy.services
              .filter((s) => s.state === "running" && s.update.some((l) => l.includes("build.sh")))
              .map((s) => `cd ${s.repo} && ./build.sh`),
          ]}
        />
      </section>

      {deploy.firstTime.length > 0 && (
        <section>
          <h3 className="mb-1 text-base font-semibold">First-time setup on the {deploy.label}</h3>
          <p className="mb-2 text-sm text-muted">
            Once per robot, in this order. Already-done steps are marked as such; they are kept
            here because they are what to repeat if the computer is ever reinstalled.
          </p>
          {deploy.firstTime.map((step) => (
            <div key={step.title} className="mb-3">
              <p className="mb-1 text-sm font-semibold">{step.title}</p>
              <Steps lines={step.lines} />
              {step.note && <p className="m-0 text-xs text-muted">{step.note}</p>}
            </div>
          ))}
        </section>
      )}

      <section>
        <h3 className="mb-1 text-base font-semibold">Services on the robot</h3>
        <p className="mb-1 text-sm text-muted">
          All are enabled at boot, so powering the robot on is enough — nothing here has to be
          started by hand.
        </p>
        <Steps
          lines={[
            `systemctl status ${deploy.services
              .filter((s) => s.state === "running" && !s.unit.startsWith("docker"))
              .map((s) => s.unit)
              .join(" ")}`,
            "journalctl -u robot-telemetry-agent -f    # Ctrl-C closes the view, not the service",
          ]}
        />
      </section>

      {/* Moved here from the About page (removed 2026-10-07): the one live fact it had. */}
      <section>
        <h3 className="mb-1 text-base font-semibold">This app</h3>
        <p className="mb-1 text-sm text-muted">
          The browser talks only to the backend, which reaches iacore and the robots for it. It
          is pointed at:
        </p>
        <Steps lines={[BACKEND_URL || "same origin (the backend serves this page)"]} />
        <p className="m-0 text-xs text-muted">
          Change it in <code>public/config.js</code> (read at runtime, no rebuild) or with{" "}
          <code>VITE_BACKEND_URL</code> at build time.
        </p>
      </section>
    </main>
  );
}

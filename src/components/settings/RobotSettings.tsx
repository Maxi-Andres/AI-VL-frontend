import { useCallback, useEffect, useState } from "react";
import { getRobotTransport, type RobotTransports } from "../../api/backend";
import { BACKEND_URL } from "../../config";
import { useRobot } from "../layout/RobotContext";
import { CameraSettings } from "../robot/CameraSettings";
import { ConnectionSettings } from "../robot/ConnectionSettings";
import { StatusText } from "../ui/StatusText";
import { NAMING_RULE, REPO_RELAY, REPO_VIDEO, deployFor, type RobotService } from "../../pages/robotDeploy";
import { msg, useT } from "../../i18n";
import { rich } from "../../i18n/rich";

/**
 * Everything that is configured ON THE ROBOT, and how to change it — the robot half of
 * Settings (pages/SettingsPage.tsx). Each block is a `data-nav` card the page lists in its menu.
 *
 * WHY THESE LIVE IN THE APP AT ALL: three services run on the robot's own computer (telemetry, video,
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
 *
 * The commands are shell and stay as written; everything around them is translated. Each
 * card's `data-nav` title is an identifier (the menu keys its icon on it), so it stays English
 * and is marked msg() for the menu to translate.
 */

function Steps({ lines }: { lines: string[] }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-line bg-sunken p-2 font-mono text-xs text-fg">
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
  const t = useT();
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-baseline gap-2 text-sm">
        <code className="text-fg">{s.unit}</code>
        <StatusText
          status={
            s.state === "running"
              ? { tone: "ok", text: t("installed") }
              : { tone: "blocked", text: t("not built yet") }
          }
          className={s.state === "running" ? "text-emerald-500" : "text-muted"}
        />
      </div>
      <p className="m-0 text-sm text-muted">
        <code>{s.repo}</code> — {t(s.specific)}
      </p>
      {s.note && <p className="m-0 text-xs text-muted">{t(s.note)}</p>}
      {s.update.length > 0 && <Steps lines={s.update} />}
    </div>
  );
}

export function RobotSettings() {
  const t = useT();
  const { robot } = useRobot();
  const [data, setData] = useState<RobotTransports["transports"] | null>(null);

  const load = useCallback(() => {
    getRobotTransport()
      .then((r) => setData(r.transports ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [load]);

  const cur = data?.[robot];
  const relay = cur?.relay;
  const video = relay?.video;
  const telemetry = relay?.telemetry;
  const limits = relay?.limits;
  const deploy = deployFor(robot);

  return (
    <div className="grid gap-4 leading-relaxed">
      <section data-nav={msg("About these values")} className="scroll-mt-4 rounded-2xl border border-line bg-panel p-5 shadow-card">
      <h3 className="m-0 mb-2 text-[15px] font-extrabold text-fg">{t("About these values")}</h3>
      <p className="m-0 text-sm text-muted">
        {rich(t("These values are set on {robot} itself, in {env} files on the robot — not in this app and not in source code. They are shown here as the {running} report them, so a file edited without restarting its service will still show the old value. That is deliberate: it is what is actually in effect."), {
          robot: <strong>{robot}</strong>, env: <code>.env</code>, running: <em>{t("running processes")}</em>,
        })}
      </p>
      </section>

      <section data-nav={msg("Which code runs where")} className="scroll-mt-4 rounded-2xl border border-line bg-panel p-5 shadow-card">
        <h3 className="m-0 mb-2 text-[15px] font-extrabold text-fg">{t("Which code runs on which robot")}</h3>
        <p className="mb-2 text-sm text-muted">
          {rich(t("The Go2 and the G1 run {different}. The file name says which: read it before building or copying anything onto a robot."), {
            different: <strong>{t("different code from the same three repos")}</strong>,
          })}
        </p>
        <dl className="my-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {NAMING_RULE.map(([k, v]) => (
            <div key={k} className="col-span-2 grid grid-cols-subgrid">
              <dt className="font-mono text-xs text-fg">{t(k)}</dt>
              <dd className="m-0 text-muted">{t(v)}</dd>
            </div>
          ))}
        </dl>
        <p className="mb-0 mt-2 text-xs text-muted">
          {rich(t("{var} ({go2} by default, {g1}) picks the variant; everything after the binary is shared. Full map: {doc}."), {
            var: <code>ROBOT_MODEL</code>, go2: <code>go2</code>, g1: <code>g1</code>,
            doc: <code>robot-splunk-docs/QUE-CORRE-EN-CADA-ROBOT.md</code>,
          })}
        </p>
      </section>

      <section data-nav={msg("Connection")} className="scroll-mt-4 rounded-2xl border border-line bg-panel p-5 shadow-card">
        <h3 className="m-0 mb-2 text-[15px] font-extrabold text-fg">{t("Connection — {robot}", { robot })}</h3>
        <ConnectionSettings />
      </section>

      <section data-nav={msg("Camera stream")} className="scroll-mt-4 rounded-2xl border border-line bg-panel p-5 shadow-card">
        <h3 className="m-0 mb-2 text-[15px] font-extrabold text-fg">{t("Camera stream")}</h3>
        <CameraSettings />
      </section>

      {cur?.mode !== "relay" && (
        <p className="rounded-md border border-line bg-panel p-2 text-sm text-muted">
          {rich(t("Command transport for {robot} is {mode}. The values below travel through the on-robot relay, so set the transport to “relay” in {connection} above to read them.", { robot }), {
            mode: <strong>{cur?.mode ?? "dds"}</strong>, connection: <em>{t("Connection")}</em>,
          })}
        </p>
      )}

      {cur?.mode === "relay" && relay?.ok !== true && (
        <p className="rounded-md border border-line bg-panel p-2 text-sm text-amber-500">
          {t("The relay at {url} is not answering, so the robot cannot report its configuration right now.", { url: cur?.url || "—" })}
        </p>
      )}

      <section data-nav={msg("Robot video")} className="scroll-mt-4 rounded-2xl border border-line bg-panel p-5 shadow-card">
        <h3 className="m-0 mb-2 text-[15px] font-extrabold text-fg">{t("Video")}</h3>
        {video?.running ? (
          <Facts
            rows={[
              [
                t("publishes to"),
                `${video.proto}://${video.publish_host}${video.port ? `:${video.port}` : ""}/${video.stream}`,
              ],
              [t("frame rate"), video.maxfps ? `${video.maxfps} fps` : undefined],
              [t("bitrate"), video.bitrate],
            ]}
          />
        ) : (
          <p className="text-muted">{t("Not publishing (or not reported yet).")}</p>
        )}
        <p className="mb-1 text-sm text-muted">
          {rich(t("The robot sends {two} H.264 streams, both encoded in hardware on its own computer:"), {
            two: <strong>{t("two")}</strong>,
          })}
        </p>
        <ul className="mb-1 mt-0 pl-5 text-sm text-muted">
          <li>
            {rich(t("{name} — the full-size picture over SRT to mediamtx, which Frigate records and the camera bridge re-reads (WHEP) for YOLO and the VLM. Lost packets are repaired within the SRT latency, set on THIS machine's receiver ({unit}, 900 ms): raise it there, not on the robot, if the recording breaks up."), {
              name: <strong>{t("Recorder")}</strong>, unit: <code>srt-bridge.service</code>,
            })}
          </li>
          <li>
            {rich(t("{name} — small all-intra frames over UDP, one picture per message, so a lost one costs a single frame and never a freeze. This is what Drive shows ({detail}).", {
              detail: robot === "g1" ? t("480×270 at QP 36 by default on the G1") : t("640×360 at QP 38 on the Go2"),
            }), { name: <strong>{t("Drive view")}</strong> })}
          </li>
        </ul>
        {robot === "g1" ? (
          <p className="mb-1 text-sm text-muted">
            {rich(t("On the G1 the camera bridge still reads the robot's own MJPEG (port 8093) for YOLO and the VLM. The G1 runs the same video code as the Go2 with {env}, publishing to its own mediamtx path, {path}."), {
              env: <code>video.g1.env.example</code>, path: <code>g1</code>,
            })}
          </p>
        ) : (
          <p className="mb-1 text-sm text-muted">
            {t("The robot's MJPEG on port 8093 still exists, but nothing reads it on the Go2 any more: Drive uses the all-intra stream and the camera bridge reads the recorder. That took ~0.55 Mbps off an LTE uplink with about 1 Mbps to spare.")}
          </p>
        )}
        <p className="mb-1 text-sm text-muted">
          {rich(t("Useful keys in {file}: {bitrate}, {idr}, {nvr} for the recorder; {qp}, {width}, {height} for the drive view; {host} for where it all goes. The file is read when the service starts, so editing it needs a restart; the Video tab changes a few values on the running service without one."), {
            file: <code>video.env</code>, bitrate: <code>BITRATE</code>, idr: <code>IDR_FRAMES</code>,
            nvr: <code>NVR_FPS</code>, qp: <code>H264_QP</code>, width: <code>H264_WIDTH</code>,
            height: <code>H264_HEIGHT</code>, host: <code>PUBLISH_HOST</code>,
          })}
        </p>
        <Steps
          lines={[
            `nano ${REPO_VIDEO}/robot/video.env`,
            "sudo systemctl restart robot-video",
          ]}
        />
      </section>

      <section data-nav={msg("Telemetry")} className="scroll-mt-4 rounded-2xl border border-line bg-panel p-5 shadow-card">
        <h3 className="m-0 mb-2 text-[15px] font-extrabold text-fg">{t("Telemetry")}</h3>
        {telemetry?.running ? (
          <Facts
            rows={[
              [t("HEC endpoint"), telemetry.hec_url],
              [t("index"), telemetry.index],
              [t("interval"), telemetry.period_s ? `${telemetry.period_s}s` : undefined],
              [
                t("daily byte cap"),
                // The unit does not set DAILY_BYTE_CAP, so the relay reports "" while a cap
                // IS in force: hec_shipper defaults to 150 MB. Facts drops empty rows, so
                // without this the page would silently omit a limit that is active — the
                // opposite of what this page promises.
                telemetry.daily_byte_cap || t("150 MB (hec_shipper default — not set in the unit)"),
              ],
              [t("robot name"), telemetry.robot_name],
            ]}
          />
        ) : (
          <p className="text-muted">{t("Not reported yet.")}</p>
        )}
        <p className="mb-1 text-sm text-muted">
          {t("The daily byte cap stops the agent rather than letting it run away. It was sized when the licence was a shared 500 MB/day trial; since 2026-09-04 the licence is a 50 GB/day Partner NFR, so the cap is now a runaway guard, not a budget.")}
        </p>
        <Steps
          lines={[
            "sudo nano /etc/systemd/system/robot-telemetry-agent.service",
            "sudo systemctl daemon-reload",
            "sudo systemctl restart robot-telemetry-agent",
          ]}
        />
      </section>

      <section data-nav={msg("Safety envelope")} className="scroll-mt-4 rounded-2xl border border-line bg-panel p-5 shadow-card">
        <h3 className="m-0 mb-2 text-[15px] font-extrabold text-fg">{t("Safety envelope")}</h3>
        {limits ? (
          <Facts
            rows={[
              [t("max forward / lateral"), `${limits.max_vx} / ${limits.max_vy} m/s`],
              [t("max yaw"), `${limits.max_vyaw} rad/s`],
              [t("dead-man window"), `${limits.deadman_ms} ms`],
              [t("rate limit"), `${limits.max_per_sec}/s`],
              [t("DDS interface"), limits.dds_iface],
            ]}
          />
        ) : (
          <p className="text-muted">{t("Not reported yet.")}</p>
        )}
        <p className="mb-1 text-sm text-muted">
          {t("Enforced on the robot, not by the caller: velocities are clamped whatever is asked for, and a movement not refreshed within the dead-man window is stopped automatically. Acrobatics (flips, jumps, handstand, dances) are not in the relay’s verb list at all, so they cannot be commanded remotely.")}
        </p>
        <Steps
          lines={[
            `nano ${REPO_RELAY}/relay.env`,
            "sudo systemctl restart robot-command-relay",
          ]}
        />
      </section>

      <section data-nav={msg("Installed software")} className="scroll-mt-4 rounded-2xl border border-line bg-panel p-5 shadow-card">
        <h3 className="m-0 mb-2 text-[15px] font-extrabold text-fg">
          {t("What is installed on the {robot}, and how to update it", { robot: deploy.label })}
        </h3>
        <p className="mb-1 text-sm text-muted">
          {rich(t("Everything below runs on {host}. Log in first:"), { host: <strong>{t(deploy.host)}</strong> })}
        </p>
        <Steps lines={deploy.ssh} />
        <div className="mt-3">
          {deploy.services.map((s) => (
            <ServiceRow key={s.unit} s={s} />
          ))}
        </div>
        <p className="mb-1 text-sm text-muted">
          {rich(t("Every repo of ours compiles C++, so every pull needs {build}: the binaries are gitignored, and a pull brings new source without rebuilding it. Running it when nothing changed is harmless, so just always run it."), {
            build: <code>./build.sh</code>,
          })}
        </p>
        <p className="mb-1 text-sm text-muted">
          {t("Pull the SDK only to take an upstream update — and then rebuild every repo, since the binaries are statically linked against it:")}
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
        <section data-nav={msg("First-time setup")} className="scroll-mt-4 rounded-2xl border border-line bg-panel p-5 shadow-card">
          <h3 className="m-0 mb-2 text-[15px] font-extrabold text-fg">{t("First-time setup on the {robot}", { robot: deploy.label })}</h3>
          <p className="mb-2 text-sm text-muted">
            {t("Once per robot, in this order. Already-done steps are marked as such; they are kept here because they are what to repeat if the computer is ever reinstalled.")}
          </p>
          {deploy.firstTime.map((step) => (
            <div key={step.title} className="mb-3">
              <p className="mb-1 text-sm font-semibold">{t(step.title)}</p>
              <Steps lines={step.lines} />
              {step.note && <p className="m-0 text-xs text-muted">{t(step.note)}</p>}
            </div>
          ))}
        </section>
      )}

      <section data-nav={msg("Services")} className="scroll-mt-4 rounded-2xl border border-line bg-panel p-5 shadow-card">
        <h3 className="m-0 mb-2 text-[15px] font-extrabold text-fg">{t("Services on the robot")}</h3>
        <p className="mb-1 text-sm text-muted">
          {t("All are enabled at boot, so powering the robot on is enough — nothing here has to be started by hand.")}
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
      <section data-nav={msg("This app")} className="scroll-mt-4 rounded-2xl border border-line bg-panel p-5 shadow-card">
        <h3 className="m-0 mb-2 text-[15px] font-extrabold text-fg">{t("This app")}</h3>
        <p className="mb-1 text-sm text-muted">
          {t("The browser talks only to the backend, which reaches iacore and the robots for it. It is pointed at:")}
        </p>
        <Steps lines={[BACKEND_URL || t("same origin (the backend serves this page)")]} />
        <p className="m-0 text-xs text-muted">
          {rich(t("Change it in {file} (read at runtime, no rebuild) or with {var} at build time."), {
            file: <code>public/config.js</code>, var: <code>VITE_BACKEND_URL</code>,
          })}
        </p>
      </section>
    </div>
  );
}

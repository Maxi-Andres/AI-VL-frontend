/**
 * What lives on each robot, and the commands to install and update it.
 *
 * Kept as data, apart from RobotConfigPage, for one reason: the Go2 and the G1 run DIFFERENT
 * code from the SAME repos, and a page written as prose for one robot is how the G1 ended up
 * with no instructions at all. One table per robot makes a missing entry visible, and lets a
 * test check that no G1 command names a Go2 binary (robotDeploy.test.ts).
 *
 * The naming rule this mirrors is the one in robot-splunk-docs/QUE-CORRE-EN-CADA-ROBOT.md:
 *   go2_*            runs only on the Go2
 *   g1_* / host/g1/  runs only on the G1
 *   no prefix        shared, the same file on both
 * ROBOT_MODEL (go2 by default, g1) picks the variant; everything after the binary is shared.
 */

export type RobotModel = "go2" | "g1";

/** running = installed and verified on the robot; pending = not there yet. */
export type ServiceState = "running" | "pending";

export interface RobotService {
  /** systemd unit name on the robot. */
  unit: string;
  /** Repo directory on the robot. */
  repo: string;
  /** What in the repo is specific to THIS robot — the binary or file that differs. */
  specific: string;
  state: ServiceState;
  /** Update after a pull. Empty for things that are not a git repo on the robot. */
  update: string[];
  note?: string;
}

export interface RobotDeploy {
  label: string;
  /** Where the commands run: the robot computer everything here is installed on. */
  host: string;
  ssh: string[];
  services: RobotService[];
  /** One-time setup, in order. Empty when the robot is already set up. */
  firstTime: { title: string; lines: string[]; note?: string }[];
}

export const REPO_TELEMETRY = "~/robot-telemetry-agent";
export const REPO_RELAY = "~/robot-command-relay";
export const REPO_VIDEO = "~/robot-video-pipeline";

const GIT = "https://github.com/Maxi-Andres";

export const NAMING_RULE: [string, string][] = [
  ["go2_*", "runs only on the Go2"],
  ["g1_* or host/g1/", "runs only on the G1"],
  ["no prefix", "shared — the same file runs on both"],
  ["*.g1.service", "the G1's unit, installed under the name WITHOUT .g1"],
];

export const DEPLOY: Record<RobotModel, RobotDeploy> = {
  go2: {
    label: "Go2",
    host: "the Go2's Jetson",
    ssh: [
      "ssh unitree@192.168.123.18      # robot on the local LAN",
      "ssh unitree@10.1.254.18         # robot in the field, via the IR1101 tunnel",
    ],
    services: [
      {
        unit: "robot-telemetry-agent",
        repo: REPO_TELEMETRY,
        specific: "go2_telemetry_reader (unitree_go IDL)",
        state: "running",
        update: [`cd ${REPO_TELEMETRY} && git pull && ./build.sh`,
                 "sudo systemctl restart robot-telemetry-agent"],
        note: "Renamed from telemetry_reader on 2026-09-30. The first pull after that builds " +
              "the new name; run.sh already points at it. The old binary is left unused.",
      },
      {
        unit: "robot-command-relay",
        repo: REPO_RELAY,
        specific: "go2_command_sender (go2::SportClient) on the shared sender_core.hpp",
        state: "running",
        update: [`cd ${REPO_RELAY} && git pull && ./build.sh`,
                 "sed -i '/^SENDER_BIN=/d' relay.env",
                 "sudo cp systemd/robot-command-relay.service /etc/systemd/system/",
                 "sudo systemctl daemon-reload && sudo systemctl restart robot-command-relay"],
        note: "The FIRST pull after 2026-10-01 needs all four lines: the sender was renamed " +
              "from command_sender, and the relay now refuses to start while SENDER_BIN still " +
              "names the old binary (the old relay.env and unit both pin it). After that, " +
              "pull + build + restart as usual.",
      },
      {
        unit: "robot-video",
        repo: REPO_VIDEO,
        specific: "videohub_jpeg_stream (shared with the G1) or go2_h264_stream (Go2-only " +
                  "multicast) — SRT to HQ :8891, mediamtx path `robot`",
        state: "running",
        update: [`cd ${REPO_VIDEO} && git pull && ./build.sh`,
                 "sudo systemctl restart robot-video"],
      },
    ],
    firstTime: [],
  },

  g1: {
    label: "G1",
    host: "the G1's PC2 (the Jetson). PC1 (.161) has no SSH and is never touched",
    ssh: [
      "ssh unitree@192.168.123.164     # cable plugged in",
      "ssh unitree@192.168.51.115      # over WiFi (ROBOTS ONLY, VLAN 51)",
    ],
    services: [
      {
        unit: "robot-telemetry-agent",
        repo: REPO_TELEMETRY,
        specific: "g1_telemetry_reader (unitree_hg IDL, 29 joints, rt/lf/bmsstate)",
        state: "running",
        update: [`cd ${REPO_TELEMETRY} && git pull && ./build.sh`,
                 "sudo systemctl restart robot-telemetry-agent"],
        note: "Index g1-robot-data, its own HEC token (g1-robot-telemetry).",
      },
      {
        unit: "uplink-failover",
        repo: REPO_RELAY,
        specific: "host/g1/uplink-failover.sh — cable when it works, WiFi when it does not",
        state: "running",
        update: [`cd ${REPO_RELAY} && git pull`,
                 "sudo install -m 755 host/g1/uplink-failover.sh /usr/local/sbin/",
                 "sudo systemctl restart uplink-failover"],
        note: "eth0 is the robot's internal bus and never loses carrier, so unplugging the " +
              "cable never fails over by itself. This probes the wired gateway instead.",
      },
      {
        unit: "robot-command-relay",
        repo: REPO_RELAY,
        specific: "g1_command_sender (g1::LocoClient) on the shared sender_core.hpp — " +
                  "verbs use the FSM ids measured on this robot",
        state: "pending",
        update: [`cd ${REPO_RELAY} && git pull && ./build.sh`,
                 "sudo systemctl restart robot-command-relay"],
        note: "No damp, no zero_torque, no SDK squat (it half-falls on this robot). Walk " +
              "follows the app's waist lock, declared as G1_WAIST_LOCK in relay.env: 1 = " +
              "locked, FSM 500; unset = free, FSM 501. The robot runs with it locked " +
              "(2026-10-01): add G1_WAIST_LOCK=1 on the first pull after that date. " +
              "Clamps 1.2 / 0.5 / 1.2 (MAX_* in relay.env). First-time step 6.",
      },
      {
        unit: "robot-video",
        repo: REPO_VIDEO,
        specific: "videohub_jpeg_stream (shared with the Go2) reading Unitree's videohub_pc4 " +
                  "— SRT to HQ :8893, mediamtx path `g1`",
        state: "running",
        update: [`cd ${REPO_VIDEO} && git pull && ./build.sh`,
                 "sudo systemctl restart robot-video"],
        note: "Unitree's videohub_pc4 owns the RealSense colour node, so the G1 reads the camera " +
              "through it, like the Go2 — never by opening /dev/video4. Config: " +
              "robot/video.g1.env.example (first-time step 5).",
      },
      {
        unit: "docker: g1-jetson-01",
        repo: "~/install-te-agent.sh",
        specific: "ThousandEyes agent, Docker host network (the Go2's is bridge)",
        state: "running",
        update: [],
        note: "Not a repo. Recreate with ./install-te-agent.sh --replace (asks for the " +
              "account GROUP token, not the API token).",
      },
    ],
    firstTime: [
      {
        title: "1. Unitree SDK with the G1 types",
        lines: [
          "git clone https://github.com/unitreerobotics/unitree_sdk2.git ~/unitree_sdk2",
          "cd ~/unitree_sdk2 && git checkout 63096d0",
        ],
        note: "Not the factory ~/unitree_sdk2-main: it has no unitree_hg IDL, so the G1 " +
              "reader does not compile against it. Leave that one alone.",
      },
      {
        title: "2. Replace the rsync copy with a clone (once the code is committed)",
        lines: [
          "mv ~/robot-telemetry-agent ~/robot-telemetry-agent.rsync-2026-09-30",
          `git clone ${GIT}/robot-telemetry-agent.git ${REPO_TELEMETRY}`,
          `git clone ${GIT}/robot-command-relay.git ${REPO_RELAY}`,
          `git clone ${GIT}/robot-video-pipeline.git ${REPO_VIDEO}`,
          `cd ${REPO_TELEMETRY} && ./build.sh`,
          "sudo systemctl restart robot-telemetry-agent",
        ],
        note: "Until this is done, git pull does not work on the G1: the telemetry agent there " +
              "is a copy made on 2026-09-30 before the code was committed.",
      },
      {
        title: "3. HEC token and the telemetry unit",
        lines: [
          "read -rs -p 'HEC token: ' T; echo; printf %s \"$T\" > ~/.splunk_hec_token",
          "chmod 600 ~/.splunk_hec_token",
          `sudo cp ${REPO_TELEMETRY}/systemd/robot-telemetry-agent.g1.service \\`,
          "        /etc/systemd/system/robot-telemetry-agent.service",
          "sudo systemctl daemon-reload && sudo systemctl enable --now robot-telemetry-agent",
        ],
        note: "Done on 2026-09-30. The .g1.service file is installed under the Go2's name on " +
              "purpose: every robot has ONE robot-telemetry-agent unit.",
      },
      {
        title: "4. Uplink failover",
        lines: [
          `cd ${REPO_RELAY}`,
          "sudo install -m 755 host/g1/uplink-failover.sh /usr/local/sbin/",
          "sudo cp host/g1/uplink-failover.service /etc/systemd/system/",
          "sudo systemctl daemon-reload && sudo systemctl enable --now uplink-failover",
        ],
        note: "Done on 2026-09-30 (from a copy in ~/uplink-failover; after the clone, reinstall " +
              "from the repo with these same lines).",
      },
      {
        title: "5. Video",
        lines: [
          `cd ${REPO_VIDEO} && ./build.sh`,
          "cp robot/video.g1.env.example robot/video.env",
          "sudo cp robot/robot-video.service /etc/systemd/system/",
          "sudo systemctl daemon-reload && sudo systemctl enable --now robot-video",
        ],
        note: "Same unit as the Go2: everything that differs lives in video.env. HQ needs " +
              "srt-bridge-g1 (:8893) and the `g1` path in mediamtx, both set up 2026-10-01.",
      },
      {
        title: "6. Command relay — with someone next to the robot",
        lines: [
          `cd ${REPO_RELAY} && ./build.sh`,
          "cp relay.g1.env.example relay.env",
          "read -rs -p 'G1 relay token: ' T; echo; printf %s \"$T\" > ~/.relay_token",
          "chmod 600 ~/.relay_token",
          "sudo cp systemd/robot-command-relay.g1.service \\",
          "        /etc/systemd/system/robot-command-relay.service",
          "sudo systemctl daemon-reload && sudo systemctl enable --now robot-command-relay",
        ],
        note: "Its OWN token, not the Go2's — the executor reads G1_RELAY_TOKEN first. On HQ, " +
              "set G1_TRANSPORT=relay and G1_RELAY_URL=http://192.168.51.115:8092 for the " +
              "executor. The first move: robot on its hanger, stand_up, walk_waist, then a " +
              "short move — stop_move ready.",
      },
    ],
  },
};

/** The robots this page knows how to deploy to; anything else falls back to the Go2. */
export function deployFor(robot: string): RobotDeploy {
  return robot === "g1" ? DEPLOY.g1 : DEPLOY.go2;
}

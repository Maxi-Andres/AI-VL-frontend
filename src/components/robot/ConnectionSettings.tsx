import { useCallback, useEffect, useState } from "react";
import {
  getRobotNet,
  getRobotTransport,
  setRobotNet,
  setRobotTransport,
  type RobotNet,
} from "../../api/backend";
import { useRobot } from "../layout/RobotContext";

/**
 * How this machine reaches the SELECTED robot: the online-check address, the command
 * transport (DDS or the relay on the robot) and the relay URL — all per robot. Lived in a
 * header popover ("Net") until 2026-10-01, mixed with the global DDS peer list below; it moved
 * to the Robot page because none of it is something you flip while driving.
 *
 * ADVANCED, collapsed: the DDS peer list.
 *
 * Only one field matters: the robot's IP. DDS discovery is multicast, and multicast is
 * link-local — a router never forwards it — so a robot on another subnet (e.g. moved
 * from its cable to its own wlan0 behind inter-VLAN routing) is invisible until it is
 * named here by IP, which switches discovery to unicast. Leave it empty on a flat wired
 * LAN and multicast handles it.
 *
 * The host interface stays whatever the machine uses to reach the robot's network (the
 * wired one, normally) — it is shown but rarely needs changing.
 *
 * Applying restarts the executor: CycloneDDS reads its config once per process, so
 * there is no way to re-point DDS in place.
 */
export function ConnectionSettings() {
  const [net, setNet] = useState<RobotNet | null>(null);
  const [ip, setIp] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const { robot } = useRobot();
  const [mode, setMode] = useState("dds");
  const [relayUrl, setRelayUrl] = useState("");
  const [robotInfo, setRobotInfo] = useState<{
    senderAlive?: boolean;
    online?: boolean;
  } | null>(null);
  const [pingIp, setPingIp] = useState("");

  // The transport is per robot, so re-read it whenever the selected robot changes.
  /** Status only — safe to call on a timer: it never touches the editable fields. */
  const loadStatus = useCallback((signal?: AbortSignal) => {
    getRobotTransport(signal)
      .then((t) => {
        if (signal?.aborted) return;
        const cur = t.transports?.[robot];
        if (cur) {
          setRobotInfo({
            senderAlive: cur.relay?.sender_alive,
            online: cur.online,
          });
        }
      })
      .catch(() => {});
  }, [robot]);

  /** Also fills the editable fields. Only on mount / robot change / after applying —
   * NEVER on the poll, or it overwrites what the user is typing mid-word. */
  const loadConfig = useCallback((signal?: AbortSignal) => {
    getRobotTransport(signal)
      .then((t) => {
        if (signal?.aborted) return;
        const cur = t.transports?.[robot];
        if (cur) {
          setMode(cur.mode || "dds");
          setRelayUrl(cur.url || "");
          setPingIp(cur.ping_ip || "");
        }
      })
      .catch(() => {});
  }, [robot]);

  useEffect(() => {
    // One controller for the effect's lifetime, so a robot switch cancels the previous
    // robot's in-flight reads. Without it a slow answer for the OLD robot could land after
    // the switch and repaint the fields with the wrong robot's transport.
    const ac = new AbortController();
    loadConfig(ac.signal);
    loadStatus(ac.signal);
    const t = setInterval(() => loadStatus(ac.signal), 6000);
    return () => {
      ac.abort();
      clearInterval(t);
    };
  }, [loadConfig, loadStatus]);

  // Saving the probe address does NOT restart the executor (nothing about the transport
  // changes), so no reload delay is needed here — unlike a mode or URL change.
  const savePingIp = () => {
    setRobotTransport({ robot, ping_ip: pingIp })
      .then((r) => {
        setMsg(r.ok ? `${robot}: address saved` : r.error || "invalid address");
        setTimeout(loadStatus, 1500);
      })
      .catch((e) => setMsg(String(e)));
  };

  const applyTransport = (nextMode: string, url: string) => {
    setBusy(true);
    setMsg("");
    setRobotTransport({ robot, mode: nextMode, url: url || undefined })
      .then((r) => {
        setMsg(r.ok
          ? `${robot}: ${nextMode} — executor restarting…`
          : r.error || "could not switch transport");
        if (r.ok) {
          setMode(nextMode);
          // The executor re-execs to apply this, so it is unreachable for a few seconds.
          // Re-read afterwards: without this the panel keeps showing the pre-change values
          // and looks like the switch was ignored.
          setTimeout(loadConfig, 6000);
          setTimeout(loadStatus, 6000);
          setTimeout(loadConfig, 14000);
          setTimeout(loadStatus, 14000);
        }
      })
      .catch((e) => setMsg(String(e)))
      .finally(() => setBusy(false));
  };

  const load = () =>
    getRobotNet()
      .then((n) => {
        setNet(n);
        setIp((n.peers ?? []).join(", "));
      })
      .catch(() => setNet({ ok: false, error: "executor unreachable" }));

  useEffect(() => {
    load();
  }, []);

  const apply = async () => {
    const peers = ip.split(/[,\s]+/).filter(Boolean);
    setBusy(true);
    setMsg("");
    try {
      const res = await setRobotNet(peers);
      if (res.ok) {
        setMsg(
          peers.length
            ? `Unicast to ${peers.join(", ")}. Executor restarting…`
            : "Back to multicast. Executor restarting…",
        );
        // It is down for a moment while it re-execs; re-read once it is back.
        window.setTimeout(load, 6000);
      } else {
        setMsg(res.error ?? "could not apply");
      }
    } catch {
      setMsg("could not reach the gateway");
    } finally {
      setBusy(false);
    }
  };

  const field =
    "w-full rounded-md border border-line bg-bg px-1.5 py-1 text-xs text-fg focus:border-accent focus:outline-none";

  return (
    <div className="max-w-md space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            robotInfo?.online ? "bg-emerald-500" : "bg-zinc-600"
          }`}
        />
        <span className={robotInfo?.online ? "text-emerald-500" : "text-muted"}>
          {robot}: {pingIp ? (robotInfo?.online ? "online" : "offline") : "no address set"}
        </span>
        {mode === "relay" && robotInfo?.senderAlive === false && (
          <span className="text-amber-500">· relay up, sender down</span>
        )}
      </div>

      <label className="block text-[11px] text-muted">
        Command transport
        <select
          value={mode}
          disabled={busy}
          onChange={(e) => applyTransport(e.target.value, relayUrl)}
          className={field}
        >
          <option value="relay">Relay on the robot — any network</option>
          <option value="dds">DDS from this machine — same subnet only</option>
        </select>
        <span className="mt-0.5 block text-[10px] leading-tight text-muted/70">
          {mode === "relay"
            ? "Commands go over HTTP to the relay on the robot, which publishes DDS there."
            : "Commands are published as DDS from this machine — only while the robot shares its subnet."}
        </span>
      </label>

      {mode === "relay" && (
        <label className="block text-[11px] text-muted">
          Relay URL
          <input
            value={relayUrl}
            onChange={(e) => setRelayUrl(e.target.value)}
            onBlur={() => relayUrl && applyTransport("relay", relayUrl)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && relayUrl) applyTransport("relay", relayUrl);
            }}
            placeholder={robot === "g1" ? "http://192.168.51.115:8092" : "http://10.1.254.18:8092"}
            title="Applies on Enter or when the field loses focus"
            spellCheck={false}
            className={field}
          />
        </label>
      )}

      <label className="block text-[11px] text-muted">
        Online check address
        <input
          value={pingIp}
          onChange={(e) => setPingIp(e.target.value)}
          onBlur={savePingIp}
          onKeyDown={(e) => {
            if (e.key === "Enter") savePingIp();
          }}
          placeholder={robot === "g1" ? "192.168.51.115" : "10.1.254.18"}
          spellCheck={false}
          className={field}
        />
        <span className="mt-0.5 block text-[10px] leading-tight text-muted/70">
          Pinged from the server ONLY to light the online dot — it does not affect commands or
          video. Empty = no check.
        </span>
      </label>

      {msg && <p className="m-0 text-[11px] leading-tight text-accent">{msg}</p>}

      <details className="rounded-md border border-line p-2">
        <summary className="cursor-pointer text-[11px] text-muted">
          Advanced — DDS discovery peers (all robots, same-subnet DDS only)
        </summary>
        <div className="mt-2 space-y-2">
          <label className="block text-[11px] text-muted">
            Robot IP(s), comma-separated — empty = multicast
            <input
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              placeholder="192.168.123.161"
              spellCheck={false}
              className={field}
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={apply}
            className="rounded-md border border-line px-2 py-1 text-[11px] text-fg transition duration-100 hover:border-accent active:scale-95 disabled:opacity-50 disabled:active:scale-100"
          >
            {busy ? "Applying…" : "Apply + restart executor"}
          </button>
          <p className="m-0 text-[10px] leading-tight text-muted">
            {net?.error
              ? net.error
              : `Interface ${net?.iface ?? "?"} · discovery ${net?.discovery ?? "?"}`}
            . Only for DDS from this machine with the robot on ANOTHER subnet of the same site:
            discovery is multicast and multicast does not cross a router. Not used with the relay.
          </p>
        </div>
      </details>
    </div>
  );
}

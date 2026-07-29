import { useEffect, useState } from "react";
import { getRobotNet, setRobotNet, type RobotNet } from "../../api/backend";

/**
 * Header control for WHERE THE ROBOT IS ON THE NETWORK.
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
export function NetworkControls() {
  const [net, setNet] = useState<RobotNet | null>(null);
  const [ip, setIp] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

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

  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-md border border-line px-2 py-1 text-xs text-muted hover:text-fg">
        Net
      </summary>
      <div className="absolute right-0 z-30 mt-1 w-60 space-y-2 rounded-md border border-line bg-panel p-2.5 shadow-lg">
        <label className="block text-[11px] text-muted">
          Robot IP (empty = same subnet)
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder="192.168.51.115"
            spellCheck={false}
            className="w-full rounded-md border border-line bg-bg px-1.5 py-1 text-xs text-fg focus:border-accent focus:outline-none"
          />
        </label>

        <button
          type="button"
          disabled={busy}
          onClick={apply}
          className="w-full rounded-md border border-line px-2 py-1 text-[11px] text-fg hover:border-accent disabled:opacity-50"
        >
          {busy ? "Applying…" : "Apply + restart executor"}
        </button>

        {msg && <p className="m-0 text-[10px] leading-tight text-accent">{msg}</p>}

        <p className="m-0 text-[10px] leading-tight text-muted">
          {net?.error
            ? net.error
            : `Interface ${net?.iface ?? "?"} · discovery ${net?.discovery ?? "?"}`}
        </p>
        <p className="m-0 text-[10px] leading-tight text-muted">
          Needed only when the robot is on another subnet: DDS discovery is multicast and
          multicast does not cross a router. Several IPs: separate with commas.
        </p>
      </div>
    </details>
  );
}

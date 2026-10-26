import { IconChevronDown, IconServer2 } from "@tabler/icons-react";
import { usePresence } from "../../hooks/usePresence";
import { DropMenu, useDropdown } from "../ui/DropMenu";
import { StatusBadge } from "./StatusBadge";
import { PILL, systemRows } from "./systemRows";

const DOT = { good: "bg-good-fg", warn: "bg-warn-fg", bad: "bg-bad-fg", idle: "bg-dim" };
const RING = { good: "shadow-[0_0_0_3px_var(--color-good-bg)]", warn: "shadow-[0_0_0_3px_var(--color-warn-bg)]", bad: "shadow-[0_0_0_3px_var(--color-bad-bg)]", idle: "" };

/** "3 of 4 services": the header's one-glance health, and the detail on click. */
export function SystemStatus({ connected }: { connected: boolean }) {
  const { presence, reachable } = usePresence();
  const { open, setOpen, ref } = useDropdown();
  const rows = presence && reachable ? systemRows(presence) : [];
  const services = rows.filter((r) => r.service);
  const up = services.filter((r) => r.tone === "good").length;
  const tone = !reachable ? "bad" : !presence ? "idle" : services.some((r) => r.tone === "bad") ? "bad"
    : up === services.length ? "good" : "warn";

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="System status"
        className="flex cursor-pointer items-center gap-2 rounded-[10px] border border-line bg-panel px-3 py-[7px] text-[12.5px] font-bold transition hover:shadow-card">
        <span className={`size-2 rounded-full ${DOT[tone]} ${RING[tone]}`} />
        {/* On a phone the dot alone says it; the words need the room the tabs use. */}
        <span className="hidden lg:inline">
          {!reachable ? "Server offline" : presence ? `${up} of ${services.length} services` : "Checking…"}
        </span>
        <IconChevronDown size={14} className="hidden text-dim lg:block" />
      </button>
      <DropMenu open={open} className="top-[46px] w-[300px]">
        <div className="mb-1 flex items-center gap-2 border-b border-line px-2.5 pt-2 pb-2.5">
          <IconServer2 size={16} className="text-muted" />
          <b className="text-[13.5px]">System status</b>
        </div>
        {!reachable && <p className="m-0 px-2.5 py-2 text-[13px] text-muted">This server does not answer.</p>}
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2.5 px-2.5 py-2 text-[13px] font-semibold" title={r.detail}>
            <r.icon size={17} className={r.tone === "good" ? "text-good-fg" : r.tone === "bad" ? "text-bad-fg" : r.tone === "warn" ? "text-warn-fg" : "text-muted"} />
            {r.label}
            <span className={`ml-auto rounded-full px-2 py-0.5 text-[11.5px] font-bold ${PILL[r.tone]}`}>{r.state}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center gap-2.5 border-t border-line px-2.5 pt-2.5 pb-1.5 text-[13px] font-semibold">
          This browser
          <span className="ml-auto"><StatusBadge connected={connected} /></span>
        </div>
      </DropMenu>
    </div>
  );
}

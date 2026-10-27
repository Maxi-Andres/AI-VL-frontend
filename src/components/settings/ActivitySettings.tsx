import { useEffect, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconLoader2 } from "@tabler/icons-react";
import { getActivity } from "../../api/fleet";
import type { ActivityKind, ActivityPage } from "../../api/fleet";
import { ActivityRow } from "../fleet/ActivityFeed";
import { Segmented } from "../ui/Segmented";

// Settings → Activity: everything notable that changed in the company, newest first, in
// numbered pages — the server counts the total, so this holds whether the log has 40 events
// or 400,000 (Fleet shows the latest five and links here). Admins: the log names people.

const PAGE = 25;

const KINDS: { id: ActivityKind | null; label: string }[] = [
  { id: null, label: "All" },
  { id: "robots", label: "Robots" },
  { id: "sites", label: "Sites" },
  { id: "people", label: "People" },
  { id: "access", label: "Access" },
];

/** Page numbers to show: the first, the last, and a window around the current one. */
function pages(current: number, count: number): (number | "gap")[] {
  const keep = new Set([1, count, current - 1, current, current + 1].filter((n) => n >= 1 && n <= count));
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - prev > 1) out.push("gap");
    out.push(n);
    prev = n;
  }
  return out;
}

export function ActivitySettings() {
  const [kind, setKind] = useState<ActivityKind | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ActivityPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    setBusy(true);
    getActivity(ctl.signal, { limit: PAGE, offset: (page - 1) * PAGE, kind })
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => !ctl.signal.aborted && setError(e instanceof Error ? e.message : "Could not load the activity."))
      .finally(() => !ctl.signal.aborted && setBusy(false));
    return () => ctl.abort();
  }, [kind, page]);

  const count = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  const from = data && data.total ? (page - 1) * PAGE + 1 : 0;
  const to = data ? Math.min(page * PAGE, data.total) : 0;
  const pick = (k: ActivityKind | null) => {
    setKind(k);
    setPage(1);
  };
  // A new page starts at its top, not wherever the last one was scrolled to.
  const goTo = (n: number) => {
    setPage(n);
    document.getElementById("activity")?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const btn = "grid h-8 min-w-8 cursor-pointer place-items-center rounded-lg px-2 text-[13px] font-bold transition disabled:cursor-default disabled:opacity-40";

  return (
    <section id="activity" data-nav="Activity" className="scroll-mt-4">
      <h2 className="m-0 mb-1 text-lg font-extrabold tracking-[-0.015em]">Activity</h2>
      <p className="m-0 mb-3.5 text-[13px] text-muted">
        Who changed what: robots, sites, the team, access. Sign-ins are recorded but left out of
        this list.
      </p>
      <div className="rounded-2xl border border-line bg-panel shadow-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <Segmented className="flex rounded-lg bg-subtle p-0.5">
            {KINDS.map((k) => (
              <button key={k.label} type="button" onClick={() => pick(k.id)} aria-pressed={kind === k.id} data-on={kind === k.id}
                className={`cursor-pointer rounded-md px-2.5 py-1 text-xs font-bold transition-colors ${
                  kind === k.id ? "text-fg" : "text-muted hover:text-fg"}`}>
                {k.label}
              </button>
            ))}
          </Segmented>
          <span className="ml-auto flex items-center gap-2 text-xs text-muted">
            {busy && <IconLoader2 size={14} className="animate-spin" />}
            {data && (data.total ? `${from.toLocaleString()}–${to.toLocaleString()} of ${data.total.toLocaleString()}` : "")}
          </span>
        </div>
        {error && <p role="alert" className="m-0 px-5 pt-3 text-[13px] text-danger">{error}</p>}
        {data === null ? (
          <p className="m-0 px-5 py-8 text-center text-muted"><IconLoader2 size={18} className="inline animate-spin" /></p>
        ) : data.events.length ? (
          <ul className={`m-0 list-none px-5 py-1 transition-opacity ${busy ? "opacity-60" : ""}`}>
            {data.events.map((ev) => <ActivityRow key={ev.id} ev={ev} />)}
          </ul>
        ) : (
          <p className="m-0 px-5 py-8 text-center text-sm text-muted">Nothing here yet.</p>
        )}
        {count > 1 && (
          <nav aria-label="Activity pages" className="flex items-center justify-center gap-1 border-t border-line px-4 py-3">
            <button type="button" disabled={page === 1} onClick={() => goTo(page - 1)} aria-label="Newer"
              className={`${btn} text-muted hover:bg-subtle hover:text-fg`}>
              <IconChevronLeft size={16} />
            </button>
            {pages(page, count).map((n, i) =>
              n === "gap" ? (
                <span key={`gap-${i}`} className="px-1 text-dim">…</span>
              ) : (
                <button key={n} type="button" onClick={() => goTo(n)} aria-current={n === page ? "page" : undefined}
                  className={`${btn} ${n === page ? "bg-fg text-bg" : "text-muted hover:bg-subtle hover:text-fg"}`}>
                  {n}
                </button>
              ),
            )}
            <button type="button" disabled={page === count} onClick={() => goTo(page + 1)} aria-label="Older"
              className={`${btn} text-muted hover:bg-subtle hover:text-fg`}>
              <IconChevronRight size={16} />
            </button>
          </nav>
        )}
      </div>
    </section>
  );
}

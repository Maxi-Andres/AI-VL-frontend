import { useCallback, useEffect, useState } from "react";
import { IconLoader2 } from "@tabler/icons-react";
import { getActivity } from "../../api/fleet";
import type { ActivityEvent } from "../../api/fleet";
import { ActivityRow } from "../fleet/ActivityFeed";

// Settings → Activity: everything notable that changed in the company, newest first, a page at
// a time (Fleet shows the latest five and links here). Admins: the log names people.

const PAGE = 30;

export function ActivitySettings() {
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (offset: number, signal?: AbortSignal) => {
    setBusy(true);
    try {
      const page = await getActivity(signal, { limit: PAGE, offset });
      setEvents((prev) => (offset ? [...(prev ?? []), ...page] : page));
      setMore(page.length === PAGE);
      setError(null);
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "Could not load the activity.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    void load(0, ctl.signal);
    return () => ctl.abort();
  }, [load]);

  return (
    <section id="activity" data-nav="Activity" className="scroll-mt-4">
      <h2 className="m-0 mb-1 text-lg font-extrabold tracking-[-0.015em]">Activity</h2>
      <p className="m-0 mb-3.5 text-[13px] text-muted">
        Who changed what: sites, robots, the team, access. Sign-ins are recorded but left out of
        this list.
      </p>
      <div className="rounded-2xl border border-line bg-panel shadow-card">
        {events === null ? (
          <p className="m-0 px-5 py-8 text-center text-muted">
            {error ?? <IconLoader2 size={18} className="inline animate-spin" />}
          </p>
        ) : events.length ? (
          <ul className="m-0 list-none px-5 py-1">
            {events.map((ev) => <ActivityRow key={ev.id} ev={ev} />)}
          </ul>
        ) : (
          <p className="m-0 px-5 py-8 text-center text-sm text-muted">Nothing yet.</p>
        )}
        {(more || (events && error)) && (
          <div className="border-t border-line px-5 py-3 text-center">
            {error && events && <p role="alert" className="m-0 mb-2 text-[13px] text-danger">{error}</p>}
            <button type="button" disabled={busy} onClick={() => void load(events?.length ?? 0)}
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3.5 py-1.5 text-[13px] font-bold transition hover:bg-subtle disabled:opacity-50">
              {busy && <IconLoader2 size={14} className="animate-spin" />}
              Show older
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

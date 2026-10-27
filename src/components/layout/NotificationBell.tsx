import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { IconBell, IconBellCheck } from "@tabler/icons-react";
import { getNotifications, markNotificationsSeen } from "../../api/fleet";
import type { Notifications } from "../../api/fleet";
import { useCan } from "../../auth/permissions";
import { ActivityRow } from "../fleet/ActivityFeed";
import { DropMenu, useDropdown } from "../ui/DropMenu";
import { useT } from "../../i18n";

const POLL_MS = 30_000;

/**
 * The bell: what happened that concerns you — a robot dropped or came back for everyone; the
 * company's changes too for those who may read the activity log (the server decides, see
 * fleet.py). Never your own doings. Opening it marks them read; the ones that were new keep
 * their highlight until it closes, so you can tell which they were.
 */
export function NotificationBell() {
  const t = useT();
  const can = useCan();
  const { open, setOpen, ref } = useDropdown();
  const [data, setData] = useState<Notifications | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setData(await getNotifications(signal));
    } catch {
      /* a missed poll keeps the last list: one failed request says nothing about the news */
    }
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    void load(ctl.signal);
    const timer = window.setInterval(() => void load(ctl.signal), POLL_MS);
    return () => {
      ctl.abort();
      window.clearInterval(timer);
    };
  }, [load]);

  const toggle = () => {
    const opening = !open;
    setOpen(opening);
    if (opening && data?.unread) {
      void markNotificationsSeen().catch(() => undefined);
      setData({ ...data, unread: 0 });
    }
    if (!opening) void load();
  };
  const unread = data?.unread ?? 0;

  return (
    <div ref={ref} className="relative">
      <button onClick={toggle} aria-expanded={open} aria-label={unread ? t("Notifications, {n} new", { n: unread }) : t("Notifications")}
        className="relative grid size-9 cursor-pointer place-items-center rounded-[10px] border border-line bg-panel text-muted transition hover:text-fg hover:shadow-card">
        <IconBell size={18} />
        {unread > 0 && <span className="absolute top-[7px] right-[8px] size-[9px] rounded-full border-2 border-panel bg-bad-fg" />}
      </button>
      <DropMenu open={open} className="top-[46px] w-[360px]">
        <div className="flex items-center gap-2 border-b border-line px-2.5 pt-2 pb-2.5">
          <b className="text-[13.5px]">{t("Notifications")}</b>
          {can("configure") && (
            <Link to="/settings#activity" onClick={() => setOpen(false)} className="ml-auto text-xs font-bold text-accent hover:underline">
              {t("View all activity")}
            </Link>
          )}
        </div>
        {data?.events.length ? (
          <ul className="m-0 max-h-[380px] list-none overflow-y-auto px-3.5">
            {data.events.map((ev) => <ActivityRow key={ev.id} ev={ev} unread={ev.unread} />)}
          </ul>
        ) : (
          <div className="grid place-items-center px-6 py-8 text-center text-[13px] text-muted">
            <IconBellCheck size={26} className="mb-2 text-dim" />
            {t("You are all caught up.")}
          </div>
        )}
      </DropMenu>
    </div>
  );
}

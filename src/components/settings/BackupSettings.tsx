import { useCallback, useEffect, useState } from "react";
import { IconCheck, IconDatabase, IconFolder, IconLoader2 } from "@tabler/icons-react";
import { backUpNow, getBackups } from "../../api/backups";
import type { Backups } from "../../api/backups";
import { ago } from "../fleet/ActivityFeed";
import { msg, useT } from "../../i18n";
import { rich } from "../../i18n/rich";

// Settings → Backups (owners): a dated copy of everything Pilot keeps — accounts, the team,
// sites, robots, conversations, the activity log, floor plans — made every day on the server.

function size(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function BackupSettings() {
  const t = useT();
  const [data, setData] = useState<Backups | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // Kept in English and translated where shown: the load runs in a hook that must not depend
  // on the language. A message from the server has no entry and passes through unchanged.
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setData(await getBackups(signal));
      setError(null);
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : msg("Could not read the backups."));
    }
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    void load(ctl.signal);
    return () => ctl.abort();
  }, [load]);

  async function now() {
    setBusy(true);
    setError(null);
    try {
      await backUpNow();
      await load();
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("The backup failed."));
    } finally {
      setBusy(false);
    }
  }

  const last = data?.backups[0];
  // Whole sentences, one per schedule: the clause about how often is not glued onto the rest.
  const about = !data
    ? t("A copy of everything Pilot keeps — accounts, the team, sites and robots, conversations, the activity log and floor plans.")
    : data.every_hours <= 0
      ? t("A copy of everything Pilot keeps — accounts, the team, sites and robots, conversations, the activity log and floor plans, made every time you press the button (automatic backups are off); the last {keep} are kept.", { keep: data.keep })
      : data.every_hours === 24
        ? t("A copy of everything Pilot keeps — accounts, the team, sites and robots, conversations, the activity log and floor plans, made every day; the last {keep} are kept.", { keep: data.keep })
        : t("A copy of everything Pilot keeps — accounts, the team, sites and robots, conversations, the activity log and floor plans, made every {hours} h; the last {keep} are kept.", { hours: data.every_hours, keep: data.keep });
  return (
    <section id="backups" data-nav={msg("Backups")} className="scroll-mt-4">
      <div className="mb-1 flex items-center gap-3">
        <h2 className="m-0 text-lg font-extrabold tracking-[-0.015em]">{t("Backups")}</h2>
        <button type="button" onClick={() => void now()} disabled={busy || !data}
          className="ml-auto flex cursor-pointer items-center gap-2 rounded-xl border border-line bg-panel px-3.5 py-2 text-[13px] font-bold transition hover:bg-subtle active:scale-95 disabled:opacity-50">
          {busy ? <IconLoader2 size={16} className="animate-spin" /> : done ? <IconCheck size={16} className="text-good-fg" /> : <IconDatabase size={16} />}
          {busy ? t("Backing up…") : done ? t("Done") : t("Back up now")}
        </button>
      </div>
      <p className="m-0 mb-3.5 text-[13px] text-muted">{about}</p>
      {error && <p role="alert" className="m-0 mb-3 text-[13px] text-danger">{t(error)}</p>}
      {data && (
        <div className="rounded-2xl border border-line bg-panel shadow-card">
          <div className={`flex items-center gap-3 border-b border-line px-5 py-3.5 ${last ? "" : "bg-warn-bg"}`}>
            <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${last ? "bg-good-bg text-good-fg" : "bg-panel text-warn-fg"}`}>
              <IconDatabase size={18} />
            </span>
            <div className="min-w-0 flex-1 text-[13px]">
              <b className="block">{last ? t("Last backup {when}", { when: ago(last.at) }) : t("No backup yet")}</b>
              <span className="flex items-center gap-1 truncate text-xs text-muted" title={data.dir}>
                <IconFolder size={13} className="shrink-0" /><span className="truncate font-mono">{data.dir}</span>
              </span>
            </div>
          </div>
          {data.backups.length > 0 && (
            <ul className="m-0 list-none px-5 py-1">
              {data.backups.map((b) => (
                <li key={b.name} className="flex items-center gap-3 border-b border-line py-2.5 text-[13px] last:border-0">
                  <b className="font-mono">{b.name}</b>
                  <span className="text-muted">{new Date(b.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span className="ml-auto font-mono text-xs text-dim">{size(b.size)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="m-0 border-t border-line px-5 py-3 text-xs text-muted">
            {rich(t("The folder is on this server's own disk. To survive a broken disk, set {var} to another disk or a network share. To restore: stop Pilot and copy a day's files back into the data folder."),
              { var: <code className="font-mono">PILOT_BACKUP_DIR</code> })}
          </p>
        </div>
      )}
    </section>
  );
}

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { IconBrain, IconLoader2, IconNotes, IconPhoto, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import { addNote, deleteMemory, listMemory, memoryImageUrl } from "../api/memory";
import type { MemoryItem, RobotMemory } from "../api/memory";
import { useCan } from "../auth/permissions";
import { useRobot } from "../components/layout/RobotContext";
import { Segmented } from "../components/ui/Segmented";
import { useLanguage, useT } from "../i18n";

type Show = "all" | "image" | "note";

/** What the selected robot was asked to keep: pictures ("guardá esta imagen") and notes
 * ("acordate que…"), newest first. A picture kept for what it shows ("acordate de la medida")
 * carries the fact read off it as its caption. The whole team sees them; operators add notes and delete.
 * The robot in the header decides whose memory this is. */
export function MemoryPage() {
  const t = useT();
  const lang = useLanguage();
  const can = useCan();
  const { robot } = useRobot();
  const [memory, setMemory] = useState<RobotMemory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<Show>("all");
  const [open, setOpen] = useState<MemoryItem | null>(null);
  const editable = can("analyze");

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setMemory(await listMemory(robot, signal));
      setError(null);
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : String(e));
    }
  }, [robot]);

  useEffect(() => {
    const ctl = new AbortController();
    setMemory(null);
    void load(ctl.signal);
    return () => ctl.abort();
  }, [load]);

  const items = (memory?.items ?? []).filter((m) => show === "all" || m.kind === show);
  const pictures = items.filter((m) => m.kind === "image");
  const notes = items.filter((m) => m.kind === "note");
  const when = (iso: string) =>
    new Date(iso).toLocaleString(lang === "es" ? "es-AR" : "en-US", { dateStyle: "medium", timeStyle: "short" });
  const remove = async (id: string) => {
    try {
      await deleteMemory(id);
      setOpen(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-7 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="animate-rise">
          <h1 className="m-0 flex items-center gap-2 text-[26px] font-extrabold tracking-[-0.025em]">
            <IconBrain size={26} className="text-accent" />
            {memory?.robot ? t("{robot}'s memory", { robot: memory.robot.name }) : t("Memory")}
          </h1>
          <p className="m-0 mt-1 text-muted">
            {t("Say “save this picture” or “remember that…” to the robot, and it keeps it here.")}
          </p>
        </div>
        <Segmented className="ml-auto flex rounded-xl bg-subtle p-1">
          {([["all", t("All")], ["image", t("Pictures")], ["note", t("Notes")]] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setShow(v)} data-on={show === v}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-bold transition-colors ${show === v ? "text-fg" : "text-muted"}`}>
              {label}
            </button>
          ))}
        </Segmented>
      </div>

      {error && <p role="alert" className="mb-4 text-sm font-semibold text-bad-fg">{error}</p>}

      {memory === null && !error ? (
        <div className="grid place-items-center py-20 text-muted"><IconLoader2 className="animate-spin" /></div>
      ) : memory && !memory.robot ? (
        <Empty text={t("This robot is not in your fleet yet. Add it on the Fleet page to give it a memory.")} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0">
            <h2 className="m-0 mb-3 flex items-center gap-2 text-sm font-bold text-muted">
              <IconPhoto size={17} />{t("Pictures")} <span className="font-semibold text-dim">{pictures.length}</span>
            </h2>
            {pictures.length === 0 ? (
              <Empty text={t("No pictures yet. Ask the robot “save this picture” while it looks at something.")} />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
                {pictures.map((m) => (
                  <button key={m.id} type="button" onClick={() => setOpen(m)}
                    className="group cursor-pointer overflow-hidden rounded-2xl border border-line bg-panel text-left shadow-card transition hover:border-accent">
                    <img src={memoryImageUrl(m.id)} alt={t("Picture saved on {date}", { date: when(m.created_at) })}
                      loading="lazy" className="aspect-video w-full bg-subtle object-cover" />
                    {m.text && <span className="line-clamp-2 block px-3 pt-2 text-[13px] text-fg">{m.text}</span>}
                    <span className="block px-3 py-2 text-[12px] text-muted">
                      {when(m.created_at)}{m.created_by && ` · ${m.created_by}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="min-w-0">
            <h2 className="m-0 mb-3 flex items-center gap-2 text-sm font-bold text-muted">
              <IconNotes size={17} />{t("Notes")} <span className="font-semibold text-dim">{notes.length}</span>
            </h2>
            {editable && memory?.robot && <NoteForm robot={robot} onAdded={() => void load()} />}
            {notes.length === 0 ? (
              <Empty text={t("No notes yet. Tell the robot “remember that the key is in the drawer”.")} />
            ) : (
              <ul className="m-0 grid list-none gap-2 p-0">
                {notes.map((m) => (
                  <li key={m.id} className="flex items-start gap-3 rounded-2xl border border-line bg-panel px-4 py-3 shadow-card">
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-[14px] [overflow-wrap:anywhere]">{m.text}</p>
                      <p className="m-0 mt-1 text-[12px] text-dim">{when(m.created_at)}{m.created_by && ` · ${m.created_by}`}</p>
                    </div>
                    {editable && <DeleteButton onDelete={() => remove(m.id)} />}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && setOpen(null)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(null)}>
          <figure role="dialog" aria-modal="true" aria-label={t("Picture")}
            className="m-0 grid max-h-full w-full max-w-5xl animate-rise gap-3 rounded-2xl border border-line bg-panel p-3 shadow-2xl">
            <img src={memoryImageUrl(open.id)} alt="" className="max-h-[75vh] w-full rounded-xl object-contain" />
            <figcaption className="flex items-center gap-3 px-1 text-[13px] text-muted">
              <span className="min-w-0">
                {open.text && <span className="block text-[14px] text-fg [overflow-wrap:anywhere]">{open.text}</span>}
                {when(open.created_at)}{open.created_by && ` · ${open.created_by}`}
              </span>
              {editable && <DeleteButton onDelete={() => remove(open.id)} />}
              <button type="button" onClick={() => setOpen(null)} aria-label={t("Close")} autoFocus
                className="ml-auto grid size-8 cursor-pointer place-items-center rounded-lg text-muted hover:bg-subtle hover:text-fg">
                <IconX size={18} />
              </button>
            </figcaption>
          </figure>
        </div>
      )}
    </main>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="m-0 rounded-2xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-muted">{text}</p>;
}

/** Two clicks: the bin, then "Delete?" — a memory is gone for the whole team. */
function DeleteButton({ onDelete }: { onDelete: () => Promise<void> }) {
  const t = useT();
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!sure) {
    return (
      <button type="button" onClick={() => setSure(true)} aria-label={t("Delete")} title={t("Delete")}
        className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-muted hover:bg-subtle hover:text-bad-fg">
        <IconTrash size={16} />
      </button>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button type="button" disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onDelete();
          setBusy(false);
          setSure(false);
        }}
        className="cursor-pointer rounded-lg bg-bad-bg px-2.5 py-1 text-[12px] font-bold text-bad-fg disabled:opacity-60">
        {t("Delete?")}
      </button>
      <button type="button" onClick={() => setSure(false)} aria-label={t("Cancel")}
        className="grid size-7 cursor-pointer place-items-center rounded-lg text-muted hover:text-fg">
        <IconX size={14} />
      </button>
    </span>
  );
}

function NoteForm({ robot, onAdded }: { robot: string; onAdded: () => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await addNote(robot, text.trim());
      setText("");
      setError(null);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="mb-3">
      <div className="flex gap-2 rounded-2xl border border-line bg-panel p-1.5 shadow-card focus-within:border-accent">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500}
          placeholder={t("Something for the robot to remember…")} aria-label={t("New note")}
          className="min-w-0 flex-1 bg-transparent px-2.5 text-[14px] text-fg outline-none placeholder:text-dim" />
        <button type="submit" disabled={busy || !text.trim()}
          className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-fg px-3 py-2 text-[13px] font-bold text-bg disabled:cursor-default disabled:opacity-40">
          {busy ? <IconLoader2 size={15} className="animate-spin" /> : <IconPlus size={15} />}{t("Add")}
        </button>
      </div>
      {error && <p role="alert" className="m-0 mt-1.5 text-[12px] font-semibold text-bad-fg">{error}</p>}
    </form>
  );
}

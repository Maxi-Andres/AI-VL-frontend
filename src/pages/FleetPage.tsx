import { useCallback, useEffect, useMemo, useState } from "react";
import type { ButtonHTMLAttributes, FormEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconBone,
  IconBuildingWarehouse,
  IconCheck,
  IconClock,
  IconMapPin,
  IconPencil,
  IconPhotoUp,
  IconPlus,
  IconRobot,
  IconSteeringWheel,
  IconTrash,
  IconVideo,
  IconX,
} from "@tabler/icons-react";
import {
  deletePlan,
  deleteRobot,
  deleteSite,
  getFleet,
  planUrl,
  saveRobot,
  saveSite,
  uploadPlan,
} from "../api/fleet";
import type { Fleet, FleetRobot, Site } from "../api/fleet";
import { getTeam } from "../api/team";
import { useMe } from "../auth/AuthContext";
import { useCan } from "../auth/permissions";
import { usePresence } from "../hooks/usePresence";
import { useRobotTransports } from "../hooks/useRobotTransports";
import { BatteryPill, robotState } from "../components/layout/PresencePills";
import { useRobot } from "../components/layout/RobotContext";
import { Pill } from "../components/ui/Pill";
import { SiteMap } from "../components/fleet/SiteMap";

// Fleet: the company's sites and the robots at each, with each robot's live state (the same
// ping and battery the header pills use). Admins build it here — add sites (location, floor
// plan) and register robots. Theme tokens only, like Team: right in today's dark theme and in
// the light one to come.

function greeting(name: string): string {
  const h = new Date().getHours();
  const part = h < 12 ? "morning" : h < 19 ? "afternoon" : "evening";
  return `Good ${part}, ${name.split(" ")[0]}`;
}

function siteTime(tz: string, now: Date): string {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(now);
  } catch {
    return "";
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

const MODEL_ICON: Record<string, typeof IconRobot> = { go2: IconBone, g1: IconRobot };

export function FleetPage() {
  const me = useMe();
  const can = useCan();
  const mayConfigure = can("configure");
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [teamSize, setTeamSize] = useState<number | null>(null);
  const [editingSite, setEditingSite] = useState<Site | "new" | null>(null);
  const [editingRobot, setEditingRobot] = useState<{ robot: FleetRobot | null; siteId: string | null } | null>(null);
  const [planVersion, setPlanVersion] = useState(() => Date.now());
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setFleet(await getFleet(signal));
    } catch (e) {
      if (!signal?.aborted) setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    void load(ctl.signal);
    if (can("manage_users")) {
      getTeam(ctl.signal)
        .then((t) => setTeamSize(t.members.length + t.invitations.length))
        .catch(() => undefined);
    }
    const tick = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      ctl.abort();
      window.clearInterval(tick);
    };
  }, [load, can]);

  const unassigned = useMemo(() => fleet?.robots.filter((r) => !r.site_id) ?? [], [fleet]);

  const steps = fleet && mayConfigure ? [
    { done: fleet.sites.length > 0, label: "Add your first site", hint: "Where your robots work: a name, its location and a floor plan.", action: () => setEditingSite("new") },
    { done: fleet.robots.length > 0, label: "Register your robots", hint: "Give each robot a name and the site it works at.", action: () => setEditingRobot({ robot: null, siteId: fleet.sites[0]?.id ?? null }) },
    ...(teamSize !== null ? [{ done: teamSize > 1, label: "Invite your team", hint: "Operators drive, viewers watch. Each with their own account.", action: () => undefined, href: "/team" }] : []),
  ] : [];
  const onboarding = steps.length > 0 && steps.some((s) => !s.done);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="m-0 text-2xl font-semibold tracking-tight text-fg">{greeting(me.user.name)}</h1>
          <p className="m-0 mt-1 text-sm text-muted">
            {me.org.name}
            {fleet && ` · ${fleet.sites.length} site${fleet.sites.length === 1 ? "" : "s"} · ${fleet.robots.length} robot${fleet.robots.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {mayConfigure && (
          <div className="ml-auto flex gap-2">
            <ActionButton icon={<IconMapPin size={16} />} onClick={() => setEditingSite("new")} quiet>Add site</ActionButton>
            <ActionButton icon={<IconPlus size={16} />} onClick={() => setEditingRobot({ robot: null, siteId: null })}>Add robot</ActionButton>
          </div>
        )}
      </div>

      {error && <Banner onClose={() => setError(null)}>{error}</Banner>}

      {onboarding && (
        <section className="mb-6 rounded-xl border border-line bg-panel p-5">
          <h2 className="m-0 text-base font-semibold text-fg">Get {me.org.name} ready</h2>
          <p className="m-0 mt-1 mb-4 text-sm text-muted">A few steps and your team can start operating.</p>
          <ol className="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.label} className={`rounded-lg border p-3.5 ${s.done ? "border-accent/40 bg-accent/5" : "border-line bg-bg"}`}>
                <div className="flex items-center gap-2.5">
                  <span className={`grid size-6 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-accent text-[#05210f]" : "bg-panel text-muted"}`}>
                    {s.done ? <IconCheck size={14} stroke={3} /> : i + 1}
                  </span>
                  <span className={`text-sm font-semibold ${s.done ? "text-muted line-through" : "text-fg"}`}>{s.label}</span>
                </div>
                <p className="m-0 mt-2 text-xs text-muted">{s.hint}</p>
                {!s.done && (
                  "href" in s && s.href
                    ? <a href={s.href} className="mt-3 inline-block text-xs font-semibold text-accent hover:underline">Open Team</a>
                    : <button onClick={s.action} className="mt-3 cursor-pointer text-xs font-semibold text-accent hover:underline">Start</button>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {fleet && fleet.sites.length === 0 && fleet.robots.length === 0 && !mayConfigure && (
        <div className="rounded-xl border border-line bg-panel p-10 text-center text-sm text-muted">
          No sites or robots yet. An admin of {me.org.name} adds them here.
        </div>
      )}

      <div className="grid gap-6">
        {fleet?.sites.map((site) => (
          <SiteCard
            key={site.id}
            site={site}
            robots={fleet.robots.filter((r) => r.site_id === site.id)}
            time={siteTime(site.timezone, now)}
            planVersion={planVersion}
            editable={mayConfigure}
            onEdit={() => setEditingSite(site)}
            onAddRobot={() => setEditingRobot({ robot: null, siteId: site.id })}
            onEditRobot={(robot) => setEditingRobot({ robot, siteId: robot.site_id })}
          />
        ))}
        {unassigned.length > 0 && (
          <section>
            <h2 className="m-0 mb-3 text-sm font-semibold text-fg">Not assigned to a site</h2>
            <RobotGrid robots={unassigned} editable={mayConfigure} onEdit={(robot) => setEditingRobot({ robot, siteId: null })} />
          </section>
        )}
      </div>

      {editingSite && fleet && (
        <SiteDialog
          site={editingSite === "new" ? null : editingSite}
          robotsHere={editingSite === "new" ? 0 : fleet.robots.filter((r) => r.site_id === editingSite.id).length}
          onClose={async (changed) => {
            setEditingSite(null);
            if (changed) {
              setPlanVersion(Date.now());
              await load();
            }
          }}
        />
      )}
      {editingRobot && fleet && (
        <RobotDialog
          robot={editingRobot.robot}
          siteId={editingRobot.siteId}
          fleet={fleet}
          onClose={async (changed) => {
            setEditingRobot(null);
            if (changed) await load();
          }}
        />
      )}
    </main>
  );
}

function SiteCard({ site, robots, time, planVersion, editable, onEdit, onAddRobot, onEditRobot }: {
  site: Site; robots: FleetRobot[]; time: string; planVersion: number; editable: boolean;
  onEdit: () => void; onAddRobot: () => void; onEditRobot: (r: FleetRobot) => void;
}) {
  const hasLocation = site.lat !== null && site.lon !== null;
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-panel">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
        <span className="grid size-9 place-items-center rounded-lg bg-bg text-accent"><IconBuildingWarehouse size={19} /></span>
        <div className="min-w-0">
          <h2 className="m-0 text-base font-semibold text-fg">{site.name}</h2>
          <p className="m-0 truncate text-xs text-muted">{site.address || "No address"}</p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted" title={site.timezone}>
          <IconClock size={14} />
          {time} local
        </span>
        {editable && (
          <button onClick={onEdit} className="flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-bg hover:text-fg">
            <IconPencil size={14} />Edit site
          </button>
        )}
      </header>
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="relative min-h-[220px] border-b border-line bg-bg lg:border-r lg:border-b-0">
          {site.has_plan ? (
            <img src={planUrl(site, planVersion)} alt={`Floor plan of ${site.name}`} className="absolute inset-0 size-full object-contain p-3" />
          ) : hasLocation ? (
            <SiteMap lat={site.lat} lon={site.lon} className="absolute inset-0" />
          ) : (
            <div className="absolute inset-0 grid place-items-center p-6 text-center text-xs text-muted">
              <div>
                <IconMapPin size={22} className="mx-auto mb-2" />
                No map yet.{editable && " Add a floor plan or a location from “Edit site”."}
              </div>
            </div>
          )}
        </div>
        <div className="p-4">
          {robots.length ? (
            <RobotGrid robots={robots} editable={editable} onEdit={onEditRobot} />
          ) : (
            <div className="grid h-full min-h-[160px] place-items-center text-center text-sm text-muted">
              <div>
                No robots at this site yet.
                {editable && (
                  <button onClick={onAddRobot} className="mt-2 block w-full cursor-pointer text-xs font-semibold text-accent hover:underline">
                    Register a robot here
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function RobotGrid({ robots, editable, onEdit }: {
  robots: FleetRobot[]; editable: boolean; onEdit: (r: FleetRobot) => void;
}) {
  const { presence } = usePresence();
  const net = useRobotTransports();
  const { setRobot } = useRobot();
  const can = useCan();
  const navigate = useNavigate();
  const open = (slot: string, path: string) => {
    setRobot(slot);
    navigate(path);
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {robots.map((r) => {
        const Icon = MODEL_ICON[r.slot] ?? IconRobot;
        const state = presence ? robotState(presence, r.slot, net) : null;
        return (
          <article key={r.id} className="rounded-lg border border-line bg-bg p-3.5 transition hover:border-accent/40">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-panel text-accent"><Icon size={19} /></span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-fg">{r.name}</div>
                <div className="truncate text-xs text-muted">{r.model}{r.serial && ` · S/N ${r.serial}`}</div>
              </div>
              {editable && (
                <button onClick={() => onEdit(r)} aria-label={`Edit ${r.name}`} className="cursor-pointer rounded-md p-1 text-muted hover:bg-panel hover:text-fg">
                  <IconPencil size={15} />
                </button>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {state ? <Pill tone={state.tone} title={state.title}>{state.text}</Pill> : <Pill tone="idle">…</Pill>}
              <BatteryPill net={net} robotId={r.slot} />
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={() => open(r.slot, "/")} className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-line py-1.5 text-xs font-medium text-fg hover:bg-panel">
                <IconVideo size={14} />Live
              </button>
              {can("operate") && (
                <button onClick={() => open(r.slot, "/drive")} className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-line py-1.5 text-xs font-medium text-fg hover:bg-panel">
                  <IconSteeringWheel size={14} />Drive
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Dialogs
// --------------------------------------------------------------------------- //
function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[1000] grid place-items-center overflow-y-auto bg-black/55 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} animate-rise rounded-2xl border border-line bg-panel p-5 shadow-2xl`}>
        <div className="mb-4 flex items-center">
          <h2 className="m-0 text-base font-semibold text-fg">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="ml-auto cursor-pointer text-muted hover:text-fg"><IconX size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none";

function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-semibold text-muted">{children}</label>;
}

const ZONES: string[] = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
  } catch {
    return ["UTC"];
  }
})();

function SiteDialog({ site, robotsHere, onClose }: { site: Site | null; robotsHere: number; onClose: (changed: boolean) => void }) {
  const [name, setName] = useState(site?.name ?? "");
  const [timezone, setTimezone] = useState(site?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");
  const [address, setAddress] = useState(site?.address ?? "");
  const [lat, setLat] = useState<number | null>(site?.lat ?? null);
  const [lon, setLon] = useState<number | null>(site?.lon ?? null);
  const [plan, setPlan] = useState<File | null>(null);
  const [removePlan, setRemovePlan] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const preview = useMemo(() => (plan ? URL.createObjectURL(plan) : null), [plan]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await saveSite(site?.id ?? null, {
        name, timezone, address,
        ...(lat !== null && lon !== null ? { lat, lon } : { clear_location: true }),
      });
      if (plan) await uploadPlan(saved.id, plan);
      else if (removePlan && site?.has_plan) await deletePlan(saved.id);
      onClose(true);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  async function remove() {
    if (!site) return;
    setBusy(true);
    try {
      await deleteSite(site.id);
      onClose(true);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Dialog title={site ? `Edit ${site.name}` : "Add a site"} onClose={() => onClose(false)} wide>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-4">
          <div>
            <Label htmlFor="site-name">Name</Label>
            <input id="site-name" autoFocus required maxLength={120} value={name} placeholder="Warehouse B"
              onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label htmlFor="site-address">Address</Label>
            <input id="site-address" maxLength={255} value={address} placeholder="Street, city"
              onChange={(e) => setAddress(e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label htmlFor="site-tz">Time zone</Label>
            <select id="site-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputCls}>
              {/* The saved zone may be spelled differently from the browser's list
                  ("America/Argentina/Buenos_Aires" vs "America/Buenos_Aires"): keep it shown. */}
              {(ZONES.includes(timezone) ? ZONES : [timezone, ...ZONES]).map((z) => (
                <option key={z} value={z}>{z.replaceAll("_", " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Floor plan</Label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line bg-bg px-3 py-3 text-sm text-muted hover:border-accent hover:text-fg">
              <IconPhotoUp size={20} />
              <span className="min-w-0 flex-1 truncate">
                {plan ? plan.name : site?.has_plan && !removePlan ? "Replace the current plan" : "Upload PNG, JPEG or WebP (max 10 MB)"}
              </span>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => {
                  setPlan(e.target.files?.[0] ?? null);
                  setRemovePlan(false);
                }} />
            </label>
            {preview && <img src={preview} alt="New floor plan" className="mt-2 max-h-32 rounded-lg border border-line object-contain" />}
            {site?.has_plan && !plan && (
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={removePlan} onChange={(e) => setRemovePlan(e.target.checked)} />
                Remove the current plan
              </label>
            )}
          </div>
        </div>
        <div className="flex flex-col">
          <Label>Location — click the map to place the site</Label>
          <SiteMap lat={lat} lon={lon} onPick={(a, b) => { setLat(a); setLon(b); }}
            className="min-h-[260px] flex-1 overflow-hidden rounded-lg border border-line" />
          <div className="mt-1.5 flex items-center text-xs text-muted">
            {lat !== null && lon !== null ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : "No location"}
            {lat !== null && (
              <button type="button" onClick={() => { setLat(null); setLon(null); }} className="ml-auto cursor-pointer hover:text-fg">Clear</button>
            )}
          </div>
        </div>
        {error && <p role="alert" className="m-0 text-sm text-danger md:col-span-2">{error}</p>}
        <div className="flex items-center gap-2 md:col-span-2">
          {site && !confirmDelete && (
            <button type="button" onClick={() => setConfirmDelete(true)} className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted hover:text-danger">
              <IconTrash size={15} />Delete site
            </button>
          )}
          {site && confirmDelete && (
            <span className="flex items-center gap-2 text-sm text-muted">
              {robotsHere ? `Its ${robotsHere} robot${robotsHere === 1 ? "" : "s"} will stay, unassigned.` : "Delete it?"}
              <button type="button" disabled={busy} onClick={remove} className="cursor-pointer rounded-lg bg-danger px-2.5 py-1.5 text-xs font-semibold text-white">Delete</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="cursor-pointer text-xs hover:text-fg">Keep</button>
            </span>
          )}
          <button type="button" onClick={() => onClose(false)} className="ml-auto cursor-pointer rounded-lg px-3.5 py-2 text-sm text-muted hover:text-fg">Cancel</button>
          <ActionButton type="submit" disabled={busy || !name.trim()}>{site ? "Save" : "Add site"}</ActionButton>
        </div>
      </form>
    </Dialog>
  );
}

function RobotDialog({ robot, siteId, fleet, onClose }: {
  robot: FleetRobot | null; siteId: string | null; fleet: Fleet; onClose: (changed: boolean) => void;
}) {
  const firstFree = fleet.slots.find((s) => s.free)?.slot ?? "";
  const [name, setName] = useState(robot?.name ?? "");
  const [slot, setSlot] = useState(robot?.slot ?? firstFree);
  const [serial, setSerial] = useState(robot?.serial ?? "");
  const [site, setSite] = useState<string>(robot?.site_id ?? siteId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const takenBy = (s: string) => fleet.robots.find((r) => r.slot === s && r.id !== robot?.id)?.name;
  const noSlot = !robot && !firstFree;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await saveRobot(robot?.id ?? null, {
        name, slot, serial, ...(site ? { site_id: site } : robot ? { unassign: true } : {}),
      });
      onClose(true);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  async function remove() {
    if (!robot) return;
    setBusy(true);
    try {
      await deleteRobot(robot.id);
      onClose(true);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  return (
    <Dialog title={robot ? `Edit ${robot.name}` : "Register a robot"} onClose={() => onClose(false)}>
      {noSlot ? (
        <p className="m-0 text-sm text-muted">
          This server already drives one robot of each model it supports
          ({fleet.robots.map((r) => r.name).join(", ")}). More robots of the same model are on the
          roadmap.
        </p>
      ) : (
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <Label htmlFor="robot-name">Name</Label>
            <input id="robot-name" autoFocus required maxLength={80} value={name} placeholder="Go2 · Unit 01"
              onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label>Model</Label>
            <div className="grid grid-cols-2 gap-2">
              {fleet.slots.map((s) => {
                const Icon = MODEL_ICON[s.slot] ?? IconRobot;
                const taken = takenBy(s.slot);
                return (
                  <label key={s.slot} title={taken ? `${taken} uses it` : undefined}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition ${
                      taken ? "cursor-not-allowed border-line opacity-45" : slot === s.slot ? "cursor-pointer border-accent bg-accent/10 text-fg" : "cursor-pointer border-line text-fg hover:bg-bg"}`}>
                    <input type="radio" name="slot" value={s.slot} disabled={!!taken} checked={slot === s.slot}
                      onChange={() => setSlot(s.slot)} className="sr-only" />
                    <Icon size={18} className="text-accent" />
                    <span>
                      <span className="block font-medium">{s.model}</span>
                      {taken && <span className="block text-xs text-muted">Used by {taken}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <Label htmlFor="robot-serial">Serial number (optional)</Label>
            <input id="robot-serial" maxLength={80} value={serial} onChange={(e) => setSerial(e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label htmlFor="robot-site">Site</Label>
            <select id="robot-site" value={site} onChange={(e) => setSite(e.target.value)} className={inputCls}>
              <option value="">Not assigned</option>
              {fleet.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-2">
            {robot && (
              <button type="button" disabled={busy} onClick={remove} className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted hover:text-danger">
                <IconTrash size={15} />Remove
              </button>
            )}
            <button type="button" onClick={() => onClose(false)} className="ml-auto cursor-pointer rounded-lg px-3.5 py-2 text-sm text-muted hover:text-fg">Cancel</button>
            <ActionButton type="submit" disabled={busy || !name.trim() || !slot}>{robot ? "Save" : "Register"}</ActionButton>
          </div>
        </form>
      )}
    </Dialog>
  );
}

function ActionButton({ children, icon, quiet, ...rest }: {
  children: ReactNode; icon?: ReactNode; quiet?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition active:scale-95 disabled:cursor-default disabled:opacity-50 ${
        quiet ? "border border-line text-fg hover:bg-panel" : "bg-accent text-[#05210f] hover:brightness-110"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function Banner({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-fg">
      {children}
      <button onClick={onClose} className="ml-auto cursor-pointer text-muted hover:text-fg" aria-label="Dismiss"><IconX size={16} /></button>
    </div>
  );
}

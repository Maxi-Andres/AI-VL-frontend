import { useEffect, useMemo, useState } from "react";
import type { ButtonHTMLAttributes, FormEvent, ReactNode } from "react";
import { IconBone, IconLoader2, IconMapPin, IconPhotoUp, IconRobot, IconSearch, IconTrash, IconX } from "@tabler/icons-react";
import { searchAddress, type Place } from "../../lib/geocode";
import { deletePlan, deleteRobot, deleteSite, saveRobot, saveSite, uploadPlan } from "../../api/fleet";
import type { Fleet, FleetRobot, Site } from "../../api/fleet";
import { ColorPicker } from "../ui/ColorPicker";
import { RobotIcon } from "./RobotIcon";
import { colorOf, randomColor, type ColorName } from "../../lib/colors";
import { SiteMap } from "./SiteMap";
import { t, useT } from "../../i18n";

// The Fleet page's editors: a site (name, address, time zone, location, floor plan) and a
// robot (name, model, serial, site). Theme tokens only.

export const MODEL_ICON: Record<string, typeof IconRobot> = { go2: IconBone, g1: IconRobot };

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : t("Something went wrong.");
}

// --------------------------------------------------------------------------- //
// Dialogs
// --------------------------------------------------------------------------- //
function Dialog({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const t = useT();
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
          <button onClick={onClose} aria-label={t("Close")} className="ml-auto cursor-pointer text-muted hover:text-fg"><IconX size={18} /></button>
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

export function SiteDialog({ site, robotsHere, satellite, onClose }: {
  site: Site | null; robotsHere: number; satellite: string | null; onClose: (changed: boolean) => void;
}) {
  const t = useT();
  const [name, setName] = useState(site?.name ?? "");
  const [timezone, setTimezone] = useState(site?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");
  const [address, setAddress] = useState(site?.address ?? "");
  // Address search: the matches, whether one is being looked up, and a counter that tells the
  // map to fly to the pin a search placed.
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);
  const [focus, setFocus] = useState(0);
  const place = (p: Place) => {
    setLat(p.lat);
    setLon(p.lon);
    setFocus((n) => n + 1);
    setPlaces(null);
  };
  async function find() {
    setFinding(true);
    setFindError(null);
    try {
      const found = await searchAddress(address);
      if (found.length === 1) place(found[0]);
      else if (found.length) setPlaces(found);
      else setFindError(t("No place found for that address. Try adding the city, or click the map."));
    } catch (e) {
      setFindError(errorText(e));
    } finally {
      setFinding(false);
    }
  }
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
    <Dialog title={site ? t("Edit {name}", { name: site.name }) : t("Add a site")} onClose={() => onClose(false)} wide>
      <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
        <div className="grid content-start gap-4">
          <div>
            <Label htmlFor="site-name">{t("Name")}</Label>
            <input id="site-name" autoFocus required maxLength={120} value={name} placeholder={t("Warehouse B")}
              onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label htmlFor="site-address">{t("Address")}</Label>
            <div className="flex gap-2">
              <input id="site-address" maxLength={255} value={address} placeholder={t("Street, city")}
                onChange={(e) => setAddress(e.target.value)}
                // Enter searches the map instead of submitting the dialog.
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void find();
                  }
                }}
                className={inputCls} />
              <button type="button" onClick={() => void find()} disabled={!address.trim() || finding}
                title={t("Find this address on the map")}
                className="grid w-10 shrink-0 cursor-pointer place-items-center rounded-lg border border-line text-muted transition hover:border-accent hover:text-fg disabled:cursor-default disabled:opacity-40">
                {finding ? <IconLoader2 size={16} className="animate-spin" /> : <IconSearch size={16} />}
              </button>
            </div>
            {findError && <p className="m-0 mt-1.5 text-xs text-warn-fg">{findError}</p>}
            {places && (
              <ul className="m-0 mt-1.5 max-h-44 list-none overflow-y-auto rounded-lg border border-line bg-panel p-1 shadow-lift">
                {places.map((p) => (
                  <li key={`${p.lat},${p.lon}`}>
                    <button type="button" onClick={() => place(p)}
                      className="flex w-full cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs text-fg hover:bg-subtle">
                      <IconMapPin size={14} className="mt-0.5 shrink-0 text-accent" />
                      <span className="line-clamp-2">{p.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <Label htmlFor="site-tz">{t("Time zone")}</Label>
            <select id="site-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={inputCls}>
              {/* The saved zone may be spelled differently from the browser's list
                  ("America/Argentina/Buenos_Aires" vs "America/Buenos_Aires"): keep it shown. */}
              {(ZONES.includes(timezone) ? ZONES : [timezone, ...ZONES]).map((z) => (
                <option key={z} value={z}>{z.replaceAll("_", " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t("Floor plan")}</Label>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line bg-bg px-3 py-3 text-sm text-muted hover:border-accent hover:text-fg">
              <IconPhotoUp size={20} />
              <span className="min-w-0 flex-1 truncate">
                {plan ? plan.name : site?.has_plan && !removePlan ? t("Replace the current plan") : t("Upload PNG, JPEG or WebP (max 10 MB)")}
              </span>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => {
                  setPlan(e.target.files?.[0] ?? null);
                  setRemovePlan(false);
                }} />
            </label>
            {preview && <img src={preview} alt={t("New floor plan")} className="mt-2 max-h-32 rounded-lg border border-line object-contain" />}
            {site?.has_plan && !plan && (
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={removePlan} onChange={(e) => setRemovePlan(e.target.checked)} />
                {t("Remove the current plan")}
              </label>
            )}
          </div>
        </div>
        <div className="flex flex-col">
          <Label>{t("Location — search the address, or click the map")}</Label>
          <SiteMap lat={lat} lon={lon} focus={focus} satellite={satellite} onPick={(a, b) => { setLat(a); setLon(b); }}
            className="relative min-h-[260px] flex-1 overflow-hidden rounded-lg border border-line" />
          <div className="mt-1.5 flex items-center text-xs text-muted">
            {lat !== null && lon !== null ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : t("No location")}
            {lat !== null && (
              <button type="button" onClick={() => { setLat(null); setLon(null); }} className="ml-auto cursor-pointer hover:text-fg">{t("Clear")}</button>
            )}
          </div>
        </div>
        {error && <p role="alert" className="m-0 text-sm text-danger md:col-span-2">{error}</p>}
        <div className="flex items-center gap-2 md:col-span-2">
          {site && !confirmDelete && (
            <button type="button" onClick={() => setConfirmDelete(true)} className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted hover:text-danger">
              <IconTrash size={15} />{t("Delete site")}
            </button>
          )}
          {site && confirmDelete && (
            <span className="flex items-center gap-2 text-sm text-muted">
              {robotsHere
                ? robotsHere === 1 ? t("Its {n} robot will stay, unassigned.", { n: robotsHere }) : t("Its {n} robots will stay, unassigned.", { n: robotsHere })
                : t("Delete it?")}
              <button type="button" disabled={busy} onClick={remove} className="cursor-pointer rounded-lg bg-danger px-2.5 py-1.5 text-xs font-semibold text-white">{t("Delete")}</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="cursor-pointer text-xs hover:text-fg">{t("Keep")}</button>
            </span>
          )}
          <button type="button" onClick={() => onClose(false)} className="ml-auto cursor-pointer rounded-lg px-3.5 py-2 text-sm text-muted hover:text-fg">{t("Cancel")}</button>
          <ActionButton type="submit" disabled={busy || !name.trim()}>{site ? t("Save") : t("Add site")}</ActionButton>
        </div>
      </form>
    </Dialog>
  );
}

export function RobotDialog({ robot, siteId, fleet, onClose }: {
  robot: FleetRobot | null; siteId: string | null; fleet: Fleet; onClose: (changed: boolean) => void;
}) {
  const t = useT();
  const firstFree = fleet.slots.find((s) => s.free)?.slot ?? "";
  const [name, setName] = useState(robot?.name ?? "");
  const [slot, setSlot] = useState(robot?.slot ?? firstFree);
  const [serial, setSerial] = useState(robot?.serial ?? "");
  const [site, setSite] = useState<string>(robot?.site_id ?? siteId ?? "");
  // A new robot gets a colour at random, shown here so it can be changed before saving.
  const [color, setColor] = useState<ColorName>(() => (robot ? colorOf(robot.color, robot.id) : randomColor()));
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
        name, slot, serial, color, ...(site ? { site_id: site } : robot ? { unassign: true } : {}),
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
    <Dialog title={robot ? t("Edit {name}", { name: robot.name }) : t("Register a robot")} onClose={() => onClose(false)}>
      {noSlot ? (
        <p className="m-0 text-sm text-muted">
          {t("This server already drives one robot of each model it supports ({robots}). More robots of the same model are on the roadmap.",
            { robots: fleet.robots.map((r) => r.name).join(", ") })}
        </p>
      ) : (
        <form onSubmit={submit} className="grid gap-4">
          <div>
            <Label htmlFor="robot-name">{t("Name")}</Label>
            <input id="robot-name" autoFocus required maxLength={80} value={name} placeholder={t("Go2 · Unit 01")}
              onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label>{t("Model")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {fleet.slots.map((s) => {
                const Icon = MODEL_ICON[s.slot] ?? IconRobot;
                const taken = takenBy(s.slot);
                return (
                  <label key={s.slot} title={taken ? t("{name} uses it", { name: taken }) : undefined}
                    className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition ${
                      taken ? "cursor-not-allowed border-line opacity-45" : slot === s.slot ? "cursor-pointer border-accent bg-accent/10 text-fg" : "cursor-pointer border-line text-fg hover:bg-bg"}`}>
                    <input type="radio" name="slot" value={s.slot} disabled={!!taken} checked={slot === s.slot}
                      onChange={() => setSlot(s.slot)} className="sr-only" />
                    <Icon size={18} className="text-accent" />
                    <span>
                      <span className="block font-medium">{s.model}</span>
                      {taken && <span className="block text-xs text-muted">{t("Used by {name}", { name: taken })}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <Label>{t("Colour")}</Label>
            <div className="flex items-center gap-3">
              <RobotIcon slot={slot} color={color} size={34} />
              <ColorPicker value={color} onChange={setColor} label={t("Robot colour")} />
            </div>
          </div>
          <div>
            <Label htmlFor="robot-serial">{t("Serial number (optional)")}</Label>
            <input id="robot-serial" maxLength={80} value={serial} onChange={(e) => setSerial(e.target.value)} className={inputCls} />
          </div>
          <div>
            <Label htmlFor="robot-site">{t("Site")}</Label>
            <select id="robot-site" value={site} onChange={(e) => setSite(e.target.value)} className={inputCls}>
              <option value="">{t("Not assigned")}</option>
              {fleet.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-2">
            {robot && (
              <button type="button" disabled={busy} onClick={remove} className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-muted hover:text-danger">
                <IconTrash size={15} />{t("Remove")}
              </button>
            )}
            <button type="button" onClick={() => onClose(false)} className="ml-auto cursor-pointer rounded-lg px-3.5 py-2 text-sm text-muted hover:text-fg">{t("Cancel")}</button>
            <ActionButton type="submit" disabled={busy || !name.trim() || !slot}>{robot ? t("Save") : t("Register")}</ActionButton>
          </div>
        </form>
      )}
    </Dialog>
  );
}

export function ActionButton({ children, icon, quiet, ...rest }: {
  children: ReactNode; icon?: ReactNode; quiet?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`flex cursor-pointer items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition active:scale-95 disabled:cursor-default disabled:opacity-50 ${
        quiet ? "border border-line text-fg hover:bg-panel" : "bg-accent text-on-accent hover:brightness-110"}`}
    >
      {icon}
      {children}
    </button>
  );
}

export function Banner({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const t = useT();
  return (
    <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-fg">
      {children}
      <button onClick={onClose} className="ml-auto cursor-pointer text-muted hover:text-fg" aria-label={t("Dismiss")}><IconX size={16} /></button>
    </div>
  );
}

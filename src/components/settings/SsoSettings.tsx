import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { IconBrandGoogle, IconBrandWindows, IconCheck, IconCopy, IconKey, IconLoader2 } from "@tabler/icons-react";
import { getSso, saveSso } from "../../api/sso";
import type { SsoProvider, SsoSettings as Settings } from "../../api/sso";
import { Segmented } from "../ui/Segmented";
import { Switch } from "../ui/Switch";
import { msg, useT } from "../../i18n";
import { rich } from "../../i18n/rich";

// Settings → Single sign-on (owners): the company's identity provider (sso.py). Three values
// from the provider and a switch; the sign-in page then offers "Sign in with Microsoft", and the
// password stays as the way in when the provider is down. Only invited people get in either way.

const PROVIDERS: [SsoProvider, string, typeof IconKey][] = [
  ["microsoft", "Microsoft", IconBrandWindows],
  ["google", "Google", IconBrandGoogle],
  ["oidc", msg("Other (OIDC)"), IconKey],
];

/** Can this redirect address be registered? Microsoft and Google take https, and plain http
 * only for localhost. */
function registrable(uri: string): boolean {
  try {
    const u = new URL(uri);
    return u.protocol === "https:" || ["localhost", "127.0.0.1"].includes(u.hostname);
  } catch {
    return false;
  }
}

/** One setting. A <label> around a single field, so clicking the name focuses it; a <div> when
 * the row holds buttons — a label would forward every click on it to the first one. */
function Row({ label, hint, children, field = true }: {
  label: string; hint?: ReactNode; children: ReactNode; field?: boolean;
}) {
  const Tag = field ? "label" : "div";
  return (
    <Tag className="grid gap-1.5 px-5 py-3.5 sm:grid-cols-[200px_1fr] sm:items-start sm:gap-5">
      <span className="pt-2 text-[13px] font-bold">{label}</span>
      <span className="grid gap-1.5">
        {children}
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
    </Tag>
  );
}

const INPUT = "h-10 w-full rounded-lg border border-line bg-bg px-3 text-[13px] outline-none focus:border-accent";

export function SsoSettings() {
  const t = useT();
  const [saved, setSaved] = useState<Settings | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  // Kept in English and translated where shown (see BackupSettings).
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const s = await getSso(signal);
      setSaved(s);
      setForm(s);
      setError(null);
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : msg("Could not read the single sign-on settings."));
    }
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    void load(ctl.signal);
    return () => ctl.abort();
  }, [load]);

  if (!form || !saved) {
    return (
      <section id="sso" data-nav={msg("Single sign-on")} className="scroll-mt-4">
        <h2 className="m-0 mb-1 text-lg font-extrabold tracking-[-0.015em]">{t("Single sign-on")}</h2>
        {error ? <p role="alert" className="m-0 text-[13px] text-danger">{t(error)}</p>
          : <p className="m-0 text-[13px] text-muted">{t("Loading…")}</p>}
      </section>
    );
  }

  const set = (patch: Partial<Settings>) => setForm({ ...form, ...patch });
  const changed = secret !== "" || (["enabled", "provider", "tenant", "issuer", "client_id"] as const)
    .some((k) => form[k] !== saved[k]);

  async function save(next: Settings) {
    setBusy(true);
    setError(null);
    try {
      const s = await saveSso({ enabled: next.enabled, provider: next.provider, tenant: next.tenant,
        issuer: next.issuer, client_id: next.client_id, client_secret: secret });
      setSaved(s);
      setForm(s);
      setSecret("");
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : msg("Could not save the single sign-on settings."));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(form!.redirect_uri);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the field is selectable as a fallback */
    }
  }

  const ms = form.provider === "microsoft";
  return (
    <section id="sso" data-nav={msg("Single sign-on")} className="scroll-mt-4">
      <div className="mb-1 flex items-center gap-3">
        <h2 className="m-0 text-lg font-extrabold tracking-[-0.015em]">{t("Single sign-on")}</h2>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold ${saved.enabled ? "bg-good-bg text-good-fg" : "bg-subtle text-muted"}`}>
          {saved.enabled ? t("On") : t("Off")}
        </span>
      </div>
      <p className="m-0 mb-3.5 text-[13px] text-muted">
        {t("Your team signs in with their work account instead of a Pilot password. Only people you invite get in; the password keeps working as the way in when the provider is down.")}
      </p>
      {error && <p role="alert" className="m-0 mb-3 text-[13px] text-danger">{t(error)}</p>}

      <div className="divide-y divide-line rounded-2xl border border-line bg-panel shadow-card">
        <Row label={t("Provider")} field={false}>
          <Segmented className="flex w-fit rounded-lg bg-subtle p-0.5">
            {PROVIDERS.map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => set({ provider: id })} data-on={form.provider === id}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${form.provider === id ? "text-fg" : "text-muted hover:text-fg"}`}>
                <Icon size={15} />{t(label)}
              </button>
            ))}
          </Segmented>
        </Row>

        <Row label={t("Redirect URI")} field={false}
          hint={registrable(form.redirect_uri)
            ? t("Register this exact address at the provider.")
            : <span className="text-warn-fg">{t("The provider only accepts https addresses (or localhost). Pilot needs a name with a certificate, picked as the address people reach it on (Team & roles, when you invite someone).")}</span>}>
          <span className="flex gap-2">
            <input readOnly value={form.redirect_uri} onFocus={(e) => e.target.select()} className={`${INPUT} font-mono text-xs`} />
            <button type="button" onClick={() => void copy()} title={t("Copy")}
              className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg border border-line text-muted transition hover:text-fg">
              {copied ? <IconCheck size={16} className="text-good-fg" /> : <IconCopy size={16} />}
            </button>
          </span>
        </Row>

        {ms && (
          <Row label={t("Directory (tenant) ID")} hint={t("In Microsoft Entra: Overview. The tenant's domain works too (silk-technologies.com).")}>
            <input value={form.tenant} onChange={(e) => set({ tenant: e.target.value })} spellCheck={false}
              placeholder="00000000-0000-0000-0000-000000000000" className={`${INPUT} font-mono`} />
          </Row>
        )}
        {form.provider === "oidc" && (
          <Row label={t("Issuer URL")} hint={t("The address before /.well-known/openid-configuration.")}>
            <input value={form.issuer} onChange={(e) => set({ issuer: e.target.value })} spellCheck={false}
              placeholder="https://login.example.com" className={`${INPUT} font-mono`} />
          </Row>
        )}
        <Row label={ms ? t("Application (client) ID") : t("Client ID")}>
          <input value={form.client_id} onChange={(e) => set({ client_id: e.target.value })} spellCheck={false}
            className={`${INPUT} font-mono`} />
        </Row>
        <Row label={t("Client secret")}
          hint={ms ? t("Certificates & secrets → New client secret: copy its Value (shown only once). It expires; put the new one here before it does.") : undefined}>
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password"
            placeholder={saved.has_secret ? t("Saved — leave empty to keep it") : ""} className={`${INPUT} font-mono`} />
        </Row>

        <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
          <Switch on={form.enabled} onChange={(on) => set({ enabled: on })} label={t("Single sign-on")} />
          <span className="text-[13px] font-semibold">{t("Offer it on the sign-in page")}</span>
          <button type="button" onClick={() => void save(form)} disabled={busy || !changed}
            className="ml-auto flex cursor-pointer items-center gap-2 rounded-xl bg-fg px-4 py-2 text-[13px] font-bold text-bg transition active:scale-95 disabled:cursor-default disabled:opacity-40">
            {busy ? <IconLoader2 size={16} className="animate-spin" /> : done ? <IconCheck size={16} /> : null}
            {busy ? t("Checking…") : done ? t("Saved") : t("Save")}
          </button>
        </div>

        {ms && (
          <ol className="m-0 list-decimal space-y-1 py-3.5 pr-5 pl-10 text-xs text-muted">
            <li>{rich(t("In the Microsoft Entra admin center: {path}, any name (\"Silk Pilot\"), single tenant."), { path: <b>{t("App registrations → New registration")}</b> })}</li>
            <li>{rich(t("Redirect URI: platform {web}, the address above."), { web: <b>Web</b> })}</li>
            <li>{t("Copy the Application (client) ID and the Directory (tenant) ID from its Overview.")}</li>
            <li>{t("Create a client secret and paste its Value here, then turn this on and save: Pilot checks with Microsoft before saving.")}</li>
          </ol>
        )}
      </div>
    </section>
  );
}

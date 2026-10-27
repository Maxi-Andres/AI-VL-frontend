import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconCopy,
  IconLink,
  IconLoader2,
  IconMail,
  IconShieldHalf,
  IconUserPlus,
  IconX,
} from "@tabler/icons-react";
import type { Role } from "../../api/auth";
import {
  getAddress, getTeam, invite, linkUrl, makePasswordReset, onLocalAddress, removeMember, revokeInvitation, setAddress, updateMember,
} from "../../api/team";
import type { Invitation, Member, OneTimeLink, ServerAddress, Team } from "../../api/team";
import { useMe } from "../../auth/AuthContext";
import { ROLES, ROLE_LABEL, ROLE_RANK } from "../../auth/roles";
import { Avatar } from "../ui/Avatar";
import { msg, t, useT } from "../../i18n";
import { rich } from "../../i18n/rich";

// Settings → Team & roles: who is in the company and with what role (admins and owners).
// Theme tokens only. The backend decides what is allowed (team.py); this only offers it.

// Plain functions, called while rendering: the module-level t() reads the language then.
function ago(iso: string | null): string {
  if (!iso) return t("Never");
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return t("Just now");
  if (s < 3600) return t("{n} min ago", { n: Math.floor(s / 60) });
  if (s < 86400) return t("{n} h ago", { n: Math.floor(s / 3600) });
  const d = Math.floor(s / 86400);
  return d === 1 ? t("Yesterday") : t("{n} days ago", { n: d });
}

function daysLeft(iso: string): string {
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  return d <= 1 ? t("expires today") : t("expires in {n} days", { n: d });
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : t("Something went wrong.");
}

export function TeamSettings() {
  const t = useT();
  const me = useMe();
  const [team, setTeam] = useState<Team | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [confirm, setConfirm] = useState<{ text: string; run: () => Promise<void> } | null>(null);
  const [shared, setShared] = useState<{ title: string; to: string; link: OneTimeLink; valid: string } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setTeam(await getTeam(signal));
    } catch (e) {
      if (!signal?.aborted) setError(errorText(e));
    }
  }, []);

  // Reloads when your own name changes in Profile, so your row follows.
  useEffect(() => {
    const ctl = new AbortController();
    void load(ctl.signal);
    return () => ctl.abort();
  }, [load, me.user.name]);

  const myRank = ROLE_RANK[me.role];
  const assignable = ROLES.filter((r) => ROLE_RANK[r.role] <= myRank);
  const editable = (m: Member) => !m.you && ROLE_RANK[m.role] <= myRank;

  const act = (text: string, run: () => Promise<void>) => setConfirm({ text, run });

  return (
    <section id="team" data-nav={msg("Team & roles")} className="scroll-mt-4">
      <div className="mb-1 flex items-center gap-3">
        <h2 className="m-0 text-lg font-extrabold tracking-[-0.015em]">{t("Team & roles")}</h2>
        <button onClick={() => setInviting(true)}
          className="ml-auto flex cursor-pointer items-center gap-2 rounded-xl bg-fg px-3.5 py-2 text-[13px] font-bold text-bg transition hover:-translate-y-px hover:shadow-lift">
          <IconUserPlus size={16} />
          {t("Invite member")}
        </button>
      </div>
      <p className="m-0 mb-3.5 text-[13px] text-muted">
        {t("Owners manage the workspace, admins configure it, operators drive, viewers only watch.")}
        {team && (() => {
          const n = team.members.filter((m) => m.active).length;
          return <>{" "}{n === 1
            ? t("{n} active member in {org}.", { n, org: me.org.name })
            : t("{n} active members in {org}.", { n, org: me.org.name })}</>;
        })()}
      </p>

      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-fg">
          {error}
          <button onClick={() => setError(null)} className="ml-auto cursor-pointer text-muted hover:text-fg" aria-label={t("Dismiss")}>
            <IconX size={16} />
          </button>
        </div>
      )}

      <LinkAddress />

      {me.role === "owner" && team && team.members.filter((m) => m.role === "owner" && m.active).length === 1 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warn-fg/30 bg-warn-bg px-4 py-3 text-sm">
          <IconShieldHalf size={18} className="mt-0.5 shrink-0 text-warn-fg" />
          <div>
            <b className="text-fg">{t("You are the only owner.")}</b>{" "}
            <span className="text-muted">
              {t("Add a second owner so the company is never locked out if one person leaves or forgets their password.")}
            </span>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-line bg-panel shadow-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] tracking-wider text-muted uppercase">
              <th className="px-4 py-3 font-semibold">{t("Member")}</th>
              <th className="px-4 py-3 font-semibold">{t("Role")}</th>
              <th className="px-4 py-3 font-semibold">{t("Last sign-in")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {!team && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">
                  <IconLoader2 size={18} className="inline animate-spin" />
                </td>
              </tr>
            )}
            {team?.members.map((m) => (
              <tr key={m.id} className={`border-b border-line last:border-0 ${m.active ? "" : "opacity-55"}`}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar id={m.id} name={m.name || m.email} color={m.color} size={34} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium text-fg">
                        {m.name}
                        {m.you && <Tag>{t("You")}</Tag>}
                        {!m.active && <Tag>{t("Disabled")}</Tag>}
                      </div>
                      <div className="truncate text-xs text-muted">{m.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {editable(m) && m.active ? (
                    <select
                      value={m.role}
                      onChange={(e) => {
                        const role = e.target.value as Role;
                        act(
                          t("Make {name} {role}? They will be signed out and sign in again with the new role.",
                            { name: m.name, role: t(ROLE_LABEL[role]) }),
                          () => updateMember(m.id, { role }),
                        );
                      }}
                      className="cursor-pointer rounded-md border border-line bg-bg px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none"
                    >
                      {assignable.map((r) => (
                        <option key={r.role} value={r.role}>{t(r.label)}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-fg">{t(ROLE_LABEL[m.role])}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">{ago(m.last_login_at)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {editable(m) && m.active && (
                    <button
                      onClick={() =>
                        act(
                          t("Make a password reset link for {name}? Their current password keeps working until they set a new one.",
                            { name: m.name }),
                          async () => {
                            const r = await makePasswordReset(m.id);
                            setShared({ title: msg("Password reset link"), to: m.email, link: r.link, valid: msg("24 hours") });
                          },
                        )
                      }
                      className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-bg hover:text-fg"
                    >
                      {t("Reset password")}
                    </button>
                  )}
                  {editable(m) && (
                    <button
                      onClick={() =>
                        act(
                          m.active
                            ? t("Disable {name}? They are signed out now and cannot sign in until re-enabled.", { name: m.name })
                            : t("Enable {name} again, as {role}?", { name: m.name, role: t(ROLE_LABEL[m.role]) }),
                          () => updateMember(m.id, { active: !m.active }),
                        )
                      }
                      className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-bg hover:text-fg"
                    >
                      {m.active ? t("Disable") : t("Enable")}
                    </button>
                  )}
                  {editable(m) && (
                    <button
                      onClick={() =>
                        act(
                          t("Remove {name} from {org}? They are signed out now and their account is deleted, with their conversations. To keep it for later, Disable instead.", { name: m.name, org: me.org.name }),
                          () => removeMember(m.id),
                        )
                      }
                      className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-danger hover:bg-bad-bg"
                    >
                      {t("Remove")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {!!team?.invitations.length && (
        <section className="mt-6">
          <h3 className="m-0 mb-2 text-sm font-bold text-fg">{t("Pending invitations")}</h3>
          <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-card">
            {team.invitations.map((inv: Invitation) => (
              <div key={inv.id} className="flex items-center gap-3 border-b border-line px-4 py-3 text-sm last:border-0">
                <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-subtle text-muted"><IconMail size={16} /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-fg">{inv.email}</div>
                  <div className="text-xs text-muted">
                    {t("{role} · invited by {who} · {expires}", {
                      role: t(ROLE_LABEL[inv.role]), who: inv.invited_by || "—", expires: daysLeft(inv.expires_at),
                    })}
                  </div>
                </div>
                <button
                  onClick={() => act(t("Revoke the invitation for {email}? The link stops working.", { email: inv.email }), () => revokeInvitation(inv.id))}
                  className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-bg hover:text-fg"
                >
                  {t("Revoke")}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h3 className="m-0 mb-3 text-sm font-bold text-fg">{t("What each role can do")}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <div key={r.role} className="rounded-2xl border border-line bg-panel shadow-card p-3.5">
              <div className="text-sm font-semibold text-fg">{t(r.label)}</div>
              <div className="mt-1 text-xs leading-relaxed text-muted">{t(r.summary)}</div>
            </div>
          ))}
        </div>
      </section>

      {inviting && (
        <InviteDialog
          roles={assignable}
          onClose={() => {
            setInviting(false);
            void load();
          }}
        />
      )}
      {shared && (
        <LinkDialog {...shared} onClose={() => setShared(null)} />
      )}
      {confirm && (
        <ConfirmDialog
          text={confirm.text}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            try {
              await confirm.run();
            } catch (e) {
              setError(errorText(e));
            }
            setConfirm(null);
            await load();
          }}
        />
      )}
    </section>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded bg-bg px-1.5 py-px text-[10.5px] font-medium text-muted">{children}</span>;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const t = useT();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label={title}
        className="w-full max-w-md animate-rise rounded-2xl border border-line bg-panel p-5 shadow-2xl">
        <div className="mb-4 flex items-center">
          <h2 className="m-0 text-base font-semibold text-fg">{title}</h2>
          <button onClick={onClose} aria-label={t("Close")} className="ml-auto cursor-pointer text-muted hover:text-fg">
            <IconX size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ConfirmDialog({ text, onCancel, onConfirm }: {
  text: string; onCancel: () => void; onConfirm: () => Promise<void>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title={t("Are you sure?")} onClose={onCancel}>
      <p className="m-0 mb-5 text-sm text-muted">{text}</p>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="cursor-pointer rounded-lg px-3.5 py-2 text-sm text-muted hover:text-fg">{t("Cancel")}</button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onConfirm();
          }}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent disabled:opacity-60"
        >
          {busy && <IconLoader2 size={15} className="animate-spin" />}
          {t("Confirm")}
        </button>
      </div>
    </Dialog>
  );
}

/** A one-time link (invitation or password reset) to hand over. Shown once: only its hash is
 * kept on the server, so closing this is the last chance to copy it. Built on the company's
 * address; when there is none and this page runs on localhost, it says so and offers this
 * server's real addresses — a localhost link opens on no one else's computer. `title` and
 * `valid` come marked with msg() and are translated here. */
function LinkDialog({ title, to, link, valid, onClose }: {
  title: string; to: string; link: OneTimeLink; valid: string; onClose: () => void;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const [base, setBase] = useState(link.base);
  const [changing, setChanging] = useState(!link.base && onLocalAddress());
  const url = linkUrl({ ...link, base });
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* no clipboard (plain-HTTP origin): the link is selectable on screen */
    }
  }
  return (
    <Dialog title={t(title)} onClose={onClose}>
      <p className="m-0 mb-3 text-sm text-muted">
        {rich(t("Send this link to {to} by email or chat. It works once and expires in {valid}. For safety it is shown only now.", { valid: t(valid) }),
          { to: <b className="text-fg">{to}</b> })}
      </p>
      {!base && onLocalAddress() && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-warn-fg/30 bg-warn-bg px-3 py-2 text-[12.5px] text-warn-fg">
          <IconAlertTriangle size={16} className="mt-px shrink-0" />
          <span>{rich(t("This link uses {host}, which opens only on this computer. Pick the address people reach Pilot on — it is kept for every link from now on."), { host: <b>localhost</b> })}</span>
        </div>
      )}
      <div className="mb-2 flex items-center gap-2 rounded-lg border border-line bg-bg py-1.5 pr-1.5 pl-3">
        <IconLink size={16} className="shrink-0 text-muted" />
        <input readOnly value={url} onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-fg outline-none" />
        <button onClick={copy}
          className="flex cursor-pointer items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent">
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          {copied ? t("Copied") : t("Copy")}
        </button>
      </div>
      {changing ? (
        <AddressPicker current={base} onSaved={(u) => { setBase(u); setChanging(false); }} />
      ) : (
        <p className="m-0 text-xs text-dim">
          {t("Points to {url}", { url: base ?? location.origin })} ·{" "}
          <button type="button" onClick={() => setChanging(true)} className="cursor-pointer font-bold text-accent hover:underline">{t("Change")}</button>
        </p>
      )}
      <div className="mt-5 flex justify-end">
        <button onClick={onClose} className="cursor-pointer rounded-lg px-3.5 py-2 text-sm font-semibold text-fg hover:bg-bg">{t("Done")}</button>
      </div>
    </Dialog>
  );
}

/** Choose the address links point to: one of this server's own, or typed. Saved for the
 * company, so it is chosen once. */
function AddressPicker({ current, onSaved }: { current: string | null; onSaved: (url: string | null) => void }) {
  const t = useT();
  const [info, setInfo] = useState<ServerAddress | null>(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    getAddress(ctl.signal).then(setInfo).catch((e) => !ctl.signal.aborted && setError(errorText(e)));
    return () => ctl.abort();
  }, []);

  async function save(url: string) {
    setBusy(true);
    setError(null);
    try {
      const saved = await setAddress(url);
      onSaved(saved);
      // Every other place showing it (the row in Settings) follows at once.
      window.dispatchEvent(new CustomEvent(ADDRESS_CHANGED, { detail: saved }));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-1.5">
      {!info && !error && <p className="m-0 text-xs text-muted"><IconLoader2 size={14} className="inline animate-spin" /> {t("Finding this server's addresses…")}</p>}
      {info?.candidates.map((c) => (
        <button key={c.url} type="button" disabled={busy} onClick={() => void save(c.url)}
          className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition hover:border-accent disabled:opacity-50 ${
            current === c.url ? "border-accent bg-good-bg" : "border-line"}`}>
          <span className="min-w-0 flex-1">
            <b className="block truncate font-mono text-[12.5px]">{c.url}</b>
            <small className="block text-[11.5px] text-muted">{c.label}</small>
          </span>
          {current === c.url && <IconCheck size={15} className="shrink-0 text-accent" />}
        </button>
      ))}
      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) void save(custom); }}>
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={t("Or type it: https://pilot.company.com")}
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-1.5 text-xs text-fg focus:border-accent focus:outline-none" />
        <button type="submit" disabled={busy || !custom.trim()}
          className="cursor-pointer rounded-lg bg-fg px-3 text-xs font-bold text-bg disabled:opacity-40">{t("Use")}</button>
      </form>
      {error && <p role="alert" className="m-0 text-xs text-danger">{error}</p>}
    </div>
  );
}

const ADDRESS_CHANGED = "pilot:linkAddress";

/** Settings → Team: the address links point to, with a way to change it. */
function LinkAddress() {
  const t = useT();
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [changing, setChanging] = useState(false);
  useEffect(() => {
    const ctl = new AbortController();
    getAddress(ctl.signal).then((a) => setUrl(a.public_url)).catch(() => setUrl(null));
    const changed = (e: Event) => setUrl((e as CustomEvent<string | null>).detail);
    window.addEventListener(ADDRESS_CHANGED, changed);
    return () => {
      ctl.abort();
      window.removeEventListener(ADDRESS_CHANGED, changed);
    };
  }, []);
  if (url === undefined) return null;
  return (
    <div className={`mb-4 rounded-xl border px-4 py-3 ${!url && onLocalAddress() ? "border-warn-fg/30 bg-warn-bg" : "border-line bg-panel"}`}>
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <IconLink size={16} className="text-muted" />
        <b>{t("Invitation links point to")}</b>
        <span className="font-mono text-[12.5px] text-muted">{url ?? t("{origin} (this page — not set)", { origin: location.origin })}</span>
        <button type="button" onClick={() => setChanging((v) => !v)} className="ml-auto cursor-pointer text-xs font-bold text-accent hover:underline">
          {changing ? t("Close") : t("Change")}
        </button>
      </div>
      {changing && <div className="mt-3"><AddressPicker current={url} onSaved={(u) => { setUrl(u); setChanging(false); }} /></div>}
    </div>
  );
}

function InviteDialog({ roles, onClose }: { roles: typeof ROLES; onClose: () => void }) {
  const t = useT();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<OneTimeLink | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setLink((await invite(email, role)).link);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (link) return <LinkDialog title={msg("Invitation ready")} to={email} link={link} valid={msg("7 days")} onClose={onClose} />;

  return (
    <Dialog title={t("Invite a member")} onClose={onClose}>
      <form onSubmit={submit}>
        <label className="mb-1.5 block text-xs font-semibold text-muted" htmlFor="invite-email">{t("Work email")}</label>
        <input
          id="invite-email" type="email" autoFocus required value={email} placeholder={t("name@company.com")}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
        />
        <div className="mb-1.5 text-xs font-semibold text-muted">{t("Role")}</div>
        <div className="mb-4 grid gap-2">
          {roles.map((r) => (
            <label key={r.role}
              className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 transition ${
                role === r.role ? "border-accent bg-accent/10" : "border-line hover:bg-bg"}`}>
              <input type="radio" name="role" value={r.role} checked={role === r.role}
                onChange={() => setRole(r.role)} className="mt-0.5 accent-[var(--color-accent)]" />
              <span>
                <span className="block text-sm font-medium text-fg">{t(r.label)}</span>
                <span className="block text-xs text-muted">{t(r.summary)}</span>
              </span>
            </label>
          ))}
        </div>
        {error && <p role="alert" className="m-0 mb-3 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-lg px-3.5 py-2 text-sm text-muted hover:text-fg">{t("Cancel")}</button>
          <button type="submit" disabled={busy || !email}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent disabled:opacity-50">
            {busy && <IconLoader2 size={15} className="animate-spin" />}
            {t("Create invitation link")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

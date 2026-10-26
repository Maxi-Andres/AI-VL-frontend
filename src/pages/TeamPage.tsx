import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  IconCheck,
  IconCopy,
  IconLink,
  IconLoader2,
  IconMail,
  IconShieldHalf,
  IconUserPlus,
  IconX,
} from "@tabler/icons-react";
import type { Role } from "../api/auth";
import { getTeam, invite, makePasswordReset, revokeInvitation, updateMember } from "../api/team";
import type { Invitation, Member, Team } from "../api/team";
import { useMe } from "../auth/AuthContext";
import { ROLES, ROLE_LABEL, ROLE_RANK } from "../auth/roles";
import { initials } from "../lib/password";

// The team: who is in the company and with what role. Only theme tokens (bg-panel, text-fg,
// border-line, accent…), so the page reads right in today's dark theme and in the light one
// it will move to. The backend decides what is allowed (team.py); the page only offers it.

function ago(iso: string | null): string {
  if (!iso) return "Never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "Yesterday" : `${d} days ago`;
}

function daysLeft(iso: string): string {
  const d = Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
  return d <= 1 ? "expires today" : `expires in ${d} days`;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

export function TeamPage() {
  const me = useMe();
  const [team, setTeam] = useState<Team | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [confirm, setConfirm] = useState<{ text: string; run: () => Promise<void> } | null>(null);
  const [shared, setShared] = useState<{ title: string; to: string; link: string; valid: string } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      setTeam(await getTeam(signal));
    } catch (e) {
      if (!signal?.aborted) setError(errorText(e));
    }
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    void load(ctl.signal);
    return () => ctl.abort();
  }, [load]);

  const myRank = ROLE_RANK[me.role];
  const assignable = ROLES.filter((r) => ROLE_RANK[r.role] <= myRank);
  const editable = (m: Member) => !m.you && ROLE_RANK[m.role] <= myRank;

  const act = (text: string, run: () => Promise<void>) => setConfirm({ text, run });

  return (
    <main className="mx-auto max-w-5xl px-4 py-7 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <h1 className="m-0 text-[26px] font-extrabold tracking-[-0.025em]">Team &amp; roles</h1>
          <p className="m-0 mt-1 text-sm text-muted">
            {me.org.name}
            {team && (() => {
              const n = team.members.filter((m) => m.active).length;
              return ` · ${n} active member${n === 1 ? "" : "s"}`;
            })()}
          </p>
        </div>
        <button
          onClick={() => setInviting(true)}
          className="ml-auto flex cursor-pointer items-center gap-2 rounded-xl bg-fg px-3.5 py-2 text-[13px] font-bold text-bg shadow-card transition hover:-translate-y-px hover:shadow-lift"
        >
          <IconUserPlus size={17} />
          Invite member
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-fg">
          {error}
          <button onClick={() => setError(null)} className="ml-auto cursor-pointer text-muted hover:text-fg" aria-label="Dismiss">
            <IconX size={16} />
          </button>
        </div>
      )}

      {me.role === "owner" && team && team.members.filter((m) => m.role === "owner" && m.active).length === 1 && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warn-fg/30 bg-warn-bg px-4 py-3 text-sm">
          <IconShieldHalf size={18} className="mt-0.5 shrink-0 text-warn-fg" />
          <div>
            <b className="text-fg">You are the only owner.</b>{" "}
            <span className="text-muted">
              Add a second owner so the company is never locked out if one person leaves or
              forgets their password.
            </span>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-line bg-panel shadow-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] tracking-wider text-muted uppercase">
              <th className="px-4 py-3 font-semibold">Member</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              <th className="px-4 py-3 font-semibold">Last sign-in</th>
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
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#2fc1b1] to-[#d8cf3c] text-[11px] font-extrabold text-[#05302b]">
                      {initials(m.name || m.email)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 font-medium text-fg">
                        {m.name}
                        {m.you && <Tag>You</Tag>}
                        {!m.active && <Tag>Disabled</Tag>}
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
                          `Make ${m.name} ${ROLE_LABEL[role]}? They will be signed out and sign in again with the new role.`,
                          () => updateMember(m.id, { role }),
                        );
                      }}
                      className="cursor-pointer rounded-md border border-line bg-bg px-2 py-1 text-sm text-fg focus:border-accent focus:outline-none"
                    >
                      {assignable.map((r) => (
                        <option key={r.role} value={r.role}>{r.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-fg">{ROLE_LABEL[m.role]}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted">{ago(m.last_login_at)}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {editable(m) && m.active && (
                    <button
                      onClick={() =>
                        act(
                          `Make a password reset link for ${m.name}? Their current password keeps working until they set a new one.`,
                          async () => {
                            const r = await makePasswordReset(m.id);
                            setShared({ title: "Password reset link", to: m.email, link: r.link, valid: "24 hours" });
                          },
                        )
                      }
                      className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-bg hover:text-fg"
                    >
                      Reset password
                    </button>
                  )}
                  {editable(m) && (
                    <button
                      onClick={() =>
                        act(
                          m.active
                            ? `Disable ${m.name}? They are signed out now and cannot sign in until re-enabled.`
                            : `Enable ${m.name} again, as ${ROLE_LABEL[m.role]}?`,
                          () => updateMember(m.id, { active: !m.active }),
                        )
                      }
                      className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-bg hover:text-fg"
                    >
                      {m.active ? "Disable" : "Enable"}
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
          <h2 className="m-0 mb-2 text-sm font-semibold text-fg">Pending invitations</h2>
          <div className="overflow-hidden rounded-2xl border border-line bg-panel shadow-card">
            {team.invitations.map((inv: Invitation) => (
              <div key={inv.id} className="flex items-center gap-3 border-b border-line px-4 py-3 text-sm last:border-0">
                <IconMail size={18} className="shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-fg">{inv.email}</div>
                  <div className="text-xs text-muted">
                    {ROLE_LABEL[inv.role]} · invited by {inv.invited_by || "—"} · {daysLeft(inv.expires_at)}
                  </div>
                </div>
                <button
                  onClick={() => act(`Revoke the invitation for ${inv.email}? The link stops working.`, () => revokeInvitation(inv.id))}
                  className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium text-muted hover:bg-bg hover:text-fg"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="m-0 mb-3 text-sm font-semibold text-fg">What each role can do</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((r) => (
            <div key={r.role} className="rounded-2xl border border-line bg-panel shadow-card p-3.5">
              <div className="text-sm font-semibold text-fg">{r.label}</div>
              <div className="mt-1 text-xs leading-relaxed text-muted">{r.summary}</div>
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
    </main>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="rounded bg-bg px-1.5 py-px text-[10.5px] font-medium text-muted">{children}</span>;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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
          <button onClick={onClose} aria-label="Close" className="ml-auto cursor-pointer text-muted hover:text-fg">
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
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title="Are you sure?" onClose={onCancel}>
      <p className="m-0 mb-5 text-sm text-muted">{text}</p>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="cursor-pointer rounded-lg px-3.5 py-2 text-sm text-muted hover:text-fg">Cancel</button>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await onConfirm();
          }}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent disabled:opacity-60"
        >
          {busy && <IconLoader2 size={15} className="animate-spin" />}
          Confirm
        </button>
      </div>
    </Dialog>
  );
}

/** A one-time link (invitation or password reset) to hand over. Shown once: only its hash is
 * kept on the server, so closing this is the last chance to copy it. */
function LinkDialog({ title, to, link, valid, onClose }: {
  title: string; to: string; link: string; valid: string; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* no clipboard (plain-HTTP origin): the link is selectable on screen */
    }
  }
  return (
    <Dialog title={title} onClose={onClose}>
      <p className="m-0 mb-3 text-sm text-muted">
        Send this link to <b className="text-fg">{to}</b> by email or chat. It works once and
        expires in {valid}. For safety it is shown only now.
      </p>
      <div className="mb-5 flex items-center gap-2 rounded-lg border border-line bg-bg py-1.5 pr-1.5 pl-3">
        <IconLink size={16} className="shrink-0 text-muted" />
        <input readOnly value={link} onFocus={(e) => e.target.select()}
          className="min-w-0 flex-1 bg-transparent font-mono text-xs text-fg outline-none" />
        <button onClick={copy}
          className="flex cursor-pointer items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs font-semibold text-on-accent">
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="flex justify-end">
        <button onClick={onClose} className="cursor-pointer rounded-lg px-3.5 py-2 text-sm font-semibold text-fg hover:bg-bg">Done</button>
      </div>
    </Dialog>
  );
}

function InviteDialog({ roles, onClose }: { roles: typeof ROLES; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

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

  if (link) return <LinkDialog title="Invitation ready" to={email} link={link} valid="7 days" onClose={onClose} />;

  return (
    <Dialog title="Invite a member" onClose={onClose}>
      <form onSubmit={submit}>
        <label className="mb-1.5 block text-xs font-semibold text-muted" htmlFor="invite-email">Work email</label>
        <input
          id="invite-email" type="email" autoFocus required value={email} placeholder="name@company.com"
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
        />
        <div className="mb-1.5 text-xs font-semibold text-muted">Role</div>
        <div className="mb-4 grid gap-2">
          {roles.map((r) => (
            <label key={r.role}
              className={`flex cursor-pointer gap-3 rounded-lg border px-3 py-2.5 transition ${
                role === r.role ? "border-accent bg-accent/10" : "border-line hover:bg-bg"}`}>
              <input type="radio" name="role" value={r.role} checked={role === r.role}
                onChange={() => setRole(r.role)} className="mt-0.5 accent-[var(--color-accent)]" />
              <span>
                <span className="block text-sm font-medium text-fg">{r.label}</span>
                <span className="block text-xs text-muted">{r.summary}</span>
              </span>
            </label>
          ))}
        </div>
        {error && <p role="alert" className="m-0 mb-3 text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="cursor-pointer rounded-lg px-3.5 py-2 text-sm text-muted hover:text-fg">Cancel</button>
          <button type="submit" disabled={busy || !email}
            className="flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-on-accent disabled:opacity-50">
            {busy && <IconLoader2 size={15} className="animate-spin" />}
            Create invitation link
          </button>
        </div>
      </form>
    </Dialog>
  );
}

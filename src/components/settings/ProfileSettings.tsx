import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { IconCheck, IconLoader2, IconLock } from "@tabler/icons-react";
import { changePassword, updateProfile } from "../../api/auth";
import { useAuth, useMe } from "../../auth/AuthContext";
import { StrengthMeter } from "../../auth/AuthScreens";
import { ROLE_LABEL } from "../../auth/roles";
import { passwordStrength } from "../../lib/password";
import { Avatar } from "../ui/Avatar";
import { ColorPicker } from "../ui/ColorPicker";
import { colorOf, type ColorName } from "../../lib/colors";
import { ThemePicker } from "../layout/UserMenu";

// Settings → Profile: what is about you — how you appear to the team, how the app looks for
// you, your password. Everyone has it, whatever the role.

const input = "w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none";

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid items-center gap-3 border-b border-line px-5 py-4 last:border-0 sm:grid-cols-[220px_minmax(0,1fr)]">
      <div>
        <b className="block text-[13.5px]">{label}</b>
        {hint && <small className="block text-xs text-muted">{hint}</small>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ProfileSettings() {
  const me = useMe();
  const { setMe } = useAuth();
  const [name, setName] = useState(me.user.name);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [colorError, setColorError] = useState<string | null>(null);
  // A colour saves on the click: there is nothing to type, so nothing to confirm.
  async function pickColor(c: ColorName) {
    setColorError(null);
    try {
      setMe(await updateProfile({ color: c }));
    } catch (err) {
      setColorError(err instanceof Error ? err.message : "Could not save the colour.");
    }
  }

  async function saveName(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      setMe(await updateProfile({ name }));
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your name.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="profile" data-nav="Profile" className="scroll-mt-4">
      <h2 className="m-0 mb-1 text-lg font-extrabold tracking-[-0.015em]">Profile</h2>
      <p className="m-0 mb-3.5 text-[13px] text-muted">How you appear to your team, and how Pilot looks for you.</p>
      <div className="rounded-2xl border border-line bg-panel shadow-card">
        <Row label="You" hint="How your circle looks to the team.">
          <div className="flex items-center gap-3.5">
            <Avatar id={me.user.id} name={me.user.name || me.user.email} color={me.user.color} size={52} />
            <div className="min-w-0 text-[13px]">
              <div className="truncate font-bold">{me.user.email}</div>
              <div className="text-muted">{ROLE_LABEL[me.role]} · {me.org.name}</div>
            </div>
          </div>
        </Row>
        <Row label="Name" hint="Shown in the team list and the activity.">
          <form onSubmit={saveName} className="flex max-w-md gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required className={input} aria-label="Your name" />
            <button type="submit" disabled={saving || !name.trim() || name.trim() === me.user.name}
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-fg px-3.5 text-[13px] font-bold text-bg disabled:cursor-default disabled:opacity-40">
              {saving ? <IconLoader2 size={15} className="animate-spin" /> : saved ? <IconCheck size={15} /> : null}
              {saved ? "Saved" : "Save"}
            </button>
          </form>
          {error && <p role="alert" className="m-0 mt-2 text-[13px] text-danger">{error}</p>}
        </Row>
        <Row label="Colour" hint="Picked at random when you joined. Yours to change.">
          <ColorPicker value={colorOf(me.user.color, me.user.id)} onChange={pickColor} />
          {colorError && <p role="alert" className="m-0 mt-2 text-[13px] text-danger">{colorError}</p>}
        </Row>
        <Row label="Appearance" hint="Light, dark or follow the system. Per browser.">
          <ThemePicker className="w-max" />
        </Row>
        <Row label="Password" hint="Changing it signs you out everywhere else.">
          <PasswordForm email={me.user.email} />
        </Row>
      </div>
    </section>
  );
}

function PasswordForm({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const strength = passwordStrength(next, email);
  const mismatch = again.length > 0 && again !== next;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await changePassword(current, next);
      setDone(r.signed_out
        ? `Password changed. ${r.signed_out} other session${r.signed_out === 1 ? " was" : "s were"} signed out.`
        : "Password changed.");
      setOpen(false);
      setCurrent("");
      setNext("");
      setAgain("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the password.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => { setOpen(true); setDone(null); }}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3.5 py-2 text-[13px] font-bold transition hover:bg-subtle">
          <IconLock size={15} />Change password
        </button>
        {done && <span className="flex items-center gap-1.5 text-[13px] text-good-fg"><IconCheck size={15} />{done}</span>}
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="grid max-w-md gap-2.5">
      <input type="password" autoComplete="current-password" placeholder="Current password" required autoFocus
        value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
      <input type="password" autoComplete="new-password" placeholder="New password" required
        value={next} onChange={(e) => setNext(e.target.value)} className={input} />
      {next && <div className="text-xs text-muted"><StrengthMeter score={strength.score} label={strength.label} /></div>}
      <input type="password" autoComplete="new-password" placeholder="New password, again" required
        value={again} onChange={(e) => setAgain(e.target.value)} className={input} />
      {mismatch && <p className="m-0 text-xs text-danger">The two new passwords differ.</p>}
      {error && <p role="alert" className="m-0 text-[13px] text-danger">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => { setOpen(false); setError(null); }}
          className="cursor-pointer rounded-lg px-3.5 py-2 text-[13px] text-muted hover:text-fg">Cancel</button>
        <button type="submit" disabled={busy || !current || strength.score === 0 || next !== again}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-[13px] font-bold text-on-accent disabled:cursor-default disabled:opacity-50">
          {busy && <IconLoader2 size={15} className="animate-spin" />}
          Change password
        </button>
      </div>
    </form>
  );
}

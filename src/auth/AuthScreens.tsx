import { useEffect, useId, useState } from "react";
import type { ButtonHTMLAttributes, FormEvent, InputHTMLAttributes, ReactNode } from "react";
import {
  IconAlertCircle,
  IconArrowLeft,
  IconArrowRight,
  IconBrandGoogle,
  IconBrandWindows,
  IconBuilding,
  IconCheck,
  IconCopy,
  IconEye,
  IconEyeOff,
  IconKey,
  IconLoader2,
  IconLock,
  IconMail,
  IconPlugConnectedX,
  IconRefresh,
  IconShieldLock,
  IconUser,
  IconUsers,
} from "@tabler/icons-react";
import { AuthError, ssoStartUrl, type SsoOption } from "../api/auth";
import { lookupInvitation, lookupPasswordReset, type InvitationInfo, type ResetInfo } from "../api/team";
import { ROLES } from "./roles";
import { PASSWORD_MIN, passwordStrength } from "../lib/password";
import silkLogoOnDark from "../assets/silk-logo.webp";
import silkLogoOnLight from "../assets/silk-logo-light-bg.webp";
import { useAuth } from "./AuthContext";
import { LanguagePicker } from "../components/layout/UserMenu";
import { msg, t, useT, type Vars } from "../i18n";

// The sign-in and first-run screens: the first part of the app moved to the light redesign
// (.theme-light, see index.css). Split layout — a brand panel on the left that says what the
// product is, the form on the right. The panel hides on narrow screens; the form never does.

const SETUP_CODE_HINT = "cat ~/.pilot/setup-code";

/** What went wrong, in the language chosen now (an AuthError's text is already translated). */
function messageOf(e: unknown): string {
  if (e instanceof AuthError) {
    if (e.status === 429 && e.retryAfter) {
      const min = Math.ceil(e.retryAfter / 60);
      return min === 1
        ? t("Too many attempts. Try again in 1 minute.")
        : t("Too many attempts. Try again in {n} minutes.", { n: min });
    }
    return e.message;
  }
  return t("Could not reach the server. Check the connection and try again.");
}

/** One translatable sentence that carries a little markup, so the word order stays the
 * translator's: "<br>" breaks the line, "<em>…</em>" is the brand gradient, "<b>…</b>" bold.
 * The {values} are filled in after the markup is read, so a name never turns into markup. */
function Rich({ text, vars = {} }: { text: string; vars?: Vars }) {
  const fill = (part: string) => part.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return (
    <>
      {text.split(/(<br>|<em>.*?<\/em>|<b>.*?<\/b>)/).map((part, i) =>
        part === "<br>" ? <br key={i} />
        : part.startsWith("<em>") ? <Gradient key={i}>{fill(part.slice(4, -5))}</Gradient>
        : part.startsWith("<b>") ? <b key={i} className="text-fg">{fill(part.slice(3, -4))}</b>
        : fill(part))}
    </>
  );
}

function BrandPanel({ title, children }: { title: ReactNode; children?: ReactNode }) {
  const t = useT();
  return (
    <aside className="relative hidden flex-col overflow-hidden bg-[#0a0e14] p-12 text-white lg:flex">
      {/* Glows in the logo's two colours, and a faint grid: the room the robots work in. */}
      <div className="pointer-events-none absolute -top-40 -right-32 size-[520px] rounded-full bg-[#2fc1b1]/25 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-48 -left-24 size-[460px] rounded-full bg-[#d8cf3c]/15 blur-[120px]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at 60% 40%, #000 30%, transparent 75%)",
        }}
      />
      <img src={silkLogoOnDark} alt="Silk Technologies" className="relative h-9 w-auto self-start" />

      <div className="relative mt-auto mb-auto max-w-[520px]">
        <h2 className="text-[44px] leading-[1.06] font-extrabold tracking-[-0.035em]">{title}</h2>
        {children}
      </div>

      <ul className="relative mt-auto flex flex-wrap gap-x-6 gap-y-2 text-[13px] font-semibold text-white/75">
        <li className="flex items-center gap-2"><IconShieldLock size={17} className="text-[#5fe3d4]" />{t("Every limit enforced on the robot")}</li>
        <li className="flex items-center gap-2"><IconUsers size={17} className="text-[#5fe3d4]" />{t("Teams and roles")}</li>
        <li className="flex items-center gap-2"><IconLock size={17} className="text-[#5fe3d4]" />{t("Runs on your own server")}</li>
      </ul>
    </aside>
  );
}

function Shell({ panel, children }: { panel: ReactNode; children: ReactNode }) {
  return (
    <div className="theme-light grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {panel}
      <main className="relative flex flex-col items-center justify-center bg-panel px-6 py-12">
        {/* Before signing in, too: the language is chosen here, not only in the user menu. */}
        <div className="fixed top-5 right-5 z-20"><LanguagePicker className="shadow-card" /></div>
        <img src={silkLogoOnLight} alt="Silk Technologies" className="mb-10 h-8 w-auto lg:hidden" />
        <div className="w-full max-w-[400px] animate-rise">{children}</div>
        <p className="mt-10 text-xs text-dim">Silk Pilot</p>
      </main>
    </div>
  );
}

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: ReactNode;
  aside?: ReactNode;
  hint?: ReactNode;
  trailing?: ReactNode;
}

function Field({ label, icon, aside, hint, trailing, className = "", ...input }: FieldProps) {
  const id = useId();
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={id} className="text-[13px] font-bold">{label}</label>
        {aside}
      </div>
      <div className="flex h-11 items-center gap-2.5 rounded-xl border border-[#d9dde5] bg-panel px-3 transition focus-within:border-accent focus-within:shadow-[0_0_0_4px_rgba(31,158,145,0.14)]">
        {icon && <span className="text-dim">{icon}</span>}
        <input id={id} className={`h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-dim ${className}`} {...input} />
        {trailing}
      </div>
      {hint && <div className="mt-1.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

function PasswordField(props: Omit<FieldProps, "type" | "trailing">) {
  const t = useT();
  const [shown, setShown] = useState(false);
  return (
    <Field
      {...props}
      type={shown ? "text" : "password"}
      trailing={
        <button type="button" onClick={() => setShown((v) => !v)} className="cursor-pointer text-dim hover:text-fg"
          aria-label={shown ? t("Hide password") : t("Show password")}>
          {shown ? <IconEyeOff size={18} /> : <IconEye size={18} />}
        </button>
      }
    />
  );
}

function PrimaryButton({ busy, children, ...rest }: { busy?: boolean; children: ReactNode } &
  ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      disabled={busy || rest.disabled}
      className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-fg text-[14px] font-bold text-white shadow-[0_8px_20px_-10px_rgba(15,22,35,0.6)] transition hover:-translate-y-px hover:shadow-[0_12px_28px_-10px_rgba(15,22,35,0.6)] active:translate-y-0 disabled:cursor-default disabled:opacity-50 disabled:hover:translate-y-0"
    >
      {busy && <IconLoader2 size={18} className="animate-spin" />}
      {children}
    </button>
  );
}

function ErrorNote({ text, shakeKey }: { text: string; shakeKey: number }) {
  return (
    <div key={shakeKey} role="alert"
      className="mb-4 flex animate-shake items-start gap-2.5 rounded-xl bg-[#fdecec] px-3.5 py-3 text-[13px] font-semibold text-[#a3262c]">
      <IconAlertCircle size={18} className="mt-px shrink-0" />{text}
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Single sign-on (sso.py): the button, and what the sign-in page says when it comes back failed
// --------------------------------------------------------------------------- //
// Why the provider's round trip ended back here (?sso_error=… from the backend).
const SSO_ERRORS: Record<string, string> = {
  off: msg("Single sign-on is not turned on for this workspace."),
  provider: msg("The identity provider could not be reached or refused the request. Try again, or sign in with your password."),
  expired: msg("That sign-in took too long or was started in another browser. Try again."),
  cancelled: msg("Sign-in was cancelled."),
  token: msg("The identity provider's answer could not be verified. Ask an admin to check the single sign-on settings."),
  no_email: msg("Your account at the identity provider has no verified email address."),
  no_account: msg("{email} has no account here. Ask an admin of your workspace to invite you."),
  linked_elsewhere: msg("{email} is already linked to another account at the identity provider."),
  disabled: msg("Your access to this workspace was switched off. Ask an admin."),
};

/** The failure the provider's round trip came back with, once; the address bar is cleaned so a
 * reload does not show it again. Kept in English, translated where shown. */
function takeSsoError(): { text: string; email: string } | null {
  const q = new URLSearchParams(location.search);
  const reason = q.get("sso_error");
  if (!reason) return null;
  history.replaceState(null, "", location.pathname + location.hash);
  return { text: SSO_ERRORS[reason] ?? SSO_ERRORS.provider, email: q.get("email") ?? "" };
}

function SsoButton({ sso, remember, children }: { sso: SsoOption; remember: boolean; children: ReactNode }) {
  const [going, setGoing] = useState(false);
  const Icon = sso.provider === "microsoft" ? IconBrandWindows : sso.provider === "google" ? IconBrandGoogle : IconKey;
  return (
    <a href={ssoStartUrl(remember)} onClick={() => setGoing(true)}
      className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-[#0f1623] text-[14px] font-bold text-white shadow-[0_8px_20px_-10px_rgba(15,22,35,.7)] transition hover:-translate-y-px active:scale-[0.99]">
      {going ? <IconLoader2 size={18} className="animate-spin" /> : <Icon size={18} />}
      {children}
    </a>
  );
}

function OrLine({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs font-semibold text-dim">
      <span className="h-px flex-1 bg-[#e3e6ec]" />{children}<span className="h-px flex-1 bg-[#e3e6ec]" />
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Sign in
// --------------------------------------------------------------------------- //
export function SignInScreen({ orgName, expired }: { orgName: string | null; expired: boolean }) {
  const t = useT();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [forgot, setForgot] = useState(false);
  const { sso } = useAuth();
  const [ssoError] = useState(takeSsoError);
  // With single sign-on on, the password is the way in when the provider is down: one click
  // away instead of the first thing on the page.
  const [withPassword, setWithPassword] = useState(false);
  const showForm = !sso || withPassword;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password, remember);
    } catch (err) {
      setError(messageOf(err));
      setTries((n) => n + 1);
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell panel={<BrandPanel title={<Rich text={t("Operate every robot<br>from <em>one place.</em>")} />}>
      <p className="mt-4 max-w-[440px] text-[15px] text-white/65">
        {t("Live video, AI perception and safe teleoperation for robots — on your own server.")}
      </p>
    </BrandPanel>}>
      <h1 className="text-[26px] font-extrabold tracking-[-0.025em]">
        {orgName ? t("Sign in to {org}", { org: orgName }) : t("Sign in to Pilot")}
      </h1>
      <p className="mt-1.5 mb-7 text-muted">{t("Welcome back. Use your work account.")}</p>

      {expired && !error && !ssoError && (
        <div className="mb-4 rounded-xl bg-[#e4f5f2] px-3.5 py-3 text-[13px] font-semibold text-[#14695f]">
          {t("Your session ended. Sign in again to continue.")}
        </div>
      )}
      {error && <ErrorNote text={error} shakeKey={tries} />}
      {ssoError && !error && <ErrorNote text={t(ssoError.text, { email: ssoError.email })} shakeKey={0} />}

      {sso && (
        <>
          <SsoButton sso={sso} remember={remember}>{t("Sign in with {provider}", { provider: t(sso.label) })}</SsoButton>
          {!withPassword && (
            <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-[13px] text-muted select-none">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                className="size-4 accent-[#0f1623]" />
              {t("Keep me signed in on this device for 30 days")}
            </label>
          )}
          <OrLine>
            {withPassword ? t("or with your email") : (
              <button type="button" onClick={() => setWithPassword(true)}
                className="cursor-pointer font-bold text-accent hover:underline">{t("Sign in with email and password")}</button>
            )}
          </OrLine>
        </>
      )}

      {showForm && <form onSubmit={submit} noValidate>
        <Field label={t("Work email")} icon={<IconMail size={18} />} type="email" autoComplete="username"
          autoFocus required placeholder={t("name@company.com")} value={email}
          onChange={(e) => setEmail(e.target.value)} />
        <PasswordField label={t("Password")} icon={<IconLock size={18} />} autoComplete="current-password"
          required value={password} onChange={(e) => setPassword(e.target.value)}
          aside={<button type="button" onClick={() => setForgot((v) => !v)}
            className="cursor-pointer text-[12.5px] font-bold text-accent hover:underline">{t("Forgot?")}</button>}
          hint={forgot && (orgName
            ? t("Ask an admin of {org} for a password reset link.", { org: orgName })
            : t("Ask an admin of your workspace for a password reset link."))} />
        <label className="mt-1 mb-6 flex cursor-pointer items-center gap-2.5 text-[13px] text-muted select-none">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
            className="size-4 accent-[#0f1623]" />
          {t("Keep me signed in on this device for 30 days")}
        </label>
        <PrimaryButton type="submit" busy={busy} disabled={!email || !password}>
          {busy ? t("Signing in…") : t("Sign in")}
        </PrimaryButton>
      </form>}
      <p className="mt-6 text-center text-xs text-dim">
        {t("No account yet? Ask your workspace admin for an invitation.")}
      </p>
    </Shell>
  );
}

function Gradient({ children }: { children: ReactNode }) {
  return <span className="bg-gradient-to-r from-[#2fc1b1] via-[#54bbb0] to-[#d8cf3c] bg-clip-text text-transparent">{children}</span>;
}

// --------------------------------------------------------------------------- //
// First-run setup
// --------------------------------------------------------------------------- //
const STEPS = [msg("Verify server"), msg("Company"), msg("Your account")];

function Stepper({ step }: { step: number }) {
  const t = useT();
  return (
    <ol className="mb-8 flex items-center gap-2">
      {STEPS.map((label, i) => (
        <li key={label} className="flex flex-1 items-center gap-2">
          <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-extrabold transition ${
            i < step ? "bg-accent text-white" : i === step ? "bg-fg text-white" : "bg-[#eef0f3] text-dim"}`}>
            {i < step ? <IconCheck size={15} stroke={3} /> : i + 1}
          </span>
          <span className={`hidden text-[12.5px] font-bold sm:block ${i <= step ? "text-fg" : "text-dim"}`}>{t(label)}</span>
          {i < STEPS.length - 1 && <span className={`h-px flex-1 ${i < step ? "bg-accent" : "bg-line"}`} />}
        </li>
      ))}
    </ol>
  );
}

export function SetupScreen() {
  const t = useT();
  const { setUp } = useAuth();
  const [step, setStep] = useState(0);
  const [code, setCode] = useState("");
  const [org, setOrg] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [copied, setCopied] = useState(false);

  const strength = passwordStrength(password, email);
  const codeOk = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code);
  const accountOk = name.trim() && /\S+@\S+\.\S+/.test(email) && strength.score > 0 && password === confirm;

  function formatCode(raw: string) {
    const c = raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
  }

  function next(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStep((s) => s + 1);
  }

  async function finish(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await setUp({ setup_code: code, org_name: org.trim(), name: name.trim(), email, password });
    } catch (err) {
      setError(messageOf(err));
      setTries((n) => n + 1);
      // A wrong code is only found out at the end: take the person back to where it is fixed.
      if (err instanceof AuthError && err.status === 403) setStep(0);
    } finally {
      setBusy(false);
    }
  }

  async function copyHint() {
    try {
      await navigator.clipboard.writeText(SETUP_CODE_HINT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard needs a secure context; the command is on screen anyway */
    }
  }

  return (
    <Shell panel={<BrandPanel title={<Rich text={t("Let's set up<br><em>Silk Pilot.</em>")} />}>
      <p className="mt-4 max-w-[440px] text-[15px] text-white/65">
        {t("Three quick steps. You will be the owner of this workspace: after this, you invite your team and decide what each person can do.")}
      </p>
    </BrandPanel>}>
      <Stepper step={step} />
      {error && <ErrorNote text={error} shakeKey={tries} />}

      {step === 0 && (
        <form onSubmit={next} key="s0" className="animate-rise">
          <h1 className="text-[24px] font-extrabold tracking-[-0.025em]">{t("Verify this server")}</h1>
          <p className="mt-1.5 mb-6 text-muted">
            {t("So that only someone with access to the server can claim it, it wrote a one-time setup code when it started. On the server, run:")}
          </p>
          <div className="mb-5 flex items-center gap-2 rounded-xl bg-[#0f1623] py-2 pr-2 pl-4 font-mono text-[13px] text-[#c9f2ec]">
            <span className="flex-1">{SETUP_CODE_HINT}</span>
            <button type="button" onClick={copyHint} aria-label={t("Copy command")}
              className="grid size-8 cursor-pointer place-items-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white">
              {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
            </button>
          </div>
          <Field label={t("Setup code")} icon={<IconKey size={18} />} autoFocus placeholder="XXXX-XXXX"
            autoComplete="off" spellCheck={false} value={code}
            className="font-mono tracking-[0.2em] uppercase"
            onChange={(e) => setCode(formatCode(e.target.value))} />
          <PrimaryButton type="submit" disabled={!codeOk}>{t("Continue")}<IconArrowRight size={18} /></PrimaryButton>
        </form>
      )}

      {step === 1 && (
        <form onSubmit={next} key="s1" className="animate-rise">
          <h1 className="text-[24px] font-extrabold tracking-[-0.025em]">{t("Your company")}</h1>
          <p className="mt-1.5 mb-6 text-muted">{t("The workspace your team signs in to. You can rename it later.")}</p>
          <Field label={t("Company name")} icon={<IconBuilding size={18} />} autoFocus required
            autoComplete="organization" placeholder={t("Acme Logistics")} maxLength={120} value={org}
            onChange={(e) => setOrg(e.target.value)} />
          <div className="flex gap-3">
            <BackButton onClick={() => setStep(0)} />
            <PrimaryButton type="submit" disabled={!org.trim()}>{t("Continue")}<IconArrowRight size={18} /></PrimaryButton>
          </div>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={finish} key="s2" className="animate-rise">
          <h1 className="text-[24px] font-extrabold tracking-[-0.025em]">{t("Your account")}</h1>
          <p className="mt-1.5 mb-6 text-muted">
            {org.trim()
              ? <Rich text={t("You will be the <b>owner</b> of {org}.")} vars={{ org: org.trim() }} />
              : <Rich text={t("You will be the <b>owner</b> of the workspace.")} />}
          </p>
          <Field label={t("Full name")} icon={<IconUser size={18} />} autoFocus required autoComplete="name"
            maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          <Field label={t("Work email")} icon={<IconMail size={18} />} type="email" required autoComplete="username"
            placeholder={t("name@company.com")} value={email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordField label={t("Password")} icon={<IconLock size={18} />} autoComplete="new-password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
            hint={<StrengthMeter score={strength.score} label={strength.label} />} />
          <PasswordField label={t("Confirm password")} icon={<IconLock size={18} />} autoComplete="new-password" required
            value={confirm} onChange={(e) => setConfirm(e.target.value)}
            hint={confirm && confirm !== password ? <span className="text-danger">{t("The passwords do not match")}</span> : null} />
          <div className="mt-2 flex gap-3">
            <BackButton onClick={() => setStep(1)} />
            <PrimaryButton type="submit" busy={busy} disabled={!accountOk}>
              {busy ? t("Creating…") : t("Create workspace")}
            </PrimaryButton>
          </div>
        </form>
      )}
    </Shell>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
    <button type="button" onClick={onClick} aria-label={t("Back")}
      className="grid h-12 w-14 shrink-0 cursor-pointer place-items-center rounded-xl border border-[#d9dde5] text-muted transition hover:text-fg">
      <IconArrowLeft size={18} />
    </button>
  );
}

/** Also used by Settings → Profile, so the empty track is a theme token, not a light grey. */
export function StrengthMeter({ score, label }: { score: number; label: string }) {
  const t = useT();
  const colors = ["#d9dde5", "#d93f45", "#c97a10", "#1f9e91", "#1f9e91"];
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className="h-1.5 flex-1 rounded-full transition-colors duration-300"
            style={{ background: score >= i ? colors[score] : "var(--color-subtle)" }} />
        ))}
      </div>
      <span className="w-40 text-right">{t(label, { n: PASSWORD_MIN })}</span>
    </div>
  );
}

// --------------------------------------------------------------------------- //
// Joining through an invitation
// --------------------------------------------------------------------------- //
function tokenFromHash(): string {
  return new URLSearchParams(location.hash.replace(/^#/, "")).get("token") ?? "";
}

export function InviteScreen() {
  const t = useT();
  const { status, acceptInvitation, signOut } = useAuth();
  const [token] = useState(tokenFromHash);
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(token ? null : t("This invitation link is incomplete."));
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  const { sso } = useAuth();

  useEffect(() => {
    if (!token) return;
    let live = true;
    lookupInvitation(token)
      .then((i) => live && setInfo(i))
      .catch((e) => live && setLookupError(messageOf(e)));
    return () => {
      live = false;
    };
  }, [token]);

  const strength = passwordStrength(password, info?.email ?? "");
  const ok = name.trim() && strength.score > 0 && password === confirm;
  const role = ROLES.find((r) => r.role === info?.role);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await acceptInvitation(token, name.trim(), password, remember);
    } catch (err) {
      setError(messageOf(err));
      setTries((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  const panel = (
    <BrandPanel title={<Rich text={t("Welcome to<br><em>{org}.</em>")} vars={{ org: info?.org_name ?? "Silk Pilot" }} />}>
      <p className="mt-4 max-w-[440px] text-[15px] text-white/65">
        {t("Create your account to join your team on Silk Pilot.")}
      </p>
    </BrandPanel>
  );

  if (status.kind === "signed-in") {
    return (
      <Shell panel={panel}>
        <h1 className="text-[24px] font-extrabold tracking-[-0.025em]">{t("You are already signed in")}</h1>
        <p className="mt-1.5 mb-6 text-muted">
          <Rich text={t("This browser is signed in as <b>{email}</b>. To accept this invitation as someone else, sign out first.")}
            vars={{ email: status.me.user.email }} />
        </p>
        <PrimaryButton onClick={() => void signOut()}>{t("Sign out and continue")}</PrimaryButton>
        <a href="/" className="mt-4 block text-center text-[13px] font-bold text-accent hover:underline">
          {t("Stay signed in and go to the app")}
        </a>
      </Shell>
    );
  }

  if (lookupError) {
    return (
      <Shell panel={panel}>
        <span className="mb-5 grid size-12 place-items-center rounded-xl bg-[#fdecec] text-danger">
          <IconAlertCircle size={24} />
        </span>
        <h1 className="text-[24px] font-extrabold tracking-[-0.025em]">{t("This link does not work")}</h1>
        <p className="mt-1.5 mb-6 text-muted">{lookupError}</p>
        <a href="/" className="flex h-12 w-full items-center justify-center rounded-xl border border-[#d9dde5] text-[14px] font-bold">
          {t("Go to sign in")}
        </a>
      </Shell>
    );
  }

  if (!info) {
    return (
      <Shell panel={panel}>
        <div className="flex items-center gap-3 text-muted"><IconLoader2 size={18} className="animate-spin" />{t("Checking your invitation…")}</div>
      </Shell>
    );
  }

  return (
    <Shell panel={panel}>
      <h1 className="text-[24px] font-extrabold tracking-[-0.025em]">{t("Join {org}", { org: info.org_name })}</h1>
      <p className="mt-1.5 mb-5 text-muted">
        {info.invited_by
          ? <Rich text={t("{name} invited you as <b>{role}</b>.")} vars={{ name: info.invited_by, role: role ? t(role.label) : info.role }} />
          : <Rich text={t("You were invited as <b>{role}</b>.")} vars={{ role: role ? t(role.label) : info.role }} />}
      </p>
      {role && (
        <div className="mb-6 rounded-xl bg-bg px-3.5 py-3 text-[13px] text-muted">{t(role.summary)}</div>
      )}
      {error && <ErrorNote text={error} shakeKey={tries} />}
      {sso && (
        <>
          {/* The provider signs in the address this invitation is for, and that is what joins. */}
          <SsoButton sso={sso} remember={remember}>{t("Join with {provider}", { provider: t(sso.label) })}</SsoButton>
          <p className="mt-2 text-center text-xs text-dim">
            {t("Use the {provider} account for {email}.", { provider: t(sso.label), email: info.email })}
          </p>
          <OrLine>{t("or create a password")}</OrLine>
        </>
      )}
      <form onSubmit={submit} noValidate>
        <Field label={t("Work email")} icon={<IconMail size={18} />} value={info.email} readOnly
          className="text-muted" autoComplete="username" />
        <Field label={t("Full name")} icon={<IconUser size={18} />} autoFocus required autoComplete="name"
          maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        <PasswordField label={t("Password")} icon={<IconLock size={18} />} autoComplete="new-password" required
          value={password} onChange={(e) => setPassword(e.target.value)}
          hint={<StrengthMeter score={strength.score} label={strength.label} />} />
        <PasswordField label={t("Confirm password")} icon={<IconLock size={18} />} autoComplete="new-password" required
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          hint={confirm && confirm !== password ? <span className="text-danger">{t("The passwords do not match")}</span> : null} />
        <label className="mt-1 mb-6 flex cursor-pointer items-center gap-2.5 text-[13px] text-muted select-none">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
            className="size-4 accent-[#0f1623]" />
          {t("Keep me signed in on this device for 30 days")}
        </label>
        <PrimaryButton type="submit" busy={busy} disabled={!ok}>
          {busy ? t("Creating your account…") : t("Create account and join")}
        </PrimaryButton>
      </form>
    </Shell>
  );
}

// --------------------------------------------------------------------------- //
// Setting a new password through a reset link
// --------------------------------------------------------------------------- //
export function ResetPasswordScreen() {
  const t = useT();
  const { completePasswordReset } = useAuth();
  const [token] = useState(tokenFromHash);
  const [info, setInfo] = useState<ResetInfo | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(token ? null : t("This reset link is incomplete."));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (!token) return;
    let live = true;
    lookupPasswordReset(token)
      .then((i) => live && setInfo(i))
      .catch((e) => live && setLookupError(messageOf(e)));
    return () => {
      live = false;
    };
  }, [token]);

  const strength = passwordStrength(password, info?.email ?? "");
  const ok = strength.score > 0 && password === confirm;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await completePasswordReset(token, password, remember);
    } catch (err) {
      setError(messageOf(err));
      setTries((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  const panel = (
    <BrandPanel title={<Rich text={t("Back in,<br><em>in a moment.</em>")} />}>
      <p className="mt-4 max-w-[440px] text-[15px] text-white/65">
        {t("Choose a new password. Every other device signed in to your account is signed out.")}
      </p>
    </BrandPanel>
  );

  if (lookupError) {
    return (
      <Shell panel={panel}>
        <span className="mb-5 grid size-12 place-items-center rounded-xl bg-[#fdecec] text-danger">
          <IconAlertCircle size={24} />
        </span>
        <h1 className="text-[24px] font-extrabold tracking-[-0.025em]">{t("This link does not work")}</h1>
        <p className="mt-1.5 mb-6 text-muted">{lookupError}</p>
        <a href="/" className="flex h-12 w-full items-center justify-center rounded-xl border border-[#d9dde5] text-[14px] font-bold">
          {t("Go to sign in")}
        </a>
      </Shell>
    );
  }

  if (!info) {
    return (
      <Shell panel={panel}>
        <div className="flex items-center gap-3 text-muted"><IconLoader2 size={18} className="animate-spin" />{t("Checking your link…")}</div>
      </Shell>
    );
  }

  return (
    <Shell panel={panel}>
      <h1 className="text-[24px] font-extrabold tracking-[-0.025em]">{t("Set a new password")}</h1>
      <p className="mt-1.5 mb-6 text-muted">
        <Rich text={t("For <b>{email}</b> at {org}.")} vars={{ email: info.email, org: info.org_name }} />
      </p>
      {error && <ErrorNote text={error} shakeKey={tries} />}
      <form onSubmit={submit} noValidate>
        <input type="email" value={info.email} autoComplete="username" readOnly hidden />
        <PasswordField label={t("New password")} icon={<IconLock size={18} />} autoComplete="new-password" autoFocus required
          value={password} onChange={(e) => setPassword(e.target.value)}
          hint={<StrengthMeter score={strength.score} label={strength.label} />} />
        <PasswordField label={t("Confirm password")} icon={<IconLock size={18} />} autoComplete="new-password" required
          value={confirm} onChange={(e) => setConfirm(e.target.value)}
          hint={confirm && confirm !== password ? <span className="text-danger">{t("The passwords do not match")}</span> : null} />
        <label className="mt-1 mb-6 flex cursor-pointer items-center gap-2.5 text-[13px] text-muted select-none">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
            className="size-4 accent-[#0f1623]" />
          {t("Keep me signed in on this device for 30 days")}
        </label>
        <PrimaryButton type="submit" busy={busy} disabled={!ok}>
          {busy ? t("Saving…") : t("Save and sign in")}
        </PrimaryButton>
      </form>
    </Shell>
  );
}

// --------------------------------------------------------------------------- //
// Loading / unreachable
// --------------------------------------------------------------------------- //
export function AuthLoading() {
  return (
    <div className="theme-light grid min-h-dvh place-items-center">
      <img src={silkLogoOnLight} alt="Silk Technologies" className="h-9 w-auto animate-pulse" />
    </div>
  );
}

export function AuthUnreachable() {
  const t = useT();
  const { retry } = useAuth();
  return (
    <div className="theme-light relative grid min-h-dvh place-items-center px-6">
      <div className="fixed top-5 right-5 z-20"><LanguagePicker className="shadow-card" /></div>
      <div className="max-w-sm animate-rise text-center">
        <span className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-[#fdecec] text-danger">
          <IconPlugConnectedX size={28} />
        </span>
        <h1 className="text-[22px] font-extrabold">{t("Can't reach the Pilot server")}</h1>
        <p className="mt-2 mb-6 text-muted">{t("The page loaded, but the server behind it did not answer. It may be restarting.")}</p>
        <button onClick={retry}
          className="mx-auto flex cursor-pointer items-center gap-2 rounded-xl bg-fg px-5 py-3 text-[14px] font-bold text-white">
          <IconRefresh size={18} />{t("Try again")}
        </button>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import {
  IconActivity,
  IconBuildingWarehouse,
  IconCheck,
  IconKey,
  IconLock,
  IconMapPin,
  IconMapPinPlus,
  IconPlugConnected,
  IconPlugConnectedX,
  IconRobot,
  IconUserCheck,
  IconUserCircle,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react";
import type { ActivityEvent } from "../../api/fleet";
import type { Role } from "../../api/auth";
import { ROLE_LABEL } from "../../auth/roles";
import { t, useT } from "../../i18n";
import { TINT } from "../ui/tones";
import { rich } from "../../i18n/rich";

// One line of the company's activity (the audit log, the notable part): Fleet shows the
// latest few, Settings → Activity all of it.

/** "2 h", "5 min", "3 d" — how long a state has held, for a badge. */
export function span(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("now");
  if (s < 3600) return t("{n} min", { n: Math.floor(s / 60) });
  if (s < 86400) return t("{n} h", { n: Math.floor(s / 3600) });
  return t("{n} d", { n: Math.floor(s / 86400) });
}

export function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return t("just now");
  if (s < 3600) return t("{n} min ago", { n: Math.floor(s / 60) });
  if (s < 86400) return t("{n} h ago", { n: Math.floor(s / 3600) });
  const d = Math.floor(s / 86400);
  return d === 1 ? t("yesterday") : t("{n} days ago", { n: d });
}

type Tr = ReturnType<typeof useT>;

/** A translated sentence with its {placeholders} swapped for nodes — the bold actor stays
 * bold wherever the language puts it. */

/** The role an invitation named, as people read it (the log stores the id). */
function roleName(role: unknown, tr: Tr): string {
  const label = ROLE_LABEL[role as Role];
  return label ? tr(label) : String(role);
}

// What each audited change reads as in the feed: whole sentences, so each language can order
// them its own way.
const FEED: Record<string, { icon: typeof IconActivity; tint: keyof typeof TINT; text: (e: ActivityEvent, t: Tr) => ReactNode }> = {
  "auth.setup": { icon: IconCheck, tint: "good", text: (e, t) => rich(t("{actor} set up {target}"), { actor: <b>{e.actor}</b>, target: e.target }) },
  "auth.password_reset": { icon: IconKey, tint: "warn", text: (e, t) => rich(t("Password reset for {target}"), { target: <b>{e.target}</b> }) },
  "auth.password_changed": { icon: IconLock, tint: "warn", text: (e, t) => rich(t("{actor} changed their password"), { actor: <b>{e.actor}</b> }) },
  "auth.profile_changed": { icon: IconUserCircle, tint: "info", text: (e, t) => rich(t("{actor} updated their profile"), { actor: <b>{e.actor}</b> }) },
  "team.invite": { icon: IconUserPlus, tint: "info", text: (e, t) => rich(e.detail.role ? t("{actor} invited {target} as {role}") : t("{actor} invited {target}"),
    { actor: <b>{e.actor}</b>, target: e.target, role: roleName(e.detail.role, t) }) },
  "team.invitation_accepted": { icon: IconUserCheck, tint: "good", text: (e, t) => rich(e.detail.role ? t("{actor} joined as {role}") : t("{actor} joined"),
    { actor: <b>{e.actor}</b>, role: roleName(e.detail.role, t) }) },
  "team.member_changed": { icon: IconUsers, tint: "warn", text: (e, t) => rich(t("{actor} changed {target}'s access"), { actor: <b>{e.actor}</b>, target: e.target }) },
  "fleet.site_created": { icon: IconMapPinPlus, tint: "info", text: (e, t) => rich(t("{actor} added the site {target}"), { actor: <b>{e.actor}</b>, target: e.target }) },
  "fleet.site_changed": { icon: IconMapPin, tint: "info", text: (e, t) => rich(t("{actor} edited {target}"), { actor: <b>{e.actor}</b>, target: e.target }) },
  "fleet.site_deleted": { icon: IconMapPin, tint: "bad", text: (e, t) => rich(t("{actor} deleted the site {target}"), { actor: <b>{e.actor}</b>, target: e.target }) },
  "fleet.plan_uploaded": { icon: IconBuildingWarehouse, tint: "info", text: (e, t) => rich(t("{actor} uploaded {target}'s floor plan"), { actor: <b>{e.actor}</b>, target: e.target }) },
  "fleet.robot_added": { icon: IconRobot, tint: "good", text: (e, t) => rich(t("{actor} registered {target}"), { actor: <b>{e.actor}</b>, target: e.target }) },
  "fleet.robot_changed": { icon: IconRobot, tint: "info", text: (e, t) => rich(t("{actor} edited {target}"), { actor: <b>{e.actor}</b>, target: e.target }) },
  "robot.online": { icon: IconPlugConnected, tint: "good", text: (e, t) => rich(t("{target} came back online"), { target: <b>{e.target}</b> }) },
  "robot.offline": { icon: IconPlugConnectedX, tint: "bad", text: (e, t) => rich(t("{target} went offline"), { target: <b>{e.target}</b> }) },
  "fleet.robot_removed": { icon: IconRobot, tint: "bad", text: (e, t) => rich(t("{actor} removed {target}"), { actor: <b>{e.actor}</b>, target: e.target }) },
};

export function ActivityRow({ ev, unread = false }: { ev: ActivityEvent; unread?: boolean }) {
  // The hook re-renders the row in a new language; ago() reads the language at that render.
  const tr = useT();
  const f = FEED[ev.action] ?? { icon: IconActivity, tint: "info" as const, text: (e: ActivityEvent) => <>{e.action} {e.target}</> };
  const Icon = f.icon;
  return (
    <li className={`relative flex gap-3 border-b border-line py-3 last:border-0 ${
      unread ? "before:absolute before:top-1/2 before:-left-2 before:size-1.5 before:-translate-y-1/2 before:rounded-full before:bg-accent" : ""}`}>
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${TINT[f.tint]}`}><Icon size={16} /></span>
      <div className="min-w-0 text-[13px]">
        <p className="m-0">{f.text(ev, tr)}</p>
        <time dateTime={ev.at} title={new Date(ev.at).toLocaleString()} className="text-xs text-dim">{ago(ev.at)}</time>
      </div>
    </li>
  );
}

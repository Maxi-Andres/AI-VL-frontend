import type { ReactNode } from "react";
import {
  IconActivity,
  IconBuildingWarehouse,
  IconCheck,
  IconKey,
  IconLock,
  IconMapPin,
  IconMapPinPlus,
  IconRobot,
  IconUserCheck,
  IconUserCircle,
  IconUserPlus,
  IconUsers,
} from "@tabler/icons-react";
import type { ActivityEvent } from "../../api/fleet";
import { TINT } from "../ui/tones";

// One line of the company's activity (the audit log, the notable part): Fleet shows the
// latest few, Settings → Activity all of it.

export function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

// What each audited change reads as in the feed.
const FEED: Record<string, { icon: typeof IconActivity; tint: keyof typeof TINT; text: (e: ActivityEvent) => ReactNode }> = {
  "auth.setup": { icon: IconCheck, tint: "good", text: (e) => <><b>{e.actor}</b> set up {e.target}</> },
  "auth.password_reset": { icon: IconKey, tint: "warn", text: (e) => <>Password reset for <b>{e.target}</b></> },
  "auth.password_changed": { icon: IconLock, tint: "warn", text: (e) => <><b>{e.actor}</b> changed their password</> },
  "auth.profile_changed": { icon: IconUserCircle, tint: "info", text: (e) => <><b>{e.actor}</b> updated their profile</> },
  "team.invite": { icon: IconUserPlus, tint: "info", text: (e) => <><b>{e.actor}</b> invited {e.target}{e.detail.role ? ` as ${String(e.detail.role)}` : ""}</> },
  "team.invitation_accepted": { icon: IconUserCheck, tint: "good", text: (e) => <><b>{e.actor}</b> joined{e.detail.role ? ` as ${String(e.detail.role)}` : ""}</> },
  "team.member_changed": { icon: IconUsers, tint: "warn", text: (e) => <><b>{e.actor}</b> changed {e.target}'s access</> },
  "fleet.site_created": { icon: IconMapPinPlus, tint: "info", text: (e) => <><b>{e.actor}</b> added the site {e.target}</> },
  "fleet.site_changed": { icon: IconMapPin, tint: "info", text: (e) => <><b>{e.actor}</b> edited {e.target}</> },
  "fleet.site_deleted": { icon: IconMapPin, tint: "bad", text: (e) => <><b>{e.actor}</b> deleted the site {e.target}</> },
  "fleet.plan_uploaded": { icon: IconBuildingWarehouse, tint: "info", text: (e) => <><b>{e.actor}</b> uploaded {e.target}'s floor plan</> },
  "fleet.robot_added": { icon: IconRobot, tint: "good", text: (e) => <><b>{e.actor}</b> registered {e.target}</> },
  "fleet.robot_changed": { icon: IconRobot, tint: "info", text: (e) => <><b>{e.actor}</b> edited {e.target}</> },
  "fleet.robot_removed": { icon: IconRobot, tint: "bad", text: (e) => <><b>{e.actor}</b> removed {e.target}</> },
};

export function ActivityRow({ ev }: { ev: ActivityEvent }) {
  const f = FEED[ev.action] ?? { icon: IconActivity, tint: "info" as const, text: (e: ActivityEvent) => <>{e.action} {e.target}</> };
  const Icon = f.icon;
  return (
    <li className="flex gap-3 border-b border-line py-3 last:border-0">
      <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${TINT[f.tint]}`}><Icon size={16} /></span>
      <div className="min-w-0 text-[13px]">
        <p className="m-0">{f.text(ev)}</p>
        <time dateTime={ev.at} title={new Date(ev.at).toLocaleString()} className="text-xs text-dim">{ago(ev.at)}</time>
      </div>
    </li>
  );
}

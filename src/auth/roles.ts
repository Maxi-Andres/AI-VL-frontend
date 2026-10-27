import type { Role } from "../api/auth";
import { msg } from "../i18n";

/** How each role reads to people. Mirrors auth.PERMISSIONS in the backend. Marked with msg():
 * translate with t() where they are shown. */
export const ROLES: { role: Role; label: string; summary: string }[] = [
  { role: "viewer", label: msg("Viewer"), summary: msg("Watches video and telemetry. Cannot move or change anything.") },
  { role: "operator", label: msg("Operator"), summary: msg("Also asks the AI, drives the robot, runs actions and moves joints.") },
  { role: "admin", label: msg("Admin"), summary: msg("Also changes robot and video settings, and manages the team.") },
  { role: "owner", label: msg("Owner"), summary: msg("Everything, including the company itself and other owners.") },
];

export const ROLE_LABEL: Record<Role, string> = {
  viewer: msg("Viewer"), operator: msg("Operator"), admin: msg("Admin"), owner: msg("Owner"),
};

export const ROLE_RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2, owner: 3 };

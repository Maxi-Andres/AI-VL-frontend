import type { Role } from "../api/auth";

/** How each role reads to people. Mirrors auth.PERMISSIONS in the backend. */
export const ROLES: { role: Role; label: string; summary: string }[] = [
  { role: "viewer", label: "Viewer", summary: "Watches video and telemetry. Cannot move or change anything." },
  { role: "operator", label: "Operator", summary: "Also asks the AI, drives the robot, runs actions and moves joints." },
  { role: "admin", label: "Admin", summary: "Also changes robot and video settings, and manages the team." },
  { role: "owner", label: "Owner", summary: "Everything, including the company itself and other owners." },
];

export const ROLE_LABEL: Record<Role, string> = {
  viewer: "Viewer", operator: "Operator", admin: "Admin", owner: "Owner",
};

export const ROLE_RANK: Record<Role, number> = { viewer: 0, operator: 1, admin: 2, owner: 3 };

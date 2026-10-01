import type { SkillInfo } from "../../api/backend";
import type { TransportMap } from "../../hooks/useRobotTransports";

/**
 * The skills of a robot's catalog its current transport CANNOT deliver.
 *
 * The catalog lists everything the robot can do; over the relay only the executor's allowlist
 * gets through (`allowed_skills`, per robot) and the rest comes back "not available over the
 * relay". Those stay on the pad, marked and disabled, so the operator sees what exists and
 * what is still missing from the relay instead of pressing buttons that can only fail
 * (2026-10-01: stretch, heart and pose on the Go2 over LTE).
 *
 * Nothing is marked while the transports are unknown (null) or for a robot on DDS (no
 * `allowed_skills`): there the whole catalog gets through.
 */
export function unsendableSkills(
  skills: Record<string, SkillInfo>,
  transports: TransportMap | null,
  robot: string,
): Set<string> {
  const allowed = transports?.[robot]?.allowed_skills;
  if (!allowed) return new Set();
  const keep = new Set(allowed);
  return new Set(Object.keys(skills).filter((name) => !keep.has(name)));
}

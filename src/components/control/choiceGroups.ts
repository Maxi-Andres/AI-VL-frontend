/**
 * Split a choice skill's values into the catalog's groups, in the catalog's order.
 *
 * The G1's arm actions each need a locomotion mode (Run, Walk or Run, Walk), and the pad shows
 * that as one subheading per group (2026-10-01: from Walk the robot silently ignores the Run
 * ones). A value in no group is never dropped — it lands in a trailing untitled group. No
 * `groups` = one untitled group with every value, i.e. the flat grid as before.
 */
export function choiceGroups(
  values: string[],
  groups?: Record<string, string[]>,
): { title: string | null; values: string[] }[] {
  if (!groups) return [{ title: null, values }];
  const present = new Set(values);
  const placed = new Set<string>();
  const out: { title: string | null; values: string[] }[] = [];
  for (const [title, members] of Object.entries(groups)) {
    const vs = members.filter((v) => present.has(v) && !placed.has(v));
    vs.forEach((v) => placed.add(v));
    if (vs.length) out.push({ title, values: vs });
  }
  const rest = values.filter((v) => !placed.has(v));
  if (rest.length) out.push({ title: null, values: rest });
  return out;
}

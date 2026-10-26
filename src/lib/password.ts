// Password feedback for the setup and (later) invitation screens. The backend enforces the
// only hard rule — at least 12 characters, not the email — this just tells people early.
export const PASSWORD_MIN = 12;

export interface Strength {
  /** 0 = unusable (too short), 1 weak, 2 fair, 3 good, 4 strong. */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}

/** Length counts most (NIST 800-63B): no composition rules, but variety earns a little. */
export function passwordStrength(pw: string, email = ""): Strength {
  const local = email.split("@")[0]?.toLowerCase() ?? "";
  if (pw.length < PASSWORD_MIN) return { score: 0, label: `At least ${PASSWORD_MIN} characters` };
  if (local && pw.toLowerCase() === local) return { score: 0, label: "Cannot be your email" };
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const points = (pw.length >= 16 ? 2 : 1) + (pw.length >= 20 ? 1 : 0) + (classes >= 3 ? 1 : 0);
  const score = Math.min(4, Math.max(1, points)) as Strength["score"];
  return { score, label: ["", "Weak", "Fair", "Good", "Strong"][score] };
}

/** "Ana María Pérez" -> "AP"; "ana.perez@acme.com" -> "AP"; "ana@acme.com" -> "AN". */
export function initials(nameOrEmail: string): string {
  const words = nameOrEmail.trim().split("@")[0].split(/[\s._-]+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}

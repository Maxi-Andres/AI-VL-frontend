// The person's theme choice: light, dark, or follow the operating system. Kept per browser
// (a control room may run dark while the same person's laptop is light), applied as
// <html data-theme="dark"> — index.css re-points every colour token from there.
export type ThemeChoice = "light" | "dark" | "system";

const KEY = "pilot.theme";
const media = () => window.matchMedia?.("(prefers-color-scheme: dark)");

export function savedTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

export function resolve(choice: ThemeChoice): "light" | "dark" {
  return choice === "system" ? (media()?.matches ? "dark" : "light") : choice;
}

export function applyTheme(choice: ThemeChoice): void {
  const theme = resolve(choice);
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
}

export function saveTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* private mode: the choice lasts this page only */
  }
  applyTheme(choice);
}

/** Re-apply when the OS switches, for people on "system". Returns the unsubscribe. */
export function followSystem(onChange: () => void): () => void {
  const m = media();
  if (!m) return () => {};
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
}

// Languages. English is the source: every visible text is written in English and passed
// through `t()`, and the English text IS the key. Spanish lives in ./es/*.ts, one file per
// area of the app; a text with no Spanish yet shows in English, never as a blank or a key.
// ./coverage.test.ts fails when a `t("…")` in the code has no Spanish entry — that is what
// keeps the app from drifting back into a mix of both.
//
// Rules for `t()`:
//  - the argument is a string LITERAL (the test reads the code; a variable cannot be checked) —
//    except a text marked where it is defined with msg("…"), passed on and translated later;
//  - values go in as {name} placeholders: t("{n} of {m} online", { n, m });
//  - whole sentences, not pieces glued together — word order differs between languages;
//  - plural forms are separate keys, chosen by the caller ("1 message" / "{n} messages").
//
// The choice is a preference (pilot.language, kept on the person's account, lib/prefs.ts).
// Changing it re-renders what reads it — nothing remounts, so the video and the chat go on.
import { useCallback, useSyncExternalStore } from "react";
import { rememberPref } from "../lib/prefs";
import { ES } from "./es";

export type Lang = "en" | "es";
export const LANGUAGES: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "es", label: "Español" },
];

const KEY = "pilot.language";
const CHANGED = "pilot:language";

export function language(): Lang {
  try {
    return localStorage.getItem(KEY) === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}

export function setLanguage(lang: Lang): void {
  rememberPref(KEY, lang);
  applyLanguage();
  window.dispatchEvent(new Event(CHANGED));
}

/** <html lang> follows the choice (screen readers, hyphenation, the browser's own words). */
export function applyLanguage(): void {
  document.documentElement.lang = language();
}

/** Marks a text for translation where it is DEFINED but translated later, where it is shown —
 * labels in a list at the top of a file: `{ label: msg("Fleet") }`, then `t(label)` when drawn.
 * It returns the text unchanged; it exists so ./coverage.test.ts can find the text. */
export const msg = (text: string): string => text;

export type Vars = Record<string, string | number>;

function fill(text: string, vars?: Vars): string {
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Translate outside React (a module building a status line). Reads the language now. */
export function t(text: string, vars?: Vars): string {
  return fill(language() === "es" ? ES[text] ?? text : text, vars);
}

/** The current language, re-rendering when it changes. */
export function useLanguage(): Lang {
  return useSyncExternalStore((cb) => {
    window.addEventListener(CHANGED, cb);
    return () => window.removeEventListener(CHANGED, cb);
  }, language);
}

/** `t` for a component: the component re-renders in the new language when it changes. */
export function useT(): (text: string, vars?: Vars) => string {
  const lang = useLanguage();
  return useCallback((text: string, vars?: Vars) => fill(lang === "es" ? ES[text] ?? text : text, vars), [lang]);
}

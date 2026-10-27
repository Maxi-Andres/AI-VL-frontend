// Every text marked for translation has its Spanish. Reads the code for t("…") / msg("…")
// (any quotes) with a literal argument and checks each against the Spanish dictionary — a new
// English text without its Spanish fails here, before it can ship as half and half.
import { describe, expect, it } from "vitest";
import { ES } from "./es";

// Each dictionary on its own, to check that a key lives in exactly one of them.
const DICTIONARIES = import.meta.glob(["./es/*.ts", "!./es/index.ts"], { eager: true }) as Record<string, Record<string, Record<string, string>>>;

// The app's own source, as text (Vite reads it; no Node APIs needed).
const SOURCES = import.meta.glob(["../**/*.ts", "../**/*.tsx", "!../**/*.test.ts", "!../i18n/**"], {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const CALL = /\b(?:t|msg)\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;

function keys(): Map<string, string> {
  const found = new Map<string, string>();
  for (const [file, code] of Object.entries(SOURCES)) {
    for (const m of code.matchAll(CALL)) {
      const text = m[2].replace(/\\(["'`\\])/g, "$1");
      if (m[1] === "`" && text.includes("${")) continue; // not a literal: cannot be checked
      found.set(text, file);
    }
  }
  return found;
}

describe("translations", () => {
  it("reads the source", () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(20);
  });

  it("has Spanish for every marked text", () => {
    const missing = [...keys()].filter(([k]) => !(k in ES)).map(([k, f]) => `${f}: ${k}`);
    expect(missing).toEqual([]);
  });

  it("keeps each key in one dictionary (shared words go to common.ts)", () => {
    const seen = new Map<string, string>();
    const twice: string[] = [];
    for (const [file, mod] of Object.entries(DICTIONARIES)) {
      for (const key of Object.keys(Object.values(mod)[0])) {
        if (seen.has(key)) twice.push(`${key}: ${seen.get(key)} and ${file}`);
        else seen.set(key, file);
      }
    }
    expect(twice).toEqual([]);
  });

  it("keeps every placeholder in the Spanish", () => {
    const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    const wrong = Object.entries(ES).filter(([en, es]) => holes(en) !== holes(es)).map(([en]) => en);
    expect(wrong).toEqual([]);
  });
});

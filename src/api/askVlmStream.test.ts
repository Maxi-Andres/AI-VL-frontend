// askVlmStream reads iacore's "searching the web" mark and keeps it out of the answer, however
// the stream is cut into chunks.
import { afterEach, describe, expect, it, vi } from "vitest";

// The tests run without a browser; config.ts reads these when the module loads.
vi.hoisted(() => {
  Object.assign(globalThis, {
    window: { APP_CONFIG: {} },
    location: { protocol: "https:", hostname: "pilot.test", host: "pilot.test", origin: "https://pilot.test" },
  });
});

import { askVlmStream } from "./backend";

const MARK = "\x1esearching\x1e";

function streamOf(chunks: string[]) {
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  }));
}

async function ask(chunks: string[]) {
  vi.stubGlobal("fetch", vi.fn(async () => streamOf(chunks)));
  const pieces: string[] = [];
  const onSearching = vi.fn();
  const answer = await askVlmStream({ image: "", prompt: "q" }, (p) => pieces.push(p), undefined, onSearching);
  return { answer, shown: pieces.join(""), searched: onSearching.mock.calls.length };
}

afterEach(() => vi.unstubAllGlobals());

describe("askVlmStream", () => {
  it("says it searched and drops the mark", async () => {
    expect(await ask([MARK, "El blue está a $1.570."])).toEqual(
      { answer: "El blue está a $1.570.", shown: "El blue está a $1.570.", searched: 1 });
  });
  it("finds the mark cut across chunks", async () => {
    expect(await ask([MARK.slice(0, 4), MARK.slice(4) + "Sí", ", llueve."])).toEqual(
      { answer: "Sí, llueve.", shown: "Sí, llueve.", searched: 1 });
  });
  it("leaves an answer without the mark alone", async () => {
    expect(await ask(["Es ", "marrón."])).toEqual({ answer: "Es marrón.", shown: "Es marrón.", searched: 0 });
  });
});

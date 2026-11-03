// runAgent reads POST /api/agent's Server-Sent Events however the network cuts them, stops at
// the `end` event, and turns a refused request into an error event in the trace.
import { afterEach, describe, expect, it, vi } from "vitest";

// The tests run without a browser; config.ts reads these when the module loads.
vi.hoisted(() => {
  Object.assign(globalThis, {
    window: { APP_CONFIG: {} },
    location: { protocol: "https:", hostname: "pilot.test", host: "pilot.test", origin: "https://pilot.test" },
  });
});

import { runAgent } from "./agent";
import { SseParser } from "../lib/sse";
import type { AgentEvent } from "../types";

const sse = (ev: object) => `data: ${JSON.stringify(ev)}\n\n`;
const END = "event: end\ndata: {}\n\n";

function streamOf(chunks: string[], init?: ResponseInit) {
  const enc = new TextEncoder();
  return new Response(new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  }), init);
}

async function run(response: Response) {
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  const events: AgentEvent[] = [];
  await runAgent("agarrá la botella", (e) => events.push(e));
  return { events, fetchMock };
}

afterEach(() => vi.unstubAllGlobals());

describe("runAgent", () => {
  it("posts the instruction with the session cookie", async () => {
    const { fetchMock } = await run(streamOf([END]));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/api\/agent$/);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({ text: "agarrá la botella" });
  });

  it("puts back together events cut across chunks, even inside a multi-byte character", async () => {
    const whole = sse({ type: "understood", text: "botella → mano" }) +
      sse({ type: "tool_event", tool: "pick", step: "closing", detail: "hand" }) + END;
    // Bytes, not characters: "→" is three bytes and gets split in the middle.
    const bytes = new TextEncoder().encode(whole);
    const cuts = [3, 17, 18, 41, 60, bytes.length];
    const body = new ReadableStream({
      start(c) {
        let from = 0;
        for (const to of cuts) {
          c.enqueue(bytes.slice(from, to));
          from = to;
        }
        c.close();
      },
    });
    const { events } = await run(new Response(body));
    expect(events).toEqual([
      { type: "understood", text: "botella → mano" },
      { type: "tool_event", tool: "pick", step: "closing", detail: "hand" },
    ]);
  });

  it("stops at the end event and ignores anything after it", async () => {
    const { events } = await run(streamOf([
      sse({ type: "reply", text: "Listo." }), END, sse({ type: "reply", text: "late" }),
    ]));
    expect(events).toEqual([{ type: "reply", text: "Listo." }]);
  });

  it("passes the busy robot's error event on, then ends", async () => {
    const { events } = await run(streamOf([
      sse({ type: "error", text: "iacore 409: the robot is already busy with an instruction" }), END,
    ]));
    expect(events).toEqual([
      { type: "error", text: "iacore 409: the robot is already busy with an instruction" },
    ]);
  });

  it("turns a refused request into an error event", async () => {
    const { events } = await run(new Response(JSON.stringify({ detail: "needs operate" }), { status: 403 }));
    expect(events).toEqual([{ type: "error", text: "needs operate" }]);
  });

  it("drops a line it cannot read and keeps going; a last event without its blank line counts", async () => {
    const { events } = await run(streamOf([
      "data: {not json\n\n", ": keep-alive\n\n", sse({ type: "thought", text: "a" }),
      `data: ${JSON.stringify({ type: "reply", text: "b" })}`,
    ]));
    expect(events).toEqual([{ type: "thought", text: "a" }, { type: "reply", text: "b" }]);
  });
});

describe("SseParser", () => {
  it("reads CRLF line ends, named events and multi-line data", () => {
    const p = new SseParser();
    expect(p.push("event: end\r\ndata: {}\r\n\r\ndata: a\ndata: b\n")).toEqual([{ event: "end", data: "{}" }]);
    expect(p.push("\n")).toEqual([{ event: "message", data: "a\nb" }]);
    expect(p.flush()).toEqual([]);
  });
});

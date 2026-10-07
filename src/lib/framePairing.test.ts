import { describe, expect, it } from "vitest";
import { startPairing } from "./framePairing";

// A REAL macrotask tick. The fakes below answer instantly, and an injected sleep that resolved
// without yielding once turned the loop into a microtask spin that hung the whole machine
// (2026-10-07). `yieldingSleep` is the only sleep these tests may inject.
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const yieldingSleep = () => tick();
// Bounded on purpose: a broken loop must fail the test, not hang it.
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await tick();
  if (!cond()) throw new Error("condition never met");
};

describe("startPairing", () => {
  it("delivers each detection with the grab it was made from (the 260 ms desync, §2.3)", async () => {
    let n = 0;
    const pairs: [string, string][] = [];
    const stop = startPairing<string, string>({
      grab: async () => ({ frame: `frame${++n}`, blob: new Blob([`frame${n}`]) }),
      detect: async (blob) => `boxes-of-${await blob.text()}`,
      onPair: (f, d) => pairs.push([f, d]),
      sleep: yieldingSleep,
    });
    await until(() => pairs.length >= 3);
    stop();
    for (const [frame, det] of pairs) expect(det).toBe(`boxes-of-${frame}`);
  });

  it("never has two detections in flight — the next grab waits for the answer", async () => {
    let inFlight = 0, maxInFlight = 0, grabs = 0;
    const release: (() => void)[] = [];
    const stop = startPairing<number, number>({
      grab: async () => ({ frame: ++grabs, blob: new Blob(["x"]) }),
      detect: () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        return new Promise((r) => release.push(() => { inFlight--; r(1); }));
      },
      onPair: () => {},
      sleep: yieldingSleep,
    });
    await until(() => release.length === 1);
    await tick(); await tick();
    expect(grabs).toBe(1);                 // held: no second grab while the first is out
    release.shift()!();
    await until(() => release.length === 1);
    stop();
    expect(maxInFlight).toBe(1);
  });

  it("delivers nothing after stop() — a late answer belongs to a picture already left", async () => {
    let resolve: (v: string) => void = () => {};
    let aborted = false;
    const pairs: string[] = [];
    const stop = startPairing<string, string>({
      grab: async () => ({ frame: "f", blob: new Blob(["f"]) }),
      detect: (_b, signal) => {
        signal.addEventListener("abort", () => { aborted = true; });
        return new Promise((r) => { resolve = r; });
      },
      onPair: (f) => pairs.push(f),
      sleep: yieldingSleep,
    });
    await tick(); await tick();
    stop();
    resolve("late");
    await tick(); await tick();
    expect(aborted).toBe(true);
    expect(pairs).toEqual([]);
  });

  it("keeps going after a failed detection instead of dying silently", async () => {
    let calls = 0;
    const pairs: number[] = [];
    const stop = startPairing<number, number>({
      grab: async () => ({ frame: calls, blob: new Blob(["x"]) }),
      detect: async () => {
        calls++;
        if (calls === 1) throw new Error("iacore down");
        return calls;
      },
      onPair: (_f, d) => pairs.push(d),
      sleep: yieldingSleep,
    });
    await until(() => pairs.length >= 1);
    stop();
    expect(pairs[0]).toBe(2);
  });

  it("honours the max-fps cap by sleeping the rest of the interval", async () => {
    const slept: number[] = [];
    let t = 0;
    let pairs = 0;
    const stop = startPairing<number, number>({
      grab: async () => ({ frame: 0, blob: new Blob(["x"]) }),
      detect: async () => { t += 30; return 1; },      // each detection "takes" 30 ms
      onPair: () => { pairs++; },
      minIntervalMs: () => 100,
      now: () => t,
      sleep: async (ms) => { slept.push(ms); t += ms; await tick(); },
    });
    await until(() => pairs >= 2);
    stop();
    expect(slept[0]).toBe(70);                           // 100 ms interval - 30 ms of work
  });
});

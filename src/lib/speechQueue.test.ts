import { describe, expect, it } from "vitest";
import { SpeechQueue, type Player } from "./speechQueue";

/** A synth whose sentences play until released, logging every step in order. */
function harness() {
  const log: string[] = [];
  const release: Record<string, () => void> = {};
  const stopped: string[] = [];
  const synth = async (t: string): Promise<Player> => {
    log.push(`synth ${t}`);
    return {
      play: () => {
        log.push(`play ${t}`);
        return new Promise<void>((res) => {
          release[t] = () => {
            log.push(`end ${t}`);
            res();
          };
        });
      },
      stop: () => stopped.push(t),
    };
  };
  return { log, release, stopped, synth };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("SpeechQueue", () => {
  it("synthesizes the next sentence while the current one plays", async () => {
    // Catches: the next sentence requested only after the current one ended — a pause at every
    // full stop as long as the voice's synthesis (~0.5 s with Kokoro, 2026-10-16).
    const h = harness();
    const q = new SpeechQueue(h.synth);
    q.push("Uno. Dos. ");
    await tick();
    expect(h.log).toEqual(["synth Uno.", "synth Dos.", "play Uno."]);
    h.release["Uno."]();
    await tick();
    expect(h.log.slice(3)).toEqual(["end Uno.", "play Dos."]);
  });

  it("prefetches a sentence that arrives while another is playing, and keeps the order", async () => {
    const h = harness();
    const q = new SpeechQueue(h.synth);
    q.push("Uno. ");
    await tick();
    q.push("Dos. ");
    q.push("Tres. ");
    await tick();
    expect(h.log).toEqual(["synth Uno.", "play Uno.", "synth Dos."]);
    h.release["Uno."]();
    await tick();
    h.release["Dos."]();
    await tick();
    expect(h.log).toEqual([
      "synth Uno.", "play Uno.", "synth Dos.", "end Uno.", "synth Tres.", "play Dos.",
      "end Dos.", "play Tres.",
    ]);
  });

  it("stops the sentence it had prepared when cancelled", async () => {
    // Catches: a prefetched sentence playing after a barge-in, or its audio never released.
    const h = harness();
    const q = new SpeechQueue(h.synth);
    q.push("Uno. Dos. ");
    await tick();
    q.cancel();
    await tick();
    expect(h.stopped).toEqual(["Uno.", "Dos."]);
    h.release["Uno."]();
    await tick();
    expect(h.log).not.toContain("play Dos.");
  });
});

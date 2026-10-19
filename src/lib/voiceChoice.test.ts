import { afterEach, describe, expect, it } from "vitest";
import { effectiveVoice, getVoiceChoice, serverVoiceName, setVoiceChoice, voiceLabel } from "./voiceChoice";

const SERVER = ["es_AR-daniela-high", "es_MX-claude-high", "em_santa"];

describe("voiceChoice", () => {
  afterEach(() => setVoiceChoice(""));

  it("is one value for every reader", () => {
    // Catches: Drive's robot speaker speaking with the server default while Live had another
    // voice picked (2026-10-16) — each page kept its own copy.
    setVoiceChoice("piper:em_santa");
    expect(getVoiceChoice()).toBe("piper:em_santa");
    expect(serverVoiceName(getVoiceChoice())).toBe("em_santa");
    setVoiceChoice("");
    expect(getVoiceChoice()).toBeNull();
    expect(serverVoiceName(getVoiceChoice())).toBeUndefined();
  });

  it("speaks with the choice only if the server has it", () => {
    expect(effectiveVoice("piper:em_santa", SERVER)).toBe("piper:em_santa");
    expect(effectiveVoice("piper:gone-voice", SERVER)).toBe("piper:es_AR-daniela-high");
    expect(effectiveVoice(null, SERVER)).toBe("piper:es_AR-daniela-high");
  });

  it("ignores a remembered browser voice while the server has voices", () => {
    // Catches: an old pick from the removed "system" list still speaking.
    expect(effectiveVoice("Google español", SERVER)).toBe("piper:es_AR-daniela-high");
    expect(effectiveVoice("Google español", [])).toBe("Google español");
    expect(effectiveVoice("piper:em_santa", [])).toBeNull();
    expect(effectiveVoice("piper:em_santa", null)).toBe("piper:em_santa");
  });

  it("names voices the way people read them", () => {
    expect(voiceLabel("es_AR-daniela-high")).toBe("Daniela · es_AR · Piper");
    expect(voiceLabel("em_santa")).toBe("Santa · es · Kokoro");
    expect(voiceLabel("supertonic-M2")).toBe("M2 · es · Supertonic");
    expect(voiceLabel("custom")).toBe("custom");
  });

  it("falls back to the server's default voice, not the one that sorts first", () => {
    // Catches: the default moved to em_alex on the server and the page still speaking Daniela.
    expect(effectiveVoice(null, SERVER, "em_santa")).toBe("piper:em_santa");
    expect(effectiveVoice("piper:gone-voice", SERVER, "em_santa")).toBe("piper:em_santa");
    expect(effectiveVoice(null, SERVER, "not-installed")).toBe("piper:es_AR-daniela-high");
  });
});

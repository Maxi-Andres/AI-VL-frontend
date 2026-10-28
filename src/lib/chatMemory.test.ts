// The turns greyed out as forgotten are exactly the ones iacore left out.
import { describe, expect, it } from "vitest";
import { forgottenTurns } from "./chatMemory";

const q = (id: number, answer = "a") => ({ id, kind: "question" as const, question: `q${id}`, answer });
const find = (id: number) => ({ id, kind: "analysis" as const, question: "industrial · default", answer: "{}" });

describe("forgottenTurns", () => {
  it("is the oldest answered questions, as many as were left out", () => {
    expect([...forgottenTurns([q(1), q(2), q(3), q(4)], 2)]).toEqual([1, 2]);
  });
  it("skips what never goes as history: Find objects and unanswered questions", () => {
    expect([...forgottenTurns([find(1), q(2, ""), q(3), q(4), q(5)], 2)]).toEqual([3, 4]);
  });
  it("is nothing when everything still goes", () => {
    expect(forgottenTurns([q(1), q(2)], 0).size).toBe(0);
  });
});

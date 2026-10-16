import { describe, expect, it } from "vitest";
import type { DetectedObject } from "../types";
import { drawBoxes } from "./draw";

/** A canvas whose 2D context only records the rectangles stroked on it. */
function fakeCanvas() {
  const strokes: number[][] = [];
  const ctx = {
    font: "12px system-ui",
    clearRect() {},
    strokeRect: (...r: number[]) => strokes.push(r),
    measureText: () => ({ width: 10 }),
    fillRect() {},
    fillText() {},
  };
  const canvas = { width: 100, height: 200, getContext: () => ctx };
  return { canvas: canvas as unknown as HTMLCanvasElement, strokes };
}

describe("drawBoxes", () => {
  it("skips items that are not boxes instead of throwing mid-draw", () => {
    // Catches: the VLM answering "objects": ["person", ...] or an object without a bbox
    // (seen 2026-10-16) — destructuring o.bbox threw and no box after it was drawn.
    const { canvas, strokes } = fakeCanvas();
    const objects = [
      "person",
      { type: "chair" },
      { type: "printer", bbox: [0.1, 0.1, 0.5, 0.6] },
    ] as unknown as DetectedObject[];
    expect(() => drawBoxes(canvas, objects)).not.toThrow();
    expect(strokes).toHaveLength(1);
    expect(strokes[0][0]).toBeCloseTo(10);
    expect(strokes[0][1]).toBeCloseTo(20);
  });
});

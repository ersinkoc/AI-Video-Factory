import { describe, expect, it } from "vitest";
import { clapClosed, GESTURE_RHYTHM, penDown, typingTaps } from "../src/gesture-timing.ts";

describe("iş jestlerinin ritmi", () => {
  it("alkışta eller her turun başında birleşir, yarısında en açık", () => {
    const period = 1 / GESTURE_RHYTHM.clapHz;
    expect(clapClosed(0)).toBeCloseTo(1, 9);
    expect(clapClosed(3 * period)).toBeCloseTo(1, 9);
    expect(clapClosed(period / 2)).toBeCloseTo(0, 9);
  });

  it("klavyede iki el sırayla iner: biri inerken öbürü yukarıda", () => {
    const quarter = 1 / (4 * GESTURE_RHYTHM.typingHz);
    expect(typingTaps(quarter)[0]).toBeCloseTo(1, 9);
    expect(typingTaps(quarter)[1]).toBe(0);
    expect(typingTaps(3 * quarter)[0]).toBe(0);
    expect(typingTaps(3 * quarter)[1]).toBeCloseTo(1, 9);
  });

  it("kalem yazma süresinde iner, satır başında kalkar; sınırlar yumuşak", () => {
    const { strokeSec, pauseSec } = GESTURE_RHYTHM;
    expect(penDown(strokeSec / 2)).toBe(1);
    expect(penDown(strokeSec + pauseSec / 2)).toBe(0);
    expect(penDown(0.03)).toBeCloseTo(0.5, 9);
    expect(penDown(strokeSec - 0.03)).toBeCloseTo(0.5, 9);
    expect(penDown(strokeSec + pauseSec + strokeSec / 2)).toBe(1);
  });
});

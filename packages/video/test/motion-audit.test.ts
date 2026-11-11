import { describe, expect, it } from "vitest";
import { measureFrameMotion } from "../src/motion-audit.ts";

const width = 96;
const height = 54;
function texture() {
  return Uint8Array.from({ length: width * height }, (_, i) => ((i % width) * 37 + Math.floor(i / width) * 51) % 180 + 30);
}
function transform(frame: Uint8Array, dx: number, dy: number, zoom = 1) {
  return Uint8Array.from({ length: frame.length }, (_, i) => {
    const x = Math.round((i % width - (width - 1) / 2 - dx) / zoom + (width - 1) / 2);
    const y = Math.round((Math.floor(i / width) - (height - 1) / 2 - dy) / zoom + (height - 1) / 2);
    return x >= 0 && x < width && y >= 0 && y < height ? frame[y * width + x]! : 0;
  });
}

describe("rendered frame motion", () => {
  it("keeps a still frame still and does not invent a transform", () => {
    const image = texture();
    expect(measureFrameMotion(image, image, width, height)).toEqual({ change: 0, localChange: 0, shiftX: 0, shiftY: 0, scale: 1, reliable: true });
  });
  it.each([[3, 0, 1], [-2, 2, 1], [1, -1, 1.04]])("removes a whole-frame camera transform (%s,%s,%s)", (dx, dy, scale) => {
    const image = texture();
    const result = measureFrameMotion(image, transform(image, dx, dy, scale), width, height);
    expect(result.change).toBeGreaterThan(10);
    expect(result.localChange).toBeLessThan(0.01);
    expect(result).toMatchObject({ shiftX: dx, shiftY: dy, scale, reliable: true });
  });
  it("retains local subject change while removing the background pan", () => {
    const image = texture();
    const current = transform(image, 2, 0);
    for (let y = 22; y < 34; y++) for (let x = 38; x < 58; x++) current[y * width + x] = 255;
    const result = measureFrameMotion(image, current, width, height);
    expect(result).toMatchObject({ shiftX: 2, shiftY: 0, reliable: true });
    expect(result.localChange).toBeGreaterThan(30);
  });
  it("does not pretend to estimate a camera on a flat background", () => {
    const image = new Uint8Array(width * height).fill(80);
    const current = image.slice();
    for (let y = 20; y < 35; y++) for (let x = 35; x < 60; x++) current[y * width + x] = 240;
    expect(measureFrameMotion(image, current, width, height)).toMatchObject({ reliable: false, shiftX: 0, shiftY: 0 });
  });
  it("rejects incomplete or undersized frame buffers", () => {
    expect(() => measureFrameMotion(new Uint8Array(20), new Uint8Array(20), 5, 4)).toThrow("equally sized");
    expect(() => measureFrameMotion(texture(), new Uint8Array(1), width, height)).toThrow("equally sized");
  });
});

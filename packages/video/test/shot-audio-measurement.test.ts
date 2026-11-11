import { describe, expect, it } from "vitest";
import { audioMetadataFilter, measureShotAudio, parseAudioBlocks, type AudioBlock } from "../src/shot-audio.ts";

const metadata = (start: number, rms = "-20", peak = "-10", samples = 4800) => `frame:0 pts:0 pts_time:${start}\nlavfi.astats.Overall.Peak_level=${peak}\nlavfi.astats.Overall.RMS_level=${rms}\nlavfi.astats.Overall.Number_of_samples=${samples}\n`;
const blocks = (count: number, rmsDbfs: number | null): AudioBlock[] => Array.from({ length: count }, (_, i) => ({ startSec: i / 10, endSec: (i + 1) / 10, rmsDbfs, sampledPeakDbfs: rmsDbfs === null ? null : rmsDbfs + 3 }));

describe("audio metadata measurements", () => {
  it("parses native-rate levels and a partial final block without inventing zeroes", () => {
    const parsed = parseAudioBlocks(metadata(0) + metadata(.1, "-inf", "-inf", 2400), 48000);
    expect(parsed).toEqual([{ startSec: 0, endSec: .1, rmsDbfs: -20, sampledPeakDbfs: -10 }, { startSec: .1, endSec: .15000000000000002, rmsDbfs: null, sampledPeakDbfs: null }]);
  });
  it("rejects empty, missing, truncated, nonfinite and discontinuous statistics", () => {
    for (const raw of ["", metadata(0).replace(/lavfi.astats.Overall.RMS_level=.+\n/, ""), metadata(0, "nan"), metadata(0, "Infinity"), metadata(0, "10000"), metadata(0, "-20", "-10", 0), metadata(.1), metadata(0) + metadata(.3), "frame:invalid"]) expect(() => parseAudioBlocks(raw, 48000)).toThrow();
    expect(() => parseAudioBlocks(metadata(0), 0)).toThrow();
  });
  it("measures full silence as null decibels and preserves unknown trailing coverage", () => {
    const result = measureShotAudio(blocks(10, null), 48000, 2, [{ id: "silent", startSec: 0, endSec: 1 }, { id: "missing", startSec: 1, endSec: 2 }], 2);
    expect(result.windows[0]).toMatchObject({ rmsDbfs: null, sampledPeakDbfs: null, coverage: 1, quietShare: 1, longestQuiet: { startSec: 0, endSec: 1 } });
    expect(result.windows[1]).toMatchObject({ rmsDbfs: null, coverage: 0, quietShare: 0 });
    expect(result.windows[1]!.longestQuiet).toBeUndefined();
    expect(result.referenceDbfs).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });
  it("weights energy by time, clips windows and reports adjacent changes independent of the median", () => {
    const input = [...blocks(10, -10), ...blocks(10, -30).map((b) => ({ ...b, startSec: b.startSec + 1, endSec: b.endSec + 1 }))];
    const result = measureShotAudio(input, 48000, 2, [{ id: "a", startSec: 0, endSec: 1 }, { id: "b", startSec: 1, endSec: 2 }], 2);
    expect(result.referenceDbfs).toBeCloseTo(-20);
    expect(result.windows[0]!.relativeDb).toBeCloseTo(10);
    expect(result.windows[1]!.previousDeltaDb).toBeCloseTo(-20);
    const mixed = measureShotAudio(input, 48000, 2, [{ id: "mix", startSec: .5, endSec: 1.5 }], 2).windows[0]!;
    expect(mixed.rmsDbfs).toBeCloseTo(10 * Math.log10((.1 + .001) / 2));
    expect(mixed.envelope).toHaveLength(32); expect(mixed.envelope[0]).toBeGreaterThan(mixed.envelope[31]!);
  });
  it("does not extend quiet intervals through audible blocks or beyond a shot", () => {
    const input = blocks(20, null); input[10] = { ...input[10]!, rmsDbfs: -10, sampledPeakDbfs: -7 };
    const result = measureShotAudio(input, 48000, 1, [{ id: "short", startSec: .3, endSec: .8 }, { id: "full", startSec: 0, endSec: 2 }], 2);
    expect(result.windows[0]!.longestQuiet).toEqual({ startSec: .3, endSec: .8 });
    expect(result.windows[1]!.longestQuiet).toEqual({ startSec: 0, endSec: 1 });
  });
  it("bounds metadata before decoding while preserving native sample rate", () => {
    expect(audioMetadataFilter(48000, 2, 1200)).toContain("asetnsamples=n=4800");
    expect(() => audioMetadataFilter(48000, 2, 10000)).toThrow("budget");
    for (const [rate, channels, duration] of [[0, 2, 1], [48000, 0, 1], [48000, 9, 1], [48000, 2, Infinity]]) expect(() => audioMetadataFilter(rate!, channels!, duration!)).toThrow();
  });
});

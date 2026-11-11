import { beforeEach, describe, expect, it, vi } from "vitest";
const deps = vi.hoisted(() => ({ stat: vi.fn(), tool: vi.fn() }));
vi.mock("node:fs/promises", () => ({ stat: deps.stat }));
vi.mock("../src/tools.ts", () => ({ runMediaTool: deps.tool }));
import { auditRenderedVideo } from "../src/render-audit.ts";
const stamp = { size: 100, mtimeMs: 100, mtime: new Date(100), isFile: () => true };
const info = () => ({ streams: [{ codec_type: "video", width: 192, height: 108, duration: "4" }] as Record<string, unknown>[], format: { duration: "4" } });
const ranges = [{ id: "first", startSec: 0, endSec: 2 }, { id: "second", startSec: 2, endSec: 4 }];
let probe: ReturnType<typeof info>, detection: string, levels: string, raw: string, metadata: string;
function audio(values: number[]) {
  return Array.from({ length: 40 }, (_, i) => `frame:${i} pts:${i * 4800} pts_time:${i / 10}\nlavfi.astats.Overall.RMS_level=${values[Math.floor(i / (40 / values.length))]}\nlavfi.astats.Overall.Peak_level=-10\nlavfi.astats.Overall.Number_of_samples=4800`).join("\n");
}
beforeEach(() => {
  vi.resetAllMocks(); deps.stat.mockResolvedValue(stamp); probe = info(); detection = ""; levels = '{"input_i":"-14","input_tp":"-2"}'; raw = Buffer.alloc(96 * 54 * 8).toString("latin1"); metadata = audio([-20]);
  deps.tool.mockImplementation(async (name: string, args: string[]) => {
    if (name === "ffprobe") return { stdout: JSON.stringify(probe), stderr: "" };
    if (args.includes("rawvideo")) return { stdout: raw, stderr: "" };
    if (args.includes("-af")) return args.some((a) => a.startsWith("loudnorm=")) ? { stdout: "", stderr: levels } : { stdout: metadata, stderr: "" };
    return { stdout: "", stderr: detection };
  });
});
describe("render audit media failure boundary", () => {
  it("rejects non-files, missing dimensions and nonfinite media duration", async () => {
    deps.stat.mockResolvedValueOnce({ ...stamp, isFile: () => false });
    await expect(auditRenderedVideo("folder")).rejects.toThrow("video file");
    for (const streams of [[], undefined, [{ codec_type: "video", height: 108, duration: "4" }], [{ codec_type: "video", width: 192, duration: "4" }], [{ codec_type: "video", width: 192, height: 108, duration: "NaN" }], [{ codec_type: "video", width: 192, height: 108, duration: "0" }]]) {
      probe = { streams, format: {} } as never; await expect(auditRenderedVideo("invalid.mp4")).rejects.toThrow("finite video duration");
    }
  });
  it("validates review windows before decoding and accepts format-level duration", async () => {
    delete probe.streams[0]!.duration;
    expect((await auditRenderedVideo("valid.mp4", ranges)).durationSec).toBe(4);
    for (const windows of [[], [{ id: "", startSec: 0, endSec: 1 }], [{ id: "bad", startSec: NaN, endSec: 1 }], [{ id: "bad", startSec: 0, endSec: Infinity }], [{ id: "bad", startSec: -1, endSec: 1 }], [{ id: "bad", startSec: 0, endSec: 5 }]]) await expect(auditRenderedVideo("video.mp4", windows)).rejects.toThrow("Audit ranges");
  });
  it("pairs closed freezes, ignores orphan ends and keeps a terminal freeze", async () => {
    detection = "freeze_end: 0.5\nfreeze_start: 1\nfreeze_end: 2\nfreeze_start: 3";
    const report = await auditRenderedVideo("video.mp4");
    expect(report.findings.filter((f) => f.kind === "freeze")).toEqual([expect.objectContaining({ startSec: 1, endSec: 2 }), expect.objectContaining({ startSec: 3, endSec: 4 })]);
  });
  it("reports tool rejection and incomplete raw frames as failed checks without fabricating measurements", async () => {
    deps.tool.mockRejectedValueOnce("probe unavailable"); await expect(auditRenderedVideo("video.mp4")).rejects.toBe("probe unavailable");
    const tool = deps.tool.getMockImplementation()!;
    deps.tool.mockImplementation(async (name: string, args: string[]) => { if (args.some((a) => a.includes("blackdetect"))) throw "decoder offline"; return tool(name, args); });
    for (const bytes of ["x", Buffer.alloc(96 * 54).toString("latin1")]) {
      raw = bytes; const report = await auditRenderedVideo("video.mp4");
      expect(report.checks).toEqual(expect.arrayContaining([expect.objectContaining({ name: "black_and_freeze", status: "failed", reason: "decoder offline" }), expect.objectContaining({ name: "local_motion", status: "failed", reason: expect.stringContaining("complete decoded frames") })]));
    }
  });
  it.each([{ width: 1, height: 1000, duration: "4" }, { width: 192, height: 108, duration: "2000" }])("bounds motion sampling independently of editorial windows (%j)", async (video) => {
    probe.streams[0] = { codec_type: "video", ...video };
    expect((await auditRenderedVideo("long.mp4")).checks).toContainEqual(expect.objectContaining({ name: "local_motion", status: "failed", reason: expect.stringContaining("bounded analysis budget") }));
  });
  it("keeps audio tool failures, loudness and true peaks explicit", async () => {
    probe.streams.push({ codec_type: "audio", sample_rate: "48000", channels: 1 });
    levels = "no measurements";
    expect((await auditRenderedVideo("video.mp4")).checks).toContainEqual(expect.objectContaining({ name: "audio_levels", status: "failed", reason: expect.stringContaining("no loudness") }));
    levels = '{"input_i":"-25","input_tp":"0.5"}';
    const report = await auditRenderedVideo("video.mp4");
    expect(report.findings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "loudness" }), expect.objectContaining({ kind: "peak" })]));
    delete probe.streams[1]!.channels;
    expect((await auditRenderedVideo("video.mp4")).checks).toContainEqual(expect.objectContaining({ name: "shot_audio", status: "failed" }));
  });
  it("reports quiet-level changes with missing reference and a first-window difference without a predecessor", async () => {
    probe.streams.push({ codec_type: "audio", sample_rate: "48000", channels: 1 }); metadata = audio([-70, -90]);
    const quiet = await auditRenderedVideo("video.mp4", ranges);
    expect(quiet.findings).toContainEqual(expect.objectContaining({ kind: "audio_level_change", detail: expect.stringContaining("median audible window unmeasured") }));
    metadata = audio([-40, -20, -20, -20]);
    const loud = await auditRenderedVideo("video.mp4", Array.from({ length: 4 }, (_, i) => ({ id: String(i), startSec: i, endSec: i + 1 })));
    expect(loud.findings).toContainEqual(expect.objectContaining({ kind: "audio_level_change", detail: expect.stringContaining("previous window unmeasured") }));
  });
  it.each([{ size: 101 }, { mtimeMs: 101 }])("discards an audit when the source changes during decoding (%j)", async (changed) => {
    deps.stat.mockResolvedValueOnce(stamp).mockResolvedValueOnce({ ...stamp, ...changed });
    await expect(auditRenderedVideo("video.mp4")).rejects.toThrow("Video changed during analysis");
  });
});

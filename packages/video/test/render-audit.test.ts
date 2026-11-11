import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auditRenderedVideo } from "../src/render-audit.ts";
import { runMediaTool } from "../src/tools.ts";

// Genuine media-tool integration. No paid calls, browser rendering or source-engine fixtures.
let available = true;
try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore", timeout: 5_000 }); execFileSync("ffprobe", ["-version"], { stdio: "ignore", timeout: 5_000 }); } catch { available = false; }
describe.skipIf(!available)("render audit against encoded video", () => {
  let dir: string;
  let hold: string;
  let moving: string;
  let black: string;
  let silent: string;
  let camera: string;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "ys-render-audit-"));
    hold = join(dir, "quiet hold.mp4");
    moving = join(dir, "moving.mp4");
    black = join(dir, "black.mp4");
    silent = join(dir, "silent.mp4");
    camera = join(dir, "camera.mp4");
    const encode = (out: string, input: string[], extra: string[] = []) => runMediaTool("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", ...input, ...extra, "-t", "4", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", out], false, { timeout: 20_000, maxBuffer: 1024 * 1024 });
    await encode(hold, ["-f", "lavfi", "-i", "color=c=gray:s=192x108:r=12"]);
    await encode(moving, ["-f", "lavfi", "-i", "testsrc2=s=192x108:r=12", "-f", "lavfi", "-i", "sine=frequency=500:sample_rate=48000"], ["-c:a", "aac"]);
    await encode(black, ["-f", "lavfi", "-i", "color=c=black:s=192x108:r=12"]);
    await encode(silent, ["-f", "lavfi", "-i", "testsrc2=s=192x108:r=12", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"], ["-c:a", "aac"]);
    // A textured image moves as one plane; no independent subject action occurs.
    const raw = Buffer.alloc(96 * 54 * 8);
    for (let frame = 0; frame < 8; frame++) for (let y = 0; y < 54; y++) for (let x = 0; x < 96; x++) {
      raw[frame * 96 * 54 + y * 96 + x] = (((x - frame + 96) % 96) * 37 + y * 51) % 180 + 30;
    }
    const source = join(dir, "pan.gray");
    await writeFile(source, raw);
    await encode(camera, ["-f", "rawvideo", "-pixel_format", "gray", "-video_size", "96x54", "-framerate", "2", "-i", source], ["-r", "12", "-crf", "0"]);
  });
  afterAll(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });

  it("reports a terminal freeze and low motion without fabricating an audio pass", async () => {
    const report = await auditRenderedVideo(hold);
    expect(report.durationSec).toBeCloseTo(4, 1);
    expect(report.findings).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "freeze", startSec: 0, endSec: 4 }), expect.objectContaining({ kind: "low_motion" })]));
    expect(report.checks).toContainEqual({ name: "audio_levels", status: "skipped", reason: "No audio stream." });
    expect(report.checks.filter((c) => c.status === "failed")).toEqual([]);
    expect(report.audio).toBeUndefined();
  });
  it("measures a changing picture and finite audio levels", async () => {
    const report = await auditRenderedVideo(moving);
    expect(report.motion[0]!.localChange).toBeGreaterThan(1.5);
    expect(report.audio?.integratedLufs).toBeTypeOf("number");
    expect(report.audio?.truePeakDbfs).toBeTypeOf("number");
    expect(report.findings.some((f) => f.kind === "freeze" || f.kind === "camera_only")).toBe(false);
    expect(report.checks.filter((c) => c.status === "failed")).toEqual([]);
  });
  it("reports black footage with a real time range", async () => {
    const report = await auditRenderedVideo(black);
    const finding = report.findings.find((f) => f.kind === "black");
    expect(finding?.startSec).toBe(0);
    expect(finding?.endSec).toBeGreaterThan(3.8);
  });
  it("flags a camera-only encoded pan rather than crediting it as subject action", async () => {
    const report = await auditRenderedVideo(camera);
    expect(report.findings).toContainEqual(expect.objectContaining({ kind: "camera_only", startSec: 0, endSec: 4 }));
    expect(report.motion[0]!.registeredShare).toBe(1);
    expect(report.checks.filter((c) => c.status === "failed")).toEqual([]);
  });
  it("represents silence explicitly instead of serializing Infinity as a passing measurement", async () => {
    const report = await auditRenderedVideo(silent);
    expect(report.audio).toEqual({ integratedLufs: null, truePeakDbfs: null });
    expect(report.findings).toContainEqual(expect.objectContaining({ kind: "loudness" }));
  });
  it("never compares frames across supplied shot boundaries", async () => {
    const report = await auditRenderedVideo(moving, [{ id: "short", startSec: 0, endSec: 0.5 }]);
    expect(report.motion).toEqual([]);
    expect(report.checks).toContainEqual(expect.objectContaining({ name: "local_motion", status: "failed", reason: expect.stringContaining("No range") }));
  });
  it("rejects invalid ranges and nonexistent input", async () => {
    await expect(auditRenderedVideo(moving, [{ id: "bad", startSec: 2, endSec: 1 }])).rejects.toThrow("Audit ranges");
    await expect(auditRenderedVideo(join(dir, "missing.mp4"))).rejects.toThrow();
  });
});

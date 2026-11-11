import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { auditRenderedVideo } from "../src/render-audit.ts";
import { runMediaTool } from "../src/tools.ts";

let root: string, path: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "ys-shot-audio-")); path = join(root, "levels.mp4");
  // The second channel is inverted: averaging channels would incorrectly report silence.
  await runMediaTool("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=192x108:r=12:d=6", "-f", "lavfi", "-i", "aevalsrc='if(lt(t,2),0.4*sin(2*PI*440*t),if(lt(t,4),0.02*sin(2*PI*440*t),0))|-if(lt(t,2),0.4*sin(2*PI*440*t),if(lt(t,4),0.02*sin(2*PI*440*t),0))':s=16000:d=6", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", path], false, { timeout: 20_000, maxBuffer: 1024 * 1024 });
});
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

it("locates a quiet shot and a silent tail in the actual MP4 without cancelling opposite stereo channels", async () => {
  const report = await auditRenderedVideo(path, [
    { id: "loud", startSec: 0, endSec: 2 }, { id: "quiet", startSec: 2, endSec: 4 }, { id: "silent", startSec: 4, endSec: 6 },
  ]);
  expect(report.checks).toContainEqual({ name: "shot_audio", status: "complete" });
  const windows = report.shotAudio!.windows;
  expect(windows).toHaveLength(3);
  expect(windows[0]!.rmsDbfs).toBeGreaterThan(-15);
  expect(windows[0]!.rmsDbfs! - windows[1]!.rmsDbfs!).toBeGreaterThan(20);
  expect(windows[2]!.longestQuiet!.endSec - windows[2]!.longestQuiet!.startSec).toBeGreaterThan(1.7);
  expect(report.findings).toContainEqual(expect.objectContaining({ kind: "audio_level_change", startSec: 2, endSec: 4 }));
  expect(report.findings).toContainEqual(expect.objectContaining({ kind: "audio_gap", startSec: expect.any(Number), endSec: 6 }));
});

it("retains high-frequency energy at the source rate", async () => {
  const treble = join(root, "treble.mp4");
  await runMediaTool("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=192x108:r=12:d=2", "-f", "lavfi", "-i", "sine=frequency=6000:sample_rate=48000:duration=2", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", treble], false, { timeout: 20_000, maxBuffer: 1024 * 1024 });
  const report = await auditRenderedVideo(treble);
  expect(report.shotAudio?.sampleRate).toBe(48000);
  expect(report.shotAudio!.windows[0]!.rmsDbfs).toBeGreaterThan(-30);
  expect(report.findings.some((f) => f.kind === "audio_gap")).toBe(false);
});

it("retains audio timestamp offsets as quiet leading time", async () => {
  const offset = join(root, "offset.mp4");
  await runMediaTool("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=192x108:r=12:d=4", "-itsoffset", "1", "-f", "lavfi", "-i", "sine=frequency=500:sample_rate=48000:duration=3", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", offset], false, { timeout: 20_000, maxBuffer: 1024 * 1024 });
  const report = await auditRenderedVideo(offset, [{ id: "intro", startSec: 0, endSec: 1 }, { id: "voice", startSec: 1, endSec: 4 }]);
  expect(report.checks).toContainEqual({ name: "shot_audio", status: "complete" });
  expect(report.findings).toContainEqual(expect.objectContaining({ kind: "audio_gap", startSec: 0, endSec: expect.any(Number) }));
  expect(report.shotAudio!.windows[1]!.rmsDbfs).toBeGreaterThan(-30);
});

it("keeps missing trailing audio distinct from measured silence", async () => {
  const short = join(root, "short-audio.mp4");
  await runMediaTool("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=192x108:r=12:d=4", "-f", "lavfi", "-i", "sine=frequency=500:sample_rate=48000:duration=1", "-c:v", "libx264", "-threads", "1", "-c:a", "aac", short], false, { timeout: 20_000, maxBuffer: 1024 * 1024 });
  const report = await auditRenderedVideo(short, [{ id: "head", startSec: 0, endSec: 1 }, { id: "tail", startSec: 2, endSec: 4 }]);
  expect(report.checks).toContainEqual(expect.objectContaining({ name: "shot_audio", status: "failed" }));
  expect(report.shotAudio!.windows[1]).toMatchObject({ coverage: 0, rmsDbfs: null });
  expect(report.shotAudio!.windows[1]!.longestQuiet).toBeUndefined();
  expect(report.findings).toContainEqual(expect.objectContaining({ kind: "audio_coverage", startSec: 2, endSec: 4 }));
  expect(report.findings.some((f) => f.kind === "audio_gap" && f.startSec >= 2)).toBe(false);
});

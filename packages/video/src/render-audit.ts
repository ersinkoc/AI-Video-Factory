import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { runMediaTool } from "./tools.ts";
import { measureFrameMotion } from "./motion-audit.ts";
import { audioMetadataFilter, measureShotAudio, parseAudioBlocks, type ShotAudio } from "./shot-audio.ts";

export interface AuditRange { id: string; startSec: number; endSec: number }
export interface AuditFinding extends AuditRange {
  kind: "black" | "freeze" | "camera_only" | "low_motion" | "loudness" | "peak" | "audio_gap" | "audio_level_change" | "audio_coverage";
  detail: string;
}
export interface RenderAudit {
  version: 1;
  file: string;
  source: { bytes: number; modifiedAt: string };
  durationSec: number;
  width: number;
  height: number;
  checks: { name: string; status: "complete" | "skipped" | "failed"; reason?: string }[];
  findings: AuditFinding[];
  motion: (AuditRange & { pairs: number; change: number; localChange: number; registeredShare: number })[];
  audio?: { integratedLufs: number | null; truePeakDbfs: number | null };
  shotAudio?: ShotAudio;
}
const LIMITS = { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 };
const SAMPLE_FPS = 2;
const WIDTH = 96;
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  // Çağıran yalnız en az iki iç kare çifti olan aralıkların örneklerini verir.
  return sorted[Math.floor(sorted.length / 2)]!;
};

/** Read-only advisory analysis. A complete check is not an editorial approval. */
export async function auditRenderedVideo(file: string, ranges?: AuditRange[]): Promise<RenderAudit> {
  const path = resolve(file);
  const before = await stat(path);
  if (!before.isFile()) throw new Error("Render audit requires a video file.");
  const probe = await runMediaTool("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,duration,channels,sample_rate", "-of", "json", path], true, LIMITS);
  const info = JSON.parse(probe.stdout) as { format?: { duration?: string }; streams?: { codec_type: string; width?: number; height?: number; duration?: string; channels?: number; sample_rate?: string }[] };
  const video = info.streams?.find((s) => s.codec_type === "video");
  const duration = Number(video?.duration ?? info.format?.duration);
  if (!video?.width || !video.height || !Number.isFinite(duration) || duration <= 0) throw new Error("Cannot audit media without a finite video duration and dimensions.");
  const windows = ranges ?? Array.from({ length: Math.ceil(duration / 5) }, (_, i) => ({ id: `window-${i + 1}`, startSec: i * 5, endSec: Math.min(duration, (i + 1) * 5) }));
  if (!windows.length || windows.some((r) => !r.id || !Number.isFinite(r.startSec) || !Number.isFinite(r.endSec) || r.startSec < 0 || r.endSec <= r.startSec || r.endSec > duration + 0.1)) {
    throw new Error("Audit ranges require an id and increasing finite times within the video.");
  }
  const report: RenderAudit = {
    version: 1, file: path, source: { bytes: before.size, modifiedAt: before.mtime.toISOString() }, durationSec: duration,
    width: video.width, height: video.height, checks: [], findings: [], motion: [],
  };
  const check = async (name: string, task: () => Promise<void>) => {
    try {
      await task();
      report.checks.push({ name, status: "complete" });
    } catch (error) {
      report.checks.push({ name, status: "failed", reason: error instanceof Error ? error.message : String(error) });
    }
  };
  await check("black_and_freeze", async () => {
    const { stderr } = await runMediaTool("ffmpeg", ["-hide_banner", "-nostdin", "-v", "info", "-i", path, "-map", "0:v:0", "-an", "-vf", "scale=320:-2,blackdetect=d=0.25:pic_th=0.98:pix_th=0.04,freezedetect=n=-55dB:d=1.5", "-f", "null", "-"], true, LIMITS);
    for (const match of stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g)) {
      report.findings.push({ id: `black-${report.findings.length}`, kind: "black", startSec: Number(match[1]), endSec: Number(match[2]), detail: "Almost-black interval; inspect whether the fade or blank frame is intentional." });
    }
    let start: number | undefined;
    for (const match of stderr.matchAll(/freeze_(start|end):\s*([\d.]+)/g)) {
      if (match[1] === "start") start = Number(match[2]);
      else if (start !== undefined) {
        report.findings.push({ id: `freeze-${report.findings.length}`, kind: "freeze", startSec: start, endSec: Number(match[2]), detail: "Near-identical frames for at least 1.5 seconds; an intentional hold may be valid." });
        start = undefined;
      }
    }
    if (start !== undefined) report.findings.push({ id: `freeze-${report.findings.length}`, kind: "freeze", startSec: start, endSec: duration, detail: "Near-identical frames continue to the end of the video." });
  });
  await check("local_motion", async () => {
    const height = Math.max(24, Math.round(WIDTH * video.height! / video.width! / 2) * 2);
    if (height > 384 || duration * SAMPLE_FPS * WIDTH * height > LIMITS.maxBuffer / 2) throw new Error("Motion sampling exceeds the bounded analysis budget; use a shorter review export.");
    const { stdout } = await runMediaTool("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-i", path, "-map", "0:v:0", "-an", "-vf", `setpts=PTS-STARTPTS,fps=${SAMPLE_FPS}:start_time=0,scale=${WIDTH}:${height},format=gray`, "-f", "rawvideo", "-"], true, { ...LIMITS, encoding: "latin1" });
    const bytes = Buffer.from(stdout, "latin1");
    const frameSize = WIDTH * height;
    const count = bytes.length / frameSize;
    if (!Number.isInteger(count) || count < 2) throw new Error("Not enough complete decoded frames for motion analysis.");
    const pairs = Array.from({ length: count - 1 }, (_, i) => {
      const m = measureFrameMotion(bytes.subarray(i * frameSize, (i + 1) * frameSize), bytes.subarray((i + 1) * frameSize, (i + 2) * frameSize), WIDTH, height);
      return { startSec: i / SAMPLE_FPS, endSec: (i + 1) / SAMPLE_FPS, ...m };
    });
    for (const range of windows) {
      // Both frames must lie inside the shot, away from transitions. Never compare across cuts.
      const samples = pairs.filter((p) => p.startSec >= range.startSec + 0.35 && p.endSec <= range.endSec - 0.35);
      if (samples.length < 2) continue;
      const motion = { ...range, pairs: samples.length, change: median(samples.map((p) => p.change)), localChange: median(samples.map((p) => p.localChange)), registeredShare: samples.filter((p) => p.reliable).length / samples.length };
      report.motion.push(motion);
      if (motion.change < 0.5) report.findings.push({ ...range, kind: "low_motion", detail: "Little sampled visual change. Review against the intended action or quiet hold." });
      else if (motion.registeredShare >= 0.75 && motion.localChange < 1.5 && motion.localChange < motion.change * 0.3) report.findings.push({ ...range, kind: "camera_only", detail: "Most sampled change is explained by a global camera transform; inspect whether the narrated subject acts." });
    }
    if (!report.motion.length) throw new Error("No range contains enough interior frame pairs; motion was not assessed.");
  });
  const audioStream = info.streams?.find((s) => s.codec_type === "audio");
  if (audioStream) {
    await check("audio_levels", async () => {
      const { stderr } = await runMediaTool("ffmpeg", ["-hide_banner", "-nostdin", "-v", "info", "-i", path, "-map", "0:a:0", "-vn", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"], true, LIMITS);
      const match = stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
      if (!match) throw new Error("Audio analysis returned no loudness measurements.");
      const levels = JSON.parse(match[0]) as { input_i: string; input_tp: string };
      const finite = (s: string) => Number.isFinite(Number(s)) ? Number(s) : null;
      report.audio = { integratedLufs: finite(levels.input_i), truePeakDbfs: finite(levels.input_tp) };
      if (report.audio.integratedLufs === null || Math.abs(report.audio.integratedLufs + 14) > 3) report.findings.push({ id: "audio-loudness", kind: "loudness", startSec: 0, endSec: duration, detail: `Integrated loudness ${report.audio.integratedLufs ?? "unmeasurable (silent)"} LUFS; target -14 ±3 LU.` });
      if (report.audio.truePeakDbfs !== null && report.audio.truePeakDbfs > -1) report.findings.push({ id: "audio-peak", kind: "peak", startSec: 0, endSec: duration, detail: `True peak ${report.audio.truePeakDbfs} dBFS exceeds the -1 dBFS review ceiling.` });
    });
    await check("shot_audio", async () => {
      const channels = audioStream.channels ?? 0;
      const sampleRate = Number(audioStream.sample_rate);
      const filter = audioMetadataFilter(sampleRate, channels, duration, LIMITS.maxBuffer);
      const { stdout } = await runMediaTool("ffmpeg", ["-hide_banner", "-nostdin", "-v", "error", "-copyts", "-start_at_zero", "-i", path, "-map", "0:a:0", "-vn", "-t", String(duration), "-af", filter, "-f", "null", "-"], true, LIMITS);
      const measurement = measureShotAudio(parseAudioBlocks(stdout, sampleRate), sampleRate, channels, windows, duration);
      report.shotAudio = measurement;
      for (const window of measurement.windows) {
        const quiet = window.longestQuiet;
        if (quiet && quiet.endSec - quiet.startSec >= .8) report.findings.push({ id: window.id, kind: "audio_gap", ...quiet, detail: "Sampled mixed audio stayed below -50 dBFS RMS for at least 0.8 seconds. An intentional quiet passage may be valid." });
        if (window.endSec - window.startSec >= .5 && window.coverage >= .98 && (Math.abs(window.relativeDb ?? 0) > 12 || Math.abs(window.previousDeltaDb ?? 0) > 12)) report.findings.push({ id: window.id, startSec: window.startSec, endSec: window.endSec, kind: "audio_level_change", detail: `Mix RMS difference: median audible window ${window.relativeDb?.toFixed(1) ?? "unmeasured"} dB, previous window ${window.previousDeltaDb?.toFixed(1) ?? "unmeasured"} dB. Review the intended dynamics; this is not LUFS or dialogue intelligibility.` });
        if (window.endSec - Math.max(window.startSec, measurement.coveredUntilSec) > .1) report.findings.push({ id: window.id, kind: "audio_coverage", startSec: Math.max(window.startSec, measurement.coveredUntilSec), endSec: window.endSec, detail: "No decoded audio samples cover this part of the video. Missing samples were not counted as measured silence." });
      }
      if (windows.some((w) => w.endSec - Math.max(w.startSec, measurement.coveredUntilSec) > .1)) throw new Error("Decoded audio ends before one or more review windows; measured windows retained, missing coverage is unmeasured");
    });
  } else {
    report.checks.push({ name: "audio_levels", status: "skipped", reason: "No audio stream." }, { name: "shot_audio", status: "skipped", reason: "No audio stream." });
  }
  report.checks.push({ name: "semantic_action_readability_and_sound_quality", status: "skipped", reason: "Requires editorial review; pixel and loudness measurements cannot establish meaning, legibility or perceived sound quality." });
  const after = await stat(path);
  if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) throw new Error("Video changed during analysis; report discarded.");
  return report;
}

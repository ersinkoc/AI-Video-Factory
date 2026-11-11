import { randomUUID } from "node:crypto";
import { stat } from "node:fs/promises";
import { compareImageProfiles, type ImageProfile, type Timeline } from "@ys/core";
import { putJson, type AssetStore } from "@ys/storage";
import { runMediaTool } from "@ys/video/tools";
import { measureImage } from "./image-profile.ts";

export interface StyleReference { key: string; profile: ImageProfile }
export interface StyleSample { shotId: string; seconds: number }
export interface StyleComparison {
  status: "complete" | "incomplete" | "failed";
  at: string; compared: number; eligible: number; excludedArchive: number;
  findings: { shotId: string; seconds: number; flags: string[] }[];
  reportKey?: string; error?: string;
}
/** Freeze sample locations alongside the successful render, before later timeline edits. */
export function styleSamples(timeline: Timeline) {
  const eligible = timeline.visuals.filter((v) => !v.archiveSource);
  const count = Math.min(12, eligible.length);
  return { eligible: eligible.length, excludedArchive: timeline.visuals.length - eligible.length,
    samples: Array.from({ length: count }, (_, i): StyleSample => {
      const v = eligible[Math.floor(i * eligible.length / count)]!;
      return { shotId: v.shotId, seconds: (v.fromFrame + Math.floor((v.durationInFrames - 1) / 2)) / timeline.fps };
    }) };
}

export async function compareRenderedStyle(opts: {
  episodeId: string; store: AssetStore;
  render: { path: string; at: string; styleReference: StyleReference; styleSampling: ReturnType<typeof styleSamples> };
  extract?: (path: string, seconds: number) => Promise<Uint8Array>;
}): Promise<StyleComparison> {
  const { render } = opts;
  const summary: StyleComparison = { status: "complete", at: new Date().toISOString(), compared: 0,
    eligible: render.styleSampling.eligible, excludedArchive: render.styleSampling.excludedArchive, findings: [] };
  const frames: { shotId: string; seconds: number; profile?: ImageProfile; comparison?: ReturnType<typeof compareImageProfiles>; error?: string }[] = [];
  const reason = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500);
  try {
    const before = await stat(render.path);
    const extract = opts.extract ?? (async (path, seconds) => {
      const result = await runMediaTool("ffmpeg", ["-v", "error", "-ss", String(seconds), "-i", path, "-frames:v", "1", "-vf", "scale=384:-2", "-f", "image2pipe", "-vcodec", "mjpeg", "-"], true,
        { timeout: 20_000, maxBuffer: 2 * 1024 * 1024, encoding: "latin1" });
      return Buffer.from(result.stdout, "latin1");
    });
    for (const sample of render.styleSampling.samples) {
      try {
        const profile = await measureImage(await extract(render.path, sample.seconds));
        const comparison = compareImageProfiles(render.styleReference.profile, profile);
        frames.push({ ...sample, profile, comparison }); summary.compared++;
        if (comparison.flags.length) summary.findings.push({ ...sample, flags: comparison.flags });
      } catch (e) { frames.push({ ...sample, error: reason(e) }); summary.status = "incomplete"; }
    }
    const after = await stat(render.path);
    if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error("Render file changed during comparison");
    if (!summary.compared) summary.status = "incomplete";
    const reportKey = `episodes/${opts.episodeId}/style-comparisons/${randomUUID()}.json`;
    await putJson(opts.store, reportKey, { ...summary, renderedAt: render.at, reference: render.styleReference, source: { size: before.size, mtimeMs: before.mtimeMs }, frames });
    summary.reportKey = reportKey;
  } catch (e) { summary.status = "failed"; summary.error = reason(e); }
  return summary;
}

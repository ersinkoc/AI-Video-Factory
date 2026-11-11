import { randomUUID } from "node:crypto";
import { auditRenderedVideo, type RenderAudit } from "@ys/video/audit";
import { putJson, type AssetStore } from "@ys/storage";
import type { Timeline } from "@ys/core";

/** Bounded polling payload. Full measurements live in the episode's report artifact. */
export interface RenderAuditSummary {
  status: "running" | "complete" | "incomplete" | "failed";
  at: string;
  reportKey?: string;
  findingsCount: number;
  findings: RenderAudit["findings"];
  checks: RenderAudit["checks"];
  audio?: RenderAudit["audio"];
  rangeBasis?: "render" | "current_timeline" | "file";
  target?: "main" | "short";
  renderedAt?: string;
  exportId?: string;
  source?: RenderAudit["source"];
  shotAudio?: { sampleRate: number; channels: number; referenceDbfs: number | null; windowsCount: number; windows: NonNullable<RenderAudit["shotAudio"]>["windows"] };
  error?: string;
}

export const pendingRenderAudit = (): RenderAuditSummary => ({ status: "running", at: new Date().toISOString(), findingsCount: 0, findings: [], checks: [] });

export async function collectRenderAudit(opts: {
  episodeId: string;
  render: { path: string; at: string; exportId?: string; auditRanges?: { id: string; startSec: number; endSec: number }[] };
  target?: "main" | "short";
  timeline?: Timeline;
  store: AssetStore;
  analyze?: typeof auditRenderedVideo;
}): Promise<RenderAuditSummary> {
  const at = new Date().toISOString();
  let summary: RenderAuditSummary | undefined;
  try {
    const ranges = opts.render.auditRanges ?? opts.timeline?.visuals.map((v) => ({ id: v.shotId, startSec: v.fromFrame / opts.timeline!.fps, endSec: (v.fromFrame + v.durationInFrames) / opts.timeline!.fps }));
    if (!ranges?.length && opts.target !== "short") throw new Error("No render or timeline ranges are available");
    const rangeBasis = opts.render.auditRanges ? "render" as const : ranges ? "current_timeline" as const : "file" as const;
    const report = await (opts.analyze ?? auditRenderedVideo)(opts.render.path, ranges);
    const audioFindings = new Set(report.findings.filter((f) => f.kind.startsWith("audio_")).map((f) => f.id));
    summary = {
      status: report.checks.some((c) => c.status === "failed") ? "incomplete" : "complete", at,
      findingsCount: report.findings.length,
      findings: report.findings.slice(0, 12).map((f) => ({ ...f, detail: f.detail.slice(0, 300) })),
      checks: report.checks.map((c) => ({ ...c, ...(c.reason ? { reason: c.reason.slice(0, 500) } : {}) })),
      ...(report.audio ? { audio: report.audio } : {}),
      rangeBasis,
      target: opts.target ?? "main", renderedAt: opts.render.at, exportId: opts.render.exportId, source: report.source,
      ...(report.shotAudio ? { shotAudio: { sampleRate: report.shotAudio.sampleRate, channels: report.shotAudio.channels,
        referenceDbfs: report.shotAudio.referenceDbfs, windowsCount: report.shotAudio.windows.length,
        windows: report.shotAudio.windows.map((w, i) => ({ w, i })).sort((a, b) => Number(audioFindings.has(b.w.id)) - Number(audioFindings.has(a.w.id)) || a.i - b.i).slice(0, 12).map(({ w }) => w).sort((a, b) => a.startSec - b.startSec) } } : {}),
    };
    const key = `episodes/${opts.episodeId}/render-audits/${randomUUID()}.json`;
    await putJson(opts.store, key, { ...report, rangeBasis, target: opts.target ?? "main", exportId: opts.render.exportId, episodeId: opts.episodeId, renderedAt: opts.render.at, at });
    summary.reportKey = key;
    return summary;
  } catch (error) {
    const reason = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    return summary
      ? { ...summary, status: "incomplete", error: reason, checks: [...summary.checks, { name: "report_storage", status: "failed", reason }] }
      : { status: "failed", at, findingsCount: 0, findings: [], checks: [], error: reason };
  }
}

import { describe, expect, it, vi } from "vitest";
import { join } from "node:path";
import { Timeline } from "@ys/core";
import type { RenderAudit } from "@ys/video/audit";
import { acquireLock } from "../src/lock.ts";
import { collectRenderAudit } from "../src/render-audit.ts";
import { harness, makeState, SCRIPT, voiceOf } from "./pipeline-harness.ts";

const render = vi.hoisted(() => vi.fn(async (o: { outputPath: string }) => o.outputPath));
vi.mock("@ys/video/render", () => ({ renderEpisode: render }));

const timeline = () => Timeline.parse({ episodeId: "e", lang: "en", fps: 30, width: 1920, height: 1080, durationInFrames: 120, visuals: [{ shotId: "s1", assetUrl: "", kind: "still_motion", fromFrame: 0, durationInFrames: 120 }], audio: [] });
const report = (): RenderAudit => ({
  version: 1, file: "video.mp4", source: { bytes: 100, modifiedAt: "now" }, durationSec: 4, width: 1920, height: 1080,
  checks: [{ name: "black_and_freeze", status: "complete" }, { name: "local_motion", status: "complete" }, { name: "audio_levels", status: "skipped", reason: "No audio stream." }],
  findings: [{ id: "s1", kind: "low_motion", startSec: 0, endSec: 4, detail: "Little motion" }], motion: [],
});

describe("episode render audit integration", () => {
  it("audits a newly rendered Short with its own frozen ranges and keeps the main audit", async () => {
    const analyzeRender = vi.fn(async () => report()), h = harness({ analyzeRender });
    const id = await h.seed(makeState({ music: false, sfx: false }, { timeline: timeline(), script: SCRIPT, voice: { s1: voiceOf("s1", 4000) }, render: { path: "main.mp4", at: "main-time", audit: { status: "complete", at: "main-audit", findingsCount: 0, findings: [], checks: [] } } }));
    const result = await h.pipeline.run(id, { only: "short" });
    expect(result.short?.audit).toMatchObject({ status: "complete", target: "short", renderedAt: result.short!.at, exportId: result.short!.exportId });
    expect(result.short?.auditRanges).toEqual([{ id: "s1", startSec: 0, endSec: 4 }]);
    expect(analyzeRender).toHaveBeenCalledWith(result.short!.path, result.short!.auditRanges);
    expect(result.render?.audit?.at).toBe("main-audit");
    const ranges = result.short!.auditRanges;
    result.timeline!.visuals[0]!.shotId = "changed-plan";
    await h.pipeline.save(result);
    await h.pipeline.auditRender(id, "short");
    expect(analyzeRender).toHaveBeenLastCalledWith(result.short!.path, ranges);
    expect(h.gateway.requests).toHaveLength(0);
  });

  it("keeps a successful Short when measurements fail and audits legacy Shorts without main-video times", async () => {
    const analyzeRender = vi.fn(async () => { throw new Error("missing decoder"); }), h = harness({ analyzeRender });
    const id = await h.seed(makeState({ music: false }, { timeline: timeline(), script: SCRIPT, voice: { s1: voiceOf("s1", 4000) }, render: { path: "main.mp4", at: "main-time" } }));
    const result = await h.pipeline.run(id, { only: "short" });
    expect(result.short?.audit?.status).toBe("failed");
    expect(result.done.short).toBeDefined();
    delete result.short!.auditRanges; await h.pipeline.save(result);
    await h.pipeline.auditRender(id, "short");
    expect(analyzeRender).toHaveBeenLastCalledWith(result.short!.path, undefined);
  });
  it("uses frozen render ranges after later timeline edits, including when the authoring timeline is absent", async () => {
    const analyzeRender = vi.fn(async () => report());
    const h = harness({ analyzeRender });
    const original = [{ id: "original-shot", startSec: 0, endSec: 4 }];
    const current = timeline(); current.visuals[0]!.shotId = "new-plan";
    const id = await h.seed(makeState({}, { timeline: current, render: { path: "main.mp4", at: "original", auditRanges: original } }));
    const first = await h.pipeline.auditRender(id);
    expect(analyzeRender).toHaveBeenLastCalledWith("main.mp4", original);
    expect(first.render?.audit?.rangeBasis).toBe("render");
    delete first.timeline; await h.pipeline.save(first);
    expect((await h.pipeline.auditRender(id)).render?.audit?.status).toBe("complete");
    expect(analyzeRender).toHaveBeenLastCalledWith("main.mp4", original);
  });

  it("bounds audio summaries and prioritizes later windows with audio findings", async () => {
    const measured = report();
    measured.shotAudio = { sampleRate: 48000, channels: 2, blockDurationSec: .1, coveredUntilSec: 30, referenceDbfs: -20,
      windows: Array.from({ length: 30 }, (_, i) => ({ id: String(i), startSec: i, endSec: i + 1, rmsDbfs: -20, sampledPeakDbfs: -15, relativeDb: 0, previousDeltaDb: 0, coverage: 1, quietShare: 0, envelope: Array<number>(32).fill(.5) })) };
    measured.findings.push({ id: "29", kind: "audio_gap", startSec: 29, endSec: 30, detail: "Quiet ending" });
    const h = harness({ analyzeRender: async () => measured });
    const id = await h.seed(makeState({}, { timeline: timeline(), render: { path: "main.mp4", at: "t" } }));
    const state = await h.pipeline.auditRender(id);
    expect(state.render!.audit!.shotAudio!.windowsCount).toBe(30);
    expect(state.render!.audit!.shotAudio!.windows).toHaveLength(12);
    expect(state.render!.audit!.shotAudio!.windows.at(-1)!.id).toBe("29");
    const full = h.store.json(state.render!.audit!.reportKey!);
    expect(full.shotAudio.windows).toHaveLength(30);
    expect(full.rangeBasis).toBe("current_timeline");
  });
  it("automatically persists a full report and a bounded summary after rendering", async () => {
    const result = report();
    result.findings = Array.from({ length: 30 }, (_, i) => ({ ...result.findings[0]!, id: String(i) }));
    const analyzeRender = vi.fn(async () => result);
    const h = harness({ analyzeRender });
    const id = await h.seed(makeState({}, { timeline: timeline() }));
    const state = await h.pipeline.run(id, { only: "render" });
    expect(analyzeRender).toHaveBeenCalledWith(state.render!.path, [{ id: "s1", startSec: 0, endSec: 4 }]);
    expect(state.done.render).toBeDefined();
    expect(state.render?.audit).toMatchObject({ status: "complete", findingsCount: 30 });
    expect(state.render?.auditRanges).toEqual([{ id: "s1", startSec: 0, endSec: 4 }]);
    expect(state.render?.audit?.rangeBasis).toBe("render");
    expect(state.render!.audit!.findings).toHaveLength(12);
    const artifact = h.store.json(state.render!.audit!.reportKey!);
    expect(artifact.findings).toHaveLength(30);
    expect(artifact.renderedAt).toBe(state.render!.at);
    expect((await h.load(id)).render?.audit).toEqual(state.render?.audit);
    expect(h.gateway.requests).toHaveLength(0);
  });

  it("replaces stale evidence and keeps a successful video when analysis fails", async () => {
    const h = harness({ analyzeRender: async () => { throw new Error("decoder unavailable"); } });
    const id = await h.seed(makeState({}, { timeline: timeline(), render: { path: "old.mp4", at: "old", audit: { status: "complete", at: "old", findingsCount: 0, findings: [], checks: [], reportKey: "old.json" } } }));
    const state = await h.pipeline.run(id, { only: "render" });
    expect(state.done.render).toBeDefined();
    expect(state.render?.audit).toMatchObject({ status: "failed", error: "decoder unavailable" });
    expect(state.render?.audit?.reportKey).toBeUndefined();
    expect(state.lastError).toBeUndefined();
  });

  it("distinguishes a partial check from complete measurements", async () => {
    const measured = report();
    measured.checks.push({ name: "local_motion", status: "failed", reason: "sample budget exceeded" });
    const h = harness({ analyzeRender: async () => measured });
    const id = await h.seed(makeState({}, { timeline: timeline(), render: { path: "main.mp4", at: "t" } }));
    const state = await h.pipeline.auditRender(id);
    expect(state.render?.audit?.status).toBe("incomplete");
    expect(state.render?.audit?.reportKey).toBeDefined();
    expect(state.done).toEqual({});
  });

  it("keeps findings but marks report-storage failure incomplete", async () => {
    const h = harness({ analyzeRender: async () => report() });
    const id = await h.seed(makeState({}, { timeline: timeline(), render: { path: "main.mp4", at: "t" } }));
    h.store.failPut = (key) => key.includes("/render-audits/");
    const state = await h.pipeline.auditRender(id);
    expect(state.render?.audit).toMatchObject({ status: "incomplete", findingsCount: 1 });
    expect(state.render?.audit?.checks).toContainEqual(expect.objectContaining({ name: "report_storage", status: "failed" }));
    expect(state.render?.audit?.reportKey).toBeUndefined();
  });

  it("reruns measurements without changing the render identity or invoking rendering", async () => {
    const h = harness({ analyzeRender: async () => report() });
    const id = await h.seed(makeState({}, { timeline: timeline(), render: { path: "main.mp4", at: "original" }, done: { render: "done" } }));
    const calls = render.mock.calls.length;
    const first = await h.pipeline.auditRender(id);
    const second = await h.pipeline.auditRender(id);
    expect(first.render?.audit?.reportKey).not.toBe(second.render?.audit?.reportKey);
    expect(second.render).toMatchObject({ path: "main.mp4", at: "original" });
    expect(second.done.render).toBe("done");
    expect(render.mock.calls.length).toBe(calls);
    expect(h.gateway.requests).toHaveLength(0);
  });

  it("requires an existing render and respects the episode lock", async () => {
    const h = harness({ analyzeRender: async () => report() });
    const id = await h.seed(makeState());
    await expect(h.pipeline.auditRender(id)).rejects.toThrow("timeline/render");
    const release = await acquireLock(h.store, id);
    try { await expect(h.pipeline.auditRender(id)).rejects.toThrow(); } finally { await release(); }
  });
  it("rejects unknown targets/missing Shorts and preserves a report despite a lock-release I/O failure", async () => {
    const h = harness({ analyzeRender: async () => report() }), id = await h.seed(makeState({}, { timeline: timeline(), render: { path: "main.mp4", at: "t" } }));
    await expect(h.pipeline.auditRender(id, "other" as never)).rejects.toThrow("Unknown export target");
    await expect(h.pipeline.auditRender(id, "short")).rejects.toThrow("short");
    const compare = h.store.compareAndSwap.bind(h.store);
    h.store.compareAndSwap = async (key, expected, bytes) => { if (new TextDecoder().decode(bytes) === "null") throw new Error("Release unavailable"); return compare(key, expected, bytes); };
    expect((await h.pipeline.auditRender(id)).render!.audit!.status).toBe("complete");
  });
  it("keeps standalone collection failures and absent range metadata explicit", async () => {
    const h = harness(), opts = { episodeId: "e", render: { path: "main", at: "t" }, store: h.store };
    expect(await collectRenderAudit(opts)).toMatchObject({ status: "failed", error: "No render or timeline ranges are available" });
    const measured = { ...report(), audio: { integratedLufs: -14, truePeakDbfs: -2 } };
    expect(await collectRenderAudit({ ...opts, timeline: timeline(), analyze: async () => measured })).toMatchObject({ status: "complete", target: "main", audio: measured.audio });
    expect(await collectRenderAudit({ ...opts, target: "short", analyze: async () => { throw "decoder offline"; } })).toMatchObject({ status: "failed", error: "decoder offline" });
    expect((await collectRenderAudit({ ...opts, target: "short", render: { path: join(h.workDir, "missing-video.mp4"), at: "t" } })).status).toBe("failed");
    const id = await h.seed(makeState()); expect((await h.pipeline.auditVoice(id)).voiceAudit!.status).toBe("failed");
    await expect(h.pipeline.rewriteScript(id)).rejects.toThrow("story");
  });
});

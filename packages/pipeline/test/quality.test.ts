import { mkdtemp, writeFile, stat, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { putJson } from "@ys/storage";
import { VectorShot } from "@ys/core";
import { mutateResearch } from "../src/research.ts";
import { decideQuality, exportIdentity, qualityView } from "../src/quality.ts";
import { collectVoiceAudit } from "../src/voice-audit.ts";
import { acquireLock } from "../src/lock.ts";
import { makeState, MemStore } from "./pipeline-harness.ts";

const dirs: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "ys-quality-")); dirs.push(dir);
  const path = join(dir, "main.mp4"); await writeFile(path, "fixture");
  const file = await stat(path), store = new MemStore(), source = { bytes: file.size, modifiedAt: file.mtime.toISOString() };
  const state = makeState({}, { render: { path, at: "render-time", exportId: "v1", audit: { status: "complete", at: "audit-time", renderedAt: "render-time", exportId: "v1", source, reportKey: "episodes/e/render-audits/report.json", findingsCount: 80, findings: [], checks: [{ name: "editorial", status: "skipped" }] } } });
  state.id = "e";
  await putJson(store, state.render!.audit!.reportKey!, { renderedAt: "render-time", exportId: "v1", target: "main", findings: Array.from({ length: 80 }, (_, i) => ({ id: `s${i}`, kind: "low_motion", startSec: i, endSec: i + 1, detail: `Finding ${i}` })) });
  return { state, store };
}
describe("quality evidence and decisions", () => {
  it("shows unresolved sourced claims as plan evidence and preserves other findings if research is unreadable", async () => {
    const { state, store } = await fixture();
    state.script = { scenes: [{ id: "s1", narration: "A fixture claim.", beatId: "b", visualIntent: "Fixture", emotion: "calm", location: "lab" }] };
    await mutateResearch({ id: "e", store, load: async () => state, expectedRevision: 0, mutation: { type: "put-claim", claim: { sceneId: "s1", quote: "A fixture claim.", statement: "A fixture claim", kind: "fact", links: [] } } });
    const view = await qualityView(state, store);
    expect(view.issues.find((i) => i.source === "research")).toMatchObject({ target: "plan", kind: "claim_unreviewed" });
    store.putText("episodes/e/research/book.json", "not json");
    const damaged = await qualityView(state, store);
    expect(damaged.issues.filter((i) => i.source === "audit")).toHaveLength(80);
    expect(damaged.notices.some((n) => n.startsWith("research: failed"))).toBe(true);
  });
  it("exposes intent contradictions as read-only plan evidence without altering the export", async () => {
    const { state, store } = await fixture();
    state.shots = [{ id: "s1", sceneId: "scene", kind: "still_motion", startMs: 0, endMs: 2000, camera: "static", description: "A hero", imagePrompt: "", motionPrompt: "", vector: VectorShot.parse({}), intent: { subject: "missing", action: "typing", payoff: "Text appears", narration: { startWord: 0, endWord: 1 }, reveal: .9, holdSec: 2 } }];
    const before = JSON.stringify(state), view = await qualityView(state, store);
    const issues = view.issues.filter((i) => i.source === "intent");
    expect(issues.some((i) => i.kind === "intent_hold_overrun")).toBe(true);
    expect(issues.every((i) => i.target === "plan" && !i.exportId)).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("loads all findings separately from polling, combines preview sources and preserves skipped checks", async () => {
    const { state, store } = await fixture();
    state.review = { at: "review", shots: { s1: { score: 4, issues: [{ type: "off_story", detail: "Wrong action" }] } }, lessons: [] };
    const view = await qualityView(state, store);
    expect(view.issues).toHaveLength(81);
    expect(view.issues.at(-1)).toMatchObject({ target: "plan", source: "review", status: "open" });
    expect(view.issues.at(-1)!.exportId).toBeUndefined();
    expect(view.notices).toContain("main: editorial skipped");
  });
  it("keeps decisions only for identical exports and evidence, and rejects stale requests", async () => {
    const { state, store } = await fixture();
    const issue = (await qualityView(state, store)).issues[0]!;
    const decide = (status: "accepted" | "fix-needed") => decideQuality({ id: "e", store, load: async () => state, issueKey: issue.key, exportId: "v1", status });
    await decide("accepted");
    expect((await qualityView(state, store)).issues[0]!.status).toBe("accepted");
    state.render!.exportId = "v2";
    expect((await qualityView(state, store)).issues).toHaveLength(0);
    expect((await qualityView(state, store)).historicalDecisions).toBe(1);
    await expect(decide("fix-needed")).rejects.toThrow("Evidence changed");
    expect(await store.get("episodes/e/quality-decisions.json")).not.toBeNull();
  });
  it("does not retain an accepted decision if the encoded file changes", async () => {
    const { state, store } = await fixture();
    const issue = (await qualityView(state, store)).issues[0]!;
    const opts = { id: "e", store, load: async () => state, issueKey: issue.key, exportId: "v1", status: "accepted" as const };
    await decideQuality(opts);
    await writeFile(state.render!.path, "a different file");
    const changed = await qualityView(state, store);
    expect(changed.issues[0]!.status).toBe("open");
    expect(changed.issues[0]!.exportId).toBeUndefined();
    await expect(decideQuality(opts)).rejects.toThrow("Evidence changed");
  });
  it("rejects concurrent producers, unknown issues and invalid decisions", async () => {
    const { state, store } = await fixture();
    const issue = (await qualityView(state, store)).issues[0]!;
    const opts = { id: "e", store, load: async () => state, issueKey: issue.key, exportId: "v1", status: "reviewed" as const };
    const release = await acquireLock(store, "e");
    try { await expect(decideQuality(opts)).rejects.toThrow(); } finally { await release(); }
    await expect(decideQuality({ ...opts, issueKey: "x" })).rejects.toThrow("Invalid");
    await expect(decideQuality({ ...opts, issueKey: "0".repeat(64) })).rejects.toThrow("Evidence changed");
  });
  it("does not approve absent, stale, mismatched or unreadable audit evidence", async () => {
    const { state, store } = await fixture(), audit = state.render!.audit!;
    const original = store.json(audit.reportKey!);
    for (const bad of [null, { ...original, renderedAt: "old" }, { ...original, target: "short" }, { ...original, exportId: "old" }]) {
      store.putJsonSync(audit.reportKey!, bad);
      expect((await qualityView(state, store)).notices).toContain("main: Audit artifact does not match export");
    }
    store.putJsonSync(audit.reportKey!, { ...original, target: undefined, findings: [original.findings[0], original.findings[0]] });
    expect((await qualityView(state, store)).issues).toHaveLength(1);
    const reportKey = audit.reportKey!;
    for (const key of ["other/report.json", "episodes/e/render-audits/../escape.json"]) { audit.reportKey = key; expect((await qualityView(state, store)).notices).toContain("main: Invalid audit artifact"); }
    audit.reportKey = reportKey; audit.error = "Partial decoder failure";
    audit.checks = [{ name: "motion", status: "complete" }, { name: "audio", status: "failed", reason: "No samples" }];
    audit.renderedAt = "old"; expect((await qualityView(state, store)).notices).toContain("main: stale audit; rerun measurements");
    audit.renderedAt = state.render!.at; delete audit.reportKey;
    expect((await qualityView(state, store)).notices).toContain("main: findings unavailable without the full report");
    audit.findingsCount = 0; delete audit.source;
    expect((await qualityView(state, store)).notices).toContain("main: Partial decoder failure");
    delete state.render!.audit; expect((await qualityView(state, store)).notices).toContain("main: audit absent");
    const first = exportIdentity({ path: "legacy.mp4", at: "t" });
    expect(first).toBe(exportIdentity({ path: "legacy.mp4", at: "t" })); expect(first).not.toBe(exportIdentity({ path: "legacy.mp4", at: "new" }));
  });
  it("binds Short and style decisions to the correct current export", async () => {
    const { state, store } = await fixture();
    const short = { ...structuredClone(state.render!), title: "Short", scenes: ["s1"], sec: 4 };
    state.short = short; delete state.render;
    const key = short.audit!.reportKey!; store.putJsonSync(key, { ...store.json<Record<string, unknown>>(key), target: "short" });
    const issue = (await qualityView(state, store)).issues[0]!;
    await decideQuality({ id: "e", store, load: async () => state, issueKey: issue.key, exportId: "v1", status: "reviewed" });
    expect((await qualityView(state, store)).issues[0]!.status).toBe("reviewed");
    const main = state.render = { ...short }; delete state.short; delete main.audit;
    const file = await stat(main.path), reportKey = "episodes/e/style-comparisons/report.json";
    main.styleComparison = { status: "complete", at: "style-t", compared: 1, eligible: 1, excludedArchive: 0, reportKey, findings: [{ shotId: "s", seconds: 1, flags: ["palette"] }] };
    const report = { renderedAt: main.at, source: { size: file.size, mtimeMs: file.mtimeMs } };
    store.putJsonSync(reportKey, report);
    const styleIssue = (await qualityView(state, store)).issues[0]!;
    await decideQuality({ id: "e", store, load: async () => state, issueKey: styleIssue.key, exportId: "v1", status: "accepted" });
    expect((await qualityView(state, store)).issues[0]!.status).toBe("accepted");
    for (const bad of [null, { ...report, renderedAt: "old" }, { ...report, source: { ...report.source, size: -1 } }, { ...report, source: { ...report.source, mtimeMs: -1 } }]) {
      store.putJsonSync(reportKey, bad); const view = await qualityView(state, store);
      expect(view.issues[0]!.exportId).toBeUndefined(); expect(view.notices).toContain("main: style evidence changed or missing; compare again");
    }
    for (const path of [undefined, "wrong/report.json", "episodes/e/style-comparisons/../bad.json"]) { main.styleComparison.reportKey = path; expect((await qualityView(state, store)).issues[0]!.status).toBe("open"); }
    main.styleComparison.error = "No frames"; expect((await qualityView(state, store)).notices).toContain("main: No frames");
    main.styleComparison.reportKey = reportKey; store.putJsonSync(reportKey, report); await rm(main.path);
    expect((await qualityView(state, store)).issues[0]!.exportId).toBeUndefined();
  });
  it("rechecks encoded bytes after collecting evidence while holding producer ownership", async () => {
    const { state, store } = await fixture(), issue = (await qualityView(state, store)).issues[0]!;
    const get = store.get.bind(store);
    vi.spyOn(store, "get").mockImplementation(async (key) => { if (key.endsWith("research/book.json")) await writeFile(state.render!.path, "changed during evidence reads"); return get(key); });
    await expect(decideQuality({ id: "e", store, load: async () => state, issueKey: issue.key, exportId: "v1", status: "accepted" })).rejects.toThrow("Export file changed");
    expect(await get("episodes/e/quality-decisions.json")).toBeNull();
  });
  it("rejects a lost audit source identity or changed style file during evidence collection", async () => {
    const { state, store } = await fixture(), issue = (await qualityView(state, store)).issues[0]!;
    const get = store.get.bind(store);
    const spy = vi.spyOn(store, "get").mockImplementation(async (key) => { if (key.endsWith("research/book.json")) delete state.render!.audit!.source; return get(key); });
    await expect(decideQuality({ id: "e", store, load: async () => state, issueKey: issue.key, exportId: "v1", status: "accepted" })).rejects.toThrow("Rerun the audit");
    spy.mockRestore(); delete state.render!.audit;
    const file = await stat(state.render!.path), reportKey = "episodes/e/style-comparisons/report.json";
    state.render!.styleComparison = { status: "complete", at: "t", compared: 1, eligible: 1, excludedArchive: 0, reportKey, findings: [{ shotId: "s", seconds: 0, flags: ["palette"] }] };
    store.putJsonSync(reportKey, { renderedAt: state.render!.at, source: { size: file.size, mtimeMs: file.mtimeMs } });
    const styleIssue = (await qualityView(state, store)).issues[0]!;
    vi.spyOn(store, "get").mockImplementation(async (key) => { if (key.endsWith("research/book.json")) await writeFile(state.render!.path, "changed style source"); return get(key); });
    await expect(decideQuality({ id: "e", store, load: async () => state, issueKey: styleIssue.key, exportId: "v1", status: "accepted" })).rejects.toThrow("Export file changed");
  });
  it("bounds decision history, permits updating an existing entry, and rejects authoring-plan approvals", async () => {
    const { state, store } = await fixture(), issue = (await qualityView(state, store)).issues[0]!;
    const entries = Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [String(i), { exportId: "old", at: "t", status: "accepted" }]));
    store.putJsonSync("episodes/e/quality-decisions.json", entries);
    const opts = { id: "e", store, load: async () => state, issueKey: issue.key, exportId: "v1", status: "reviewed" as const };
    await expect(decideQuality(opts)).rejects.toThrow("history limit");
    delete entries["0"]; entries[issue.key] = { exportId: "v1", at: "t", status: "accepted" }; store.putJsonSync("episodes/e/quality-decisions.json", entries);
    await decideQuality(opts); expect((await qualityView(state, store)).issues[0]!.status).toBe("reviewed");
    state.lint = { at: "t", issues: [{ code: "sample", detail: "Review", shotId: "s" }] } as never;
    const plan = (await qualityView(state, store)).issues.find((i) => i.source === "lint")!;
    await expect(decideQuality({ ...opts, issueKey: plan.key, exportId: undefined as never })).rejects.toThrow("Evidence changed");
    await expect(decideQuality({ ...opts, status: "invalid" as never })).rejects.toThrow("Invalid quality decision");
  });
  it("retains advisory voice failures, missing reports and non-Error storage failures", async () => {
    const { state, store } = await fixture();
    state.voiceAudit = { status: "failed", at: "t", fingerprint: "f", scenes: 0, findingsCount: 0, findings: [], error: "Missing script" };
    expect((await qualityView(state, store)).notices).toContain("voice: report absent");
    state.script = { scenes: [{ id: "s1", beatId: "b", narration: "Voice expected", visualIntent: "", emotion: "", location: "" }] };
    state.voiceAudit = await collectVoiceAudit(state, store, async () => { throw new Error("Not called without a voice"); });
    expect((await qualityView(state, store)).issues).toContainEqual(expect.objectContaining({ source: "voice", kind: "voice_missing" }));
    const report = store.json(state.voiceAudit.reportKey!); delete report.scenes[0].checks.find((c: { name: string }) => c.name === "source").reason;
    store.putJsonSync(state.voiceAudit.reportKey!, report); state.voiceAudit.reportHash = createHash("sha256").update(JSON.stringify(report)).digest("hex");
    expect((await qualityView(state, store)).notices).toContain("voice s1: source failed");
    state.script.scenes[0]!.narration = "Changed"; expect((await qualityView(state, store)).notices.some((n) => n.startsWith("voice: stale"))).toBe(true);
    const get = store.get.bind(store);
    vi.spyOn(store, "get").mockImplementation(async (key) => { if (key.includes("/voice-audits/") || key.includes("/render-audits/") || key.endsWith("research/book.json")) throw "storage offline"; return get(key); });
    const view = await qualityView(state, store);
    expect(view.notices).toEqual(expect.arrayContaining(["main: storage offline", "voice: failed — storage offline", "research: failed — storage offline"]));
  });
});

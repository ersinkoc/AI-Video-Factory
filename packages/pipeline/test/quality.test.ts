import { mkdtemp, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { putJson } from "@ys/storage";
import { VectorShot } from "@ys/core";
import { mutateResearch } from "../src/research.ts";
import { decideQuality, qualityView } from "../src/quality.ts";
import { acquireLock } from "../src/lock.ts";
import { makeState, MemStore } from "./pipeline-harness.ts";

const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
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
});

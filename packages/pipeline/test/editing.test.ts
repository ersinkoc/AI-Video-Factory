import { describe, expect, it } from "vitest";
import { EpisodeRepo, editNarration } from "../src/actions.ts";
import { episodeFingerprint, previewNarrationEdit, previewNarrationUndo, saveNarrationEdit, undoNarrationEdit } from "../src/editing.ts";
import { acquireLock } from "../src/lock.ts";
import { STAGES } from "../src/state.ts";
import { makeState, MemStore, SCRIPT, voiceOf } from "./pipeline-harness.ts";

async function fixture() {
  const store = new MemStore(), repo = new EpisodeRepo(store);
  const state = makeState({}, { script: structuredClone(SCRIPT), done: Object.fromEntries(STAGES.map((s) => [s, "done"])), voice: { s1: voiceOf("s1"), s2: voiceOf("s2") }, approvals: { concept: "c", preview: "p" }, render: { path: "old.mp4", at: "old-time", exportId: "old-export" }, shots: [{ id: "shot-1", sceneId: "s1" } as never] });
  state.id = "edit-fixture"; await repo.save(state);
  const save = (narration = "A changed narration.", fingerprint = episodeFingerprint(state)) => saveNarrationEdit({ id: state.id, store, repo, sceneId: "s1", narration, fingerprint });
  return { state, store, repo, save };
}
describe("reviewed narration revisions", () => {
  it("derives the preview from actual invalidation, preserving other audio and the prior export", async () => {
    const f = await fixture(), before = structuredClone(f.state);
    const preview = previewNarrationEdit(f.state, "s1", "A changed narration.");
    expect(f.state).toEqual(before);
    expect(preview).toMatchObject({ regenerateVoice: ["s1"], retainedVoice: ["s2"], timingScenes: ["s1", "s2"], relatedShots: ["shot-1"], retainedExport: "old-export" });
    await f.save(); const next = await f.repo.load(f.state.id);
    expect(STAGES.filter((s) => before.done[s] && !next.done[s])).toEqual(preview.clearedStages);
    expect(next.voice?.s1).toBeUndefined(); expect(next.voice?.s2).toEqual(before.voice!.s2);
    expect(next.done.concept).toBe("done"); expect(next.render).toEqual(before.render);
    expect(next.approvals).toEqual({ concept: "c" });
  });
  it("restores exact saved revisions after reload and supports consecutive undo without deleting artifacts", async () => {
    const f = await fixture(); await f.save(); const first = await f.repo.load(f.state.id);
    await f.save("Another change.", episodeFingerprint(first)); const second = await f.repo.load(f.state.id);
    const reloadedRepo = new EpisodeRepo(f.store);
    await undoNarrationEdit({ id: second.id, store: f.store, repo: reloadedRepo, editId: second.narrationEdit!.id, fingerprint: episodeFingerprint(second) });
    expect(await reloadedRepo.load(second.id)).toEqual(first);
    await undoNarrationEdit({ id: first.id, store: f.store, repo: reloadedRepo, editId: first.narrationEdit!.id, fingerprint: episodeFingerprint(first) });
    expect(await reloadedRepo.load(first.id)).toEqual(f.state);
    expect(await f.store.list(`episodes/${first.id}/edits/`)).toHaveLength(2);
    await expect(previewNarrationUndo(f.store, f.state, first.narrationEdit!.id)).rejects.toThrow("artık geri alınamaz");
  });
  it("rejects stale previews and undo after intervening production or a different edit", async () => {
    const f = await fixture(); f.state.input.budgetUsd++; await f.repo.save(f.state);
    await expect(f.save("Changed", "0".repeat(64))).rejects.toThrow("önizlemeden sonra");
    await f.save(); const next = await f.repo.load(f.state.id);
    next.agentCostUsd++; await f.repo.save(next);
    await expect(previewNarrationUndo(f.store, next, next.narrationEdit!.id)).rejects.toThrow("artık geri alınamaz");
    await expect(undoNarrationEdit({ id: next.id, store: f.store, repo: f.repo, editId: next.narrationEdit!.id, fingerprint: "0".repeat(64) })).rejects.toThrow("önizlemeden sonra");
  });
  it("rejects corrupted history and cannot restore another episode", async () => {
    const f = await fixture(); await f.save(); const next = await f.repo.load(f.state.id);
    const key = (await f.store.list(`episodes/${next.id}/edits/`))[0]!, record = f.store.json(key);
    record.before.input.topic = "Tampered"; f.store.putJsonSync(key, record);
    await expect(previewNarrationUndo(f.store, next, next.narrationEdit!.id)).rejects.toThrow("artık geri alınamaz");
    record.before.id = "other"; f.store.putJsonSync(key, record);
    await expect(previewNarrationUndo(f.store, next, next.narrationEdit!.id)).rejects.toThrow("artık geri alınamaz");
  });
  it.each(["script", "scene"])("refuses a hash-consistent undo record without the original %s", async (missing) => {
    const f = await fixture(); await f.save(); const next = await f.repo.load(f.state.id);
    const key = (await f.store.list(`episodes/${next.id}/edits/`))[0]!, record = f.store.json(key);
    if (missing === "script") delete record.before.script;
    else record.before.script.scenes = record.before.script.scenes.filter((s: { id: string }) => s.id !== record.sceneId);
    record.beforeFingerprint = episodeFingerprint(record.before); f.store.putJsonSync(key, record);
    await expect(previewNarrationUndo(f.store, next, next.narrationEdit!.id)).rejects.toThrow("artık geri alınamaz");
    expect(await f.repo.load(next.id)).toEqual(next);
  });
  it("retains the prior state on history or state write failure and excludes concurrent producers", async () => {
    const f = await fixture(), before = await f.repo.load(f.state.id);
    f.store.failPut = (key) => key.includes("/edits/");
    await expect(f.save()).rejects.toThrow("yazılamadı");
    expect(await f.repo.load(f.state.id)).toEqual(before);
    f.store.failPut = (key) => key.endsWith("/state.json");
    await expect(f.save()).rejects.toThrow("yazılamadı");
    expect(await f.repo.load(f.state.id)).toEqual(before);
    f.store.failPut = undefined;
    const release = await acquireLock(f.store, f.state.id);
    try { await expect(f.save()).rejects.toThrow(); } finally { await release(); }
  });
  it("prevents older human update paths from writing through the edit lock and releases on errors", async () => {
    const f = await fixture(), release = await acquireLock(f.store, f.state.id);
    try {
      await expect(f.repo.update(f.state.id, (s) => { s.input.topic = "Overwrite"; })).rejects.toThrow();
      expect(await f.repo.load(f.state.id)).toEqual(f.state);
    } finally { await release(); }
    await expect(f.repo.update(f.state.id, () => { throw new Error("Interrupted edit"); })).rejects.toThrow("Interrupted edit");
    await f.repo.update(f.state.id, (s) => { s.input.topic = "After failure"; });
    expect((await f.repo.load(f.state.id)).input.topic).toBe("After failure");
  });
  it("keeps identical edits as no-ops, including voice, completion markers and history", async () => {
    const f = await fixture();
    const preview = previewNarrationEdit(f.state, "s1", `  ${SCRIPT.scenes[0]!.narration}  `);
    expect(preview.changed).toBe(false); expect(preview.stages).toEqual([]);
    await f.save(`  ${SCRIPT.scenes[0]!.narration}  `);
    expect(await f.repo.load(f.state.id)).toEqual(f.state);
    expect(await f.store.list(`episodes/${f.state.id}/edits/`)).toEqual([]);
  });
  it.each(["", "   ", "x".repeat(20_001)])("rejects empty or oversized narration without mutation", async (text) => {
    const f = await fixture(), before = structuredClone(f.state);
    expect(() => editNarration(f.state, "s1", text)).toThrow("20.000"); expect(f.state).toEqual(before);
  });
});

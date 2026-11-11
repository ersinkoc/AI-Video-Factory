import { describe, expect, it } from "vitest";
import { acquireLock } from "../src/lock.ts";
import { collectWriterClaims, freezeResearch, loadResearch, mutateResearch, readResearchExport, researchContext, researchCredits, researchView } from "../src/research.ts";
import { makeState, MemStore, SCRIPT } from "./pipeline-harness.ts";

async function fixture() {
  const store = new MemStore(), state = makeState({}, { script: { scenes: [{ ...SCRIPT.scenes[0]!, narration: "The rig completed 48 cycles. An estimate follows." }] }, shots: [{ id: "shot-1", sceneId: "s1" } as never] }); state.id = "e";
  const mutate = async (mutation: unknown, expectedRevision?: number) => mutateResearch({ id: "e", store, load: async () => state, expectedRevision: expectedRevision ?? (await loadResearch(store, "e")).revision, mutation });
  await mutate({ type: "put-source", source: { title: "Lab note", url: "https://example.org/lab", excerpt: "The rig completed 48 cycles.", locator: "Section 2" } });
  const source = (await loadResearch(store, "e")).sources[0]!;
  await mutate({ type: "put-claim", claim: { sceneId: "s1", quote: "The rig completed 48 cycles.", statement: "The test completed 48 cycles", kind: "fact", links: [{ sourceId: source.id, relation: "supports" }] } });
  const view = () => loadResearch(store, "e").then((book) => researchView(book, state));
  const review = async (status: "supported" | "disputed" | "excluded" | "needs-source") => { const claim = (await view()).claims[0]!; await mutate({ type: "review-claim", claimId: claim.id, fingerprint: claim.fingerprint, status }); };
  return { store, state, mutate, source, view, review };
}
describe("claim/source lifecycle", () => {
  it("requires an explicit editorial review and invalidates it after narration or linked evidence changes", async () => {
    const f = await fixture();
    expect((await f.view()).claims[0]).toMatchObject({ status: "unreviewed", dependentShots: ["shot-1"] });
    await f.review("supported"); expect((await f.view()).claims[0]!.status).toBe("supported");
    await f.mutate({ type: "put-source", source: { ...f.source, excerpt: "The count was corrected to 47." } });
    expect((await f.view()).claims[0]!.status).toBe("stale");
    f.state.script!.scenes[0]!.narration += " New sentence.";
    expect((await f.view()).claims[0]!.anchorCurrent).toBe(false);
    await expect(f.review("supported")).rejects.toThrow("değişti");
    expect((await f.store.list("episodes/e/research/history/")).length).toBe(4);
  });
  it("rejects unknown sources, false anchors, stale revisions, unsupported decisions and concurrent producers", async () => {
    const f = await fixture(); const claim = (await f.view()).claims[0]!;
    await expect(f.mutate({ type: "put-source", source: { ...f.source, title: "New" } }, 0)).rejects.toThrow("değişti");
    await expect(f.mutate({ type: "put-claim", claim: { ...claim, quote: "Not in narration" } })).rejects.toThrow("birebir");
    await expect(f.mutate({ type: "put-claim", claim: { ...claim, links: [{ sourceId: "unknown", relation: "supports" }] } })).rejects.toThrow("bulunamadı");
    await expect(f.review("excluded")).rejects.toThrow("yalnız");
    await f.mutate({ type: "put-source", source: { ...f.source, excerpt: "" } });
    await expect(f.review("supported")).rejects.toThrow("alıntısı gerekli");
    const release = await acquireLock(f.store, "e");
    try { await expect(f.mutate({ type: "put-source", source: { title: "Other", url: "https://example.org/" } })).rejects.toThrow(); } finally { await release(); }
  });
  it("retains contradictory evidence, allows disputed review and does not exempt factual assertions", async () => {
    const f = await fixture(), claim = (await f.view()).claims[0]!;
    await f.mutate({ type: "put-claim", claim: { ...claim, links: [{ sourceId: f.source.id, relation: "contradicts" }] } });
    await expect(f.review("supported")).rejects.toThrow("çelişen");
    await f.review("disputed"); expect((await f.view()).unresolved).toBe(1);
    await f.mutate({ type: "put-claim", claim: { ...claim, kind: "reconstruction" } });
    await f.review("excluded"); expect((await f.view()).unresolved).toBe(0);
  });
  it("freezes exact export evidence and credits it independently of later source/script edits", async () => {
    const f = await fixture(); await f.review("supported");
    f.state.render = { path: "main.mp4", at: "render-time", exportId: "export-1" };
    f.state.render.research = await freezeResearch(f.store, f.state);
    const frozen = await readResearchExport(f.store, f.state);
    await f.mutate({ type: "put-source", source: { ...f.source, title: "Changed source" } });
    f.state.script!.scenes[0]!.narration = "New narration";
    expect((await readResearchExport(f.store, f.state)).claims[0]!.status).toBe("supported");
    expect(await researchCredits(f.store, f.state)).toEqual(["Anlatım kaynakları:", "Lab note — https://example.org/lab"]);
    expect(frozen.exportId).toBe("export-1");
    f.state.render.exportId = "export-2";
    await expect(readResearchExport(f.store, f.state)).rejects.toThrow("değişti");
  });
  it("detects tampering in a frozen artifact and keeps legacy exports without research readable", async () => {
    const f = await fixture(); f.state.render = { path: "main.mp4", at: "render-time", exportId: "export-1" };
    expect(await researchCredits(f.store, f.state)).toEqual([]);
    f.state.render.research = await freezeResearch(f.store, f.state);
    const key = f.state.render.research!.reportKey, record = f.store.json(key);
    record.sources[0].title = "Tampered title"; f.store.putJsonSync(key, record);
    await expect(readResearchExport(f.store, f.state)).rejects.toThrow("değişti");
    expect(researchContext({ version: 1, revision: 0, updatedAt: "", sources: [], claims: [] })).toBeUndefined();
  });
  it("keeps failed history/current writes from losing the prior book", async () => {
    const f = await fixture(), before = await loadResearch(f.store, "e");
    f.store.failPut = (key) => key.endsWith("/book.json");
    await expect(f.mutate({ type: "put-source", source: { ...f.source, title: "Interrupted" } })).rejects.toThrow("yazılamadı");
    expect(await loadResearch(f.store, "e")).toEqual(before);
  });
  it("collects writer annotations only as unreviewed candidates and never creates fabricated sources", async () => {
    const f = await fixture(), scene = f.state.script!.scenes[0]!;
    scene.claims = [{ quote: "48 cycles", kind: "fact", sourceIds: [f.source.id, "fabricated-source"] }, { quote: "Invented narration", kind: "fact", sourceIds: [f.source.id] }];
    expect(await collectWriterClaims(f.store, f.state)).toBe(1);
    expect(await collectWriterClaims(f.store, f.state)).toBe(0);
    const book = await loadResearch(f.store, "e"), generated = book.claims.find((c) => c.origin === "writer")!;
    expect(generated.links).toEqual([{ sourceId: f.source.id, relation: "supports" }]);
    expect(generated.review).toBeUndefined(); expect(book.sources).toHaveLength(1);
    const context = researchContext(book)!;
    expect(context.sources[0]!.excerpt).toContain("48 cycles"); expect(context.claims).toHaveLength(2);
    expect(await loadResearch(new MemStore(), "legacy")).toMatchObject({ revision: 0, sources: [], claims: [] });
  });
  it("rejects missing record IDs, source limits and invalid frozen paths", async () => {
    const f = await fixture(), book = await loadResearch(f.store, "e"), claim = book.claims[0]!;
    await expect(f.mutate({ type: "put-source", source: { ...f.source, id: "unknown" } })).rejects.toThrow("bulunamadı");
    await expect(f.mutate({ type: "put-claim", claim: { ...claim, id: "unknown" } })).rejects.toThrow("bulunamadı");
    await expect(f.mutate({ type: "review-claim", claimId: "unknown", fingerprint: "a".repeat(64), status: "needs-source" })).rejects.toThrow("bulunamadı");
    book.sources = Array.from({ length: 80 }, (_, i) => ({ ...f.source, id: `source-${i}` }));
    f.store.putJsonSync("episodes/e/research/book.json", book);
    await expect(f.mutate({ type: "put-source", source: { title: "One too many", url: "https://example.org/" } })).rejects.toThrow("geçersiz");
    expect((await loadResearch(f.store, "e")).sources).toHaveLength(80);
    expect(researchView({ ...book, sources: [] }, f.state).claims[0]!.status).toBe("unreviewed");
    await expect(readResearchExport(f.store, f.state)).rejects.toThrow("bulunamadı");
    f.state.render = { path: "main.mp4", at: "t", research: { reportKey: "other/report.json", revision: 0, fingerprint: "f", claims: 0, sources: 0, unresolved: 0 } };
    for (const key of ["other/report.json", "episodes/e/research/exports/../bad.json", "episodes/e/research/exports/missing.json"]) { f.state.render.research!.reportKey = key; await expect(readResearchExport(f.store, f.state)).rejects.toThrow("bulunamadı"); }
    expect(await collectWriterClaims(new MemStore(), makeState())).toBe(0);
    expect(await collectWriterClaims(new MemStore(), makeState({}, { script: SCRIPT }))).toBe(0);
  });
  it("includes publisher/date in English credits and leaves unsupported sources uncredited", async () => {
    const f = await fixture(); f.state.input.lang = "en";
    await f.mutate({ type: "put-source", source: { ...f.source, publisher: "Lab", date: "2026" } }); await f.review("supported");
    f.state.render = { path: "main.mp4", at: "t" }; f.state.render.research = await freezeResearch(f.store, f.state);
    expect(await researchCredits(f.store, f.state)).toEqual(["Narration sources:", "Lab note — Lab (2026) — https://example.org/lab"]);
    await f.review("needs-source"); f.state.render.research = await freezeResearch(f.store, f.state);
    expect(await researchCredits(f.store, f.state)).toEqual([]);
  });
});

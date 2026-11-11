import { describe, expect, it } from "vitest";
import { EpisodeRepo } from "../src/actions.ts";
import { episodeFingerprint } from "../src/editing.ts";
import { acquireLock } from "../src/lock.ts";
import { applyPronunciationImpact, effectivePronunciations, emptyPronunciationBook, loadPronunciationBook, mutateEpisodePronunciation, mutateSharedPronunciations, previewPronunciationImpact, pronunciationRulesFingerprint, pronunciationTerms } from "../src/pronunciation-settings.ts";
import { sayPlan } from "../src/pronounce.ts";
import { makeState, MemStore, scene, voiceOf } from "./pipeline-harness.ts";
import { STAGES } from "../src/state.ts";

const entry = (spoken = "ortak okunuş", written = "C++", lang = "tr") => ({ type: "put", entry: { lang, written, spoken } });
async function fixture() {
  const store = new MemStore(), repo = new EpisodeRepo(store), state = makeState({ lang: "tr-TR" }, { script: { scenes: [scene("s1", "C++ projesi."), scene("s2", "Merhaba.")] }, voice: { s1: { ...voiceOf("s1"), text: "C++ projesi.", spoken: "si pılas pılas projesi." }, s2: { ...voiceOf("s2"), text: "Merhaba." } }, done: Object.fromEntries(STAGES.map((s) => [s, "done"])), approvals: { script: "s", concept: "c", preview: "p" }, render: { path: "old.mp4", at: "old", exportId: "old-export" } });
  state.id = "pronunciation-fixture"; await repo.save(state); return { store, repo, state };
}
describe("layered pronunciation settings", () => {
  it("isolates languages and gives case-insensitive episode overrides precedence over shared, learned and built-in terms", async () => {
    const f = await fixture(); f.state.pronunciations = { "c++": "öğrenilmiş" };
    await mutateSharedPronunciations(f.store, 0, entry("shared", "C++"));
    await mutateSharedPronunciations(f.store, 1, entry("english", "C++", "en"));
    const book = await loadPronunciationBook(f.store);
    expect(sayPlan("C++ projesi.", pronunciationTerms(f.state, book), "tr").spoken).toBe("shared projesi.");
    f.state.pronunciationOverrides = { "c++": "bölüm" };
    expect(effectivePronunciations(f.state, book).filter((e) => e.written.toLowerCase() === "c++")).toEqual([{ written: "c++", spoken: "bölüm", origin: "episode" }]);
    expect(sayPlan("C++ projesi.", pronunciationTerms(f.state, book), "tr").spoken).toBe("bölüm projesi.");
    f.state.pronunciationOverrides = { "C++": "C++" };
    expect(sayPlan("C++ projesi.", pronunciationTerms(f.state, book), "tr").spoken).toBe("C++ projesi.");
  });
  it("commits exactly one racing global revision, then permits the loser to retry without lost data", async () => {
    const store = new MemStore(), originalGet = store.get.bind(store); let ready = 0, release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    store.get = async (key) => { const bytes = await originalGet(key); if (key === "settings/pronunciations.json" && ready < 2) { ready++; if (ready === 2) release(); await gate; } return bytes; };
    const results = await Promise.allSettled([mutateSharedPronunciations(store, 0, entry("one", "Alpha")), mutateSharedPronunciations(store, 0, entry("two", "Beta"))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    let book = await loadPronunciationBook(store); expect(book.revision).toBe(1); expect(book.entries).toHaveLength(1);
    const missing = book.entries[0]!.written === "Alpha" ? entry("two", "Beta") : entry("one", "Alpha");
    await mutateSharedPronunciations(store, 1, missing); book = await loadPronunciationBook(store);
    expect(book.revision).toBe(2); expect(book.entries).toHaveLength(2);
  });
  it("protects history/current writes, handles no-ops and fails closed without CAS", async () => {
    const store = new MemStore(); store.failPut = (key) => key.includes("/history/");
    await expect(mutateSharedPronunciations(store, 0, entry())).rejects.toThrow("yazılamadı"); expect((await loadPronunciationBook(store)).revision).toBe(0);
    store.failPut = undefined; await mutateSharedPronunciations(store, 0, entry()); const before = await loadPronunciationBook(store);
    await mutateSharedPronunciations(store, 1, entry()); expect(await loadPronunciationBook(store)).toEqual(before);
    await expect(mutateSharedPronunciations(store, 0, entry("stale"))).rejects.toThrow("değişti");
    store.compareAndSwap = undefined as never;
    await expect(mutateSharedPronunciations(store, 1, entry("new"))).rejects.toThrow("atomik"); expect(await loadPronunciationBook(store)).toEqual(before);
  });
  it("saves local rules without modifying voices and removes only the explicit override", async () => {
    const f = await fixture(); await mutateSharedPronunciations(f.store, 0, entry("shared"));
    await mutateEpisodePronunciation({ id: f.state.id, store: f.store, repo: f.repo, fingerprint: episodeFingerprint(f.state), mutation: entry("local", "c++") });
    const next = await f.repo.load(f.state.id); expect(next.voice).toEqual(f.state.voice); expect(next.done).toEqual(f.state.done);
    await mutateEpisodePronunciation({ id: f.state.id, store: f.store, repo: f.repo, fingerprint: episodeFingerprint(next), mutation: { type: "remove", lang: "tr", written: "C++" } });
    const current = await f.repo.load(f.state.id), book = await loadPronunciationBook(f.store);
    expect(current.pronunciationOverrides).toEqual({}); expect(pronunciationTerms(current, book)["C++"]).toBe("shared");
  });
  it("previews and reopens only changed voice records while retaining captions, approvals and the old render", async () => {
    const f = await fixture(); await mutateSharedPronunciations(f.store, 0, entry()); const book = await loadPronunciationBook(f.store), preview = previewPronunciationImpact(f.state, book);
    expect(preview.affected).toEqual(["s1"]); expect(preview.retained).toEqual(["s2"]);
    await applyPronunciationImpact({ id: f.state.id, store: f.store, repo: f.repo, ...preview }); const next = await f.repo.load(f.state.id);
    expect(next.voice?.s1).toBeUndefined(); expect(next.voice?.s2).toEqual(f.state.voice!.s2);
    expect(next.script).toEqual(f.state.script); expect(next.render).toEqual(f.state.render); expect(next.done.concept).toBe("done"); expect(next.done.voice).toBeUndefined();
    expect(next.approvals).toEqual({ script: "s", concept: "c" }); expect(next.pronunciationPlan?.revision).toBe(1);
  });
  it("rejects stale episode/global previews and concurrent producers before removing any voice", async () => {
    const f = await fixture(), preview = previewPronunciationImpact(f.state, emptyPronunciationBook());
    await mutateSharedPronunciations(f.store, 0, entry());
    await expect(applyPronunciationImpact({ id: f.state.id, store: f.store, repo: f.repo, ...preview })).rejects.toThrow("değişti");
    expect((await f.repo.load(f.state.id)).voice).toEqual(f.state.voice);
    await expect(mutateEpisodePronunciation({ id: f.state.id, store: f.store, repo: f.repo, fingerprint: "stale", mutation: entry() })).rejects.toThrow("değişti");
    const release = await acquireLock(f.store, f.state.id);
    try { await expect(mutateEpisodePronunciation({ id: f.state.id, store: f.store, repo: f.repo, fingerprint: episodeFingerprint(f.state), mutation: entry() })).rejects.toThrow(); } finally { await release(); }
  });
  it("marks legacy unknown and missing recordings explicitly and avoids changes for irrelevant shared rules", async () => {
    const f = await fixture(), legacy = f.state.voice!.s1!; delete legacy.text; delete legacy.spoken;
    expect(previewPronunciationImpact(f.state, emptyPronunciationBook()).scenes[0]!.status).toBe("unknown");
    delete f.state.voice!.s2; expect(previewPronunciationImpact(f.state, emptyPronunciationBook()).scenes[1]!.status).toBe("missing");
    const fresh = await fixture(); await mutateSharedPronunciations(fresh.store, 0, entry("unrelated", "NoSuchTerm"));
    const preview = previewPronunciationImpact(fresh.state, await loadPronunciationBook(fresh.store)); expect(preview.affected).toEqual([]);
    await applyPronunciationImpact({ id: fresh.state.id, store: fresh.store, repo: fresh.repo, ...preview }); expect(await fresh.repo.load(fresh.state.id)).toEqual(fresh.state);
  });
  it("keeps editor rule fingerprints stable when an agent adds a learned term for a partial retry", () => {
    const s = makeState(); const before = pronunciationRulesFingerprint(s, emptyPronunciationBook()); s.pronunciations = { "New word": "nyu vörd" };
    expect(pronunciationRulesFingerprint(s, emptyPronunciationBook())).toBe(before);
  });
  it("rejects corrupt dictionaries and invalid updates and bounds global/local rules", async () => {
    const store = new MemStore(); store.putText("settings/pronunciations.json", "not json");
    await expect(loadPronunciationBook(store)).rejects.toThrow("geçersiz");
    await expect(mutateSharedPronunciations(store, 0, entry())).rejects.toThrow("geçersiz");
    await expect(mutateSharedPronunciations(store, 0, {})).rejects.toThrow("geçersiz");
    const book = { ...emptyPronunciationBook(), entries: Array.from({ length: 1000 }, (_, i) => ({ lang: "tr", written: `Term ${i}`, spoken: "term" })) };
    store.putJsonSync("settings/pronunciations.json", book);
    await expect(mutateSharedPronunciations(store, 0, entry())).rejects.toThrow("geçersiz");
    await mutateSharedPronunciations(store, 0, { type: "remove", lang: "tr", written: "Term 0" });
    expect((await loadPronunciationBook(store)).entries).toHaveLength(999);
    await mutateSharedPronunciations(store, 1, { type: "remove", lang: "tr", written: "missing" });
    expect((await loadPronunciationBook(store)).revision).toBe(1);
    const f = await fixture(), opts = { id: f.state.id, store: f.store, repo: f.repo, fingerprint: episodeFingerprint(f.state) };
    await expect(mutateEpisodePronunciation({ ...opts, mutation: {} })).rejects.toThrow("geçersiz");
    await expect(mutateEpisodePronunciation({ ...opts, mutation: entry("word", "Term", "en") })).rejects.toThrow("geçersiz");
    f.state.pronunciationOverrides = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`Term ${i}`, "term"])); await f.repo.save(f.state);
    await expect(mutateEpisodePronunciation({ ...opts, fingerprint: episodeFingerprint(f.state), mutation: entry() })).rejects.toThrow("geçersiz");
    await mutateEpisodePronunciation({ ...opts, fingerprint: episodeFingerprint(f.state), mutation: entry("updated", "Term 0") });
    expect((await f.repo.load(f.state.id)).pronunciationOverrides!["Term 1"]).toBe("term");
    expect(effectivePronunciations(makeState({ lang: "zz" }, { pronunciations: { "": "word", "Whitespace": " " } }), emptyPronunciationBook())).toEqual([]);
    expect(previewPronunciationImpact(makeState(), emptyPronunciationBook()).scenes).toEqual([]);
  });
});

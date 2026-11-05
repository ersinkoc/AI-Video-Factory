import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FsAssetStore } from "@ys/storage";
import {
  approve,
  deleteEpisode,
  editNarration,
  EpisodeRepo,
  changeVoice,
  gateBefore,
  redrawShots,
  replanShots,
  isApproved,
  missingSelections,
  revokeApproval,
  selectCandidate,
  setCaptions,
  setMusic,
  setSfx,
  type EpisodeInput,
  type EpisodeState,
} from "../src/light.ts";

const input: EpisodeInput = {
  topic: "t",
  lang: "tr",
  targetSec: 180,
  tier: "standard",
  aiClipRatio: 0.1,
  budgetUsd: 10,
  width: 1920,
  height: 1080,
  fps: 30,
};

const baseState = (): EpisodeState => ({
  id: "ep",
  createdAt: "2026-10-29T00:00:00Z",
  input: { ...input },
  done: { style: "x", story: "x", script: "x", cast: "x", concept: "x" },
  agentCostUsd: 0,
  script: { scenes: [{ id: "s1", beatId: "b1", narration: "eski", visualIntent: "", emotion: "", location: "" }] },
  cast: {
    characters: [{ id: "c1", name: "Murad", kind: "person", role: "", visualDescription: "", scenes: ["s1"] }],
    locations: [{ id: "l1", name: "Sokak", visualDescription: "", scenes: ["s1"] }],
  },
  concept: {
    candidates: {
      c1: [
        { key: "a", mimeType: "image/png" },
        { key: "b", mimeType: "image/png" },
      ],
      l1: [{ key: "c", mimeType: "image/png" }],
    },
    selected: {},
    previews: [{ key: "p", mimeType: "image/png", caption: "" }],
  },
});

describe("onay kapıları", () => {
  it("cast senaryo onayını, voice konsept onayını bekler", () => {
    expect(gateBefore("cast")).toBe("script");
    expect(gateBefore("voice")).toBe("concept");
    expect(gateBefore("keyframes")).toBeUndefined();
  });

  it("autoApprove tüm kapıları geçer (CLI)", () => {
    const s = baseState();
    expect(isApproved(s, "script")).toBe(false);
    s.input.autoApprove = true;
    expect(isApproved(s, "concept")).toBe(true);
  });

  it("konsept, her karakter ve mekân için seçim yapılmadan onaylanamaz", () => {
    const s = baseState();
    expect(() => approve(s, "concept")).toThrow(/c1, l1/);
    selectCandidate(s, "c1", 1);
    expect(missingSelections(s)).toEqual(["l1"]);
    selectCandidate(s, "l1", 0);
    s.waitingFor = "concept";
    approve(s, "concept");
    expect(s.approvals?.concept).toBeDefined();
    expect(s.waitingFor).toBeUndefined();
  });

  it("seçim değişince eski deneme kareleri silinir", () => {
    const s = baseState();
    selectCandidate(s, "c1", 1);
    expect(s.concept?.selected.c1?.key).toBe("b");
    expect(s.concept?.previews).toBeUndefined();
    expect(() => selectCandidate(s, "c1", 5)).toThrow();
  });

  it("onaylanmış senaryo düzenlenemez; onay geri alınınca sonraki aşamalar yeniden çalışır", () => {
    const s = baseState();
    editNarration(s, "s1", "  yeni metin ");
    expect(s.script?.scenes[0]?.narration).toBe("yeni metin");
    approve(s, "script");
    expect(() => editNarration(s, "s1", "x")).toThrow(/onay/);
    revokeApproval(s, "script");
    expect(s.done).toEqual({ style: "x", story: "x", script: "x" });
  });
});

describe("changeVoice", () => {
  it("sesi ve zamanlamaya bağlı tüm aşamaları sıfırlar; render sonrası izin vermez", () => {
    const s = baseState();
    s.done = { ...s.done, voice: "x", shots: "x", keyframes: "x" };
    s.voice = { s1: { key: "v", mimeType: "audio/mpeg", durationMs: 1000, words: [], estimatedTiming: false } };
    s.voiceProviderId = "elevenlabs:tts";
    s.lastError = { stage: "voice", message: "kota", at: "" };
    changeVoice(s, "");
    expect(s.input.voiceId).toBeUndefined();
    expect(s.voice).toBeUndefined();
    expect(s.voiceProviderId).toBeUndefined();
    expect(s.lastError).toBeUndefined();
    expect(Object.keys(s.done)).toEqual(["style", "story", "script", "cast", "concept"]);
    s.done.render = "x";
    expect(() => changeVoice(s, "v2")).toThrow(/render/);
  });
});
describe("redrawShots", () => {
  it("kareyi ve klibi siler, seed sayacını artırır, kareden sonrasını geçersiz kılar", () => {
    const s = baseState();
    const shot = { id: "a", sceneId: "s1", kind: "still_motion" as const, startMs: 0, endMs: 1000, description: "", imagePrompt: "", motionPrompt: "", camera: "static" as const };
    s.shots = [shot, { ...shot, id: "b" }];
    s.keyframes = { a: { key: "a.png", mimeType: "image/png" }, b: { key: "b.png", mimeType: "image/png" } };
    s.qa = { a: { score: 4, issues: [], attempts: 2, passed: false } };
    s.done = { ...s.done, shots: "x", keyframes: "x", timeline: "x", render: "x" };

    redrawShots(s, ["a", "yok"]);
    redrawShots(s, ["a"]);
    expect(s.redraws).toEqual({ a: 2 });
    expect(Object.keys(s.keyframes)).toEqual(["b"]);
    expect(s.qa).toEqual({});
    expect(s.done).toMatchObject({ shots: "x" });
    expect(s.done.keyframes).toBeUndefined();
    expect(s.done.render).toBeUndefined();
    expect(() => redrawShots(s, ["yok"])).toThrow(/çekim yok/);
  });
});

describe("önizleme onayı (render öncesi kapı)", () => {
  const shot = (id: string, sceneId: string) => ({ id, sceneId, kind: "still_motion" as const, startMs: 0, endMs: 1000, description: "", imagePrompt: "", motionPrompt: "", camera: "static" as const });

  it("onay kaydedilir; yeniden çizim ve notla yeniden oluşturma onayı geri alır (yeni çekimler yine görülür)", () => {
    const s = baseState();
    s.input.motionMode = "vector";
    s.shots = [shot("a", "s1")];
    s.waitingFor = "preview";
    approve(s, "preview");
    expect(s.approvals?.preview).toBeDefined();
    expect(s.waitingFor).toBeUndefined();
    replanShots(s, ["a"], "not");
    expect(s.approvals?.preview).toBeUndefined();
    approve(s, "preview");
    redrawShots(s, ["a"]);
    expect(s.approvals?.preview).toBeUndefined();
    // Onay kaydı hiç yoksa da sorun çıkmaz.
    delete s.approvals;
    redrawShots(s, ["a"]);
    expect(s.approvals).toBeUndefined();
  });

  it("yalnız render ayarı değişince (altyazı, efekt, müzik) render edilmiş görüntü kabul sayılır; görüntü değiştiyse sayılmaz", () => {
    const rendered = (): EpisodeState => ({ ...baseState(), render: { path: "v.mp4", at: "t" }, done: { ...baseState().done, keyframes: "t", timeline: "t", render: "t" } });
    const a = rendered();
    setCaptions(a, false);
    expect(a.approvals?.preview).toBeDefined();
    const b = rendered();
    setSfx(b, false);
    expect(b.approvals?.preview).toBeDefined();
    const c = rendered();
    c.approvals = { script: "t", preview: "eski" };
    setMusic(c, false);
    expect(c.approvals.preview).toBe("eski");
    // Görüntü yeniden açılmış (kare aşaması bitmemiş) ya da hiç render yok: yapımcı yine görür.
    const d = rendered();
    delete d.done.keyframes;
    setCaptions(d, false);
    expect(d.approvals?.preview).toBeUndefined();
    const e = baseState();
    setCaptions(e, false);
    expect(e.approvals?.preview).toBeUndefined();
  });
});

describe("replanShots", () => {
  const shot = (id: string, sceneId: string) => ({ id, sceneId, kind: "still_motion" as const, startMs: 0, endMs: 1000, description: "", imagePrompt: "", motionPrompt: "", camera: "static" as const });

  it("notu seçilen çekimlerin sahnelerine yazar, ikinci notu ekler; render sonrası da kareden sonrasını yeniden açar", () => {
    const s = baseState();
    s.input.motionMode = "vector";
    s.shots = [shot("a", "s1"), shot("b", "s1"), shot("c", "s2")];
    s.done = { ...s.done, shots: "x", keyframes: "x", render: "x", package: "x" };
    s.lastError = { stage: "render", message: "eski hata", at: "" };
    replanShots(s, ["a", "c", "yok"], "  Harita 1453 olsun  ");
    expect(s.replans).toEqual({
      s1: { note: "Harita 1453 olsun", shots: ["a"], findings: [], at: expect.any(String) },
      s2: { note: "Harita 1453 olsun", shots: ["c"], findings: [], at: expect.any(String) },
    });
    replanShots(s, ["b", "a"], "Mehmed haritanın önünde");
    expect(s.replans!.s1).toMatchObject({ note: "Harita 1453 olsun\nMehmed haritanın önünde", shots: ["a", "b"] });
    expect(s.done).toMatchObject({ shots: "x" });
    expect(s.done.keyframes).toBeUndefined();
    expect(s.done.render).toBeUndefined();
    expect(s.done.package).toBeUndefined();
    expect(s.lastError).toBeUndefined();
  });

  it("yalnız vektör bölümde, boş olmayan notla ve var olan çekimle", () => {
    const s = baseState();
    expect(() => replanShots(s, ["a"], "not")).toThrow(/yalnız vektör/);
    s.input.motionMode = "vector";
    expect(() => replanShots(s, ["a"], "not")).toThrow(/çekim yok/);
    s.shots = [shot("a", "s1")];
    expect(() => replanShots(s, ["a"], "   ")).toThrow(/not yazın/);
    expect(s.replans).toBeUndefined();
  });

  it("toplu düzeltme: not olmadan da, seçilenlerin inceleme bulgularıyla (yoksa taslak denetiminin); numara sahne içi sıra", () => {
    const s = baseState();
    s.input.motionMode = "vector";
    s.shots = [shot("a", "s1"), shot("b", "s1"), shot("c", "s2"), shot("d", "s2")];
    s.review = { at: "t", lessons: [], shots: { b: { score: 3, issues: [{ type: "empty", detail: "bare wall" }, { type: "off_story", detail: "no map" }] }, c: { score: 8, issues: [] } } };
    s.draftReview = { at: "t", lessons: [], avg: 5, revisedScenes: [], shots: { d: { score: 4, issues: [{ type: "character_cut_off", detail: "cut" }] } } };
    // Bulgusuz çekimler ve notsuz istek reddedilir.
    expect(() => replanShots(s, ["a", "c"], "")).toThrow(/not yazın/);
    replanShots(s, ["b", "c", "d"], "");
    expect(s.replans).toEqual({
      s1: { note: "", shots: ["b"], findings: ["- shot 2 (3/10): empty: bare wall", "- shot 2 (3/10): off_story: no map"], at: expect.any(String) },
      s2: { note: "", shots: ["c", "d"], findings: ["- shot 2 (4/10): character_cut_off: cut"], at: expect.any(String) },
    });
    // İkinci istek: not eklenir, aynı bulgu yinelenmez.
    replanShots(s, ["b"], "daha sade");
    expect(s.replans!.s1).toMatchObject({ note: "daha sade", findings: ["- shot 2 (3/10): empty: bare wall", "- shot 2 (3/10): off_story: no map"] });
  });
});

describe("EpisodeRepo", () => {
  it("bölümleri yeniden eskiye listeler", async () => {
    const repo = new EpisodeRepo(new FsAssetStore(mkdtempSync(join(tmpdir(), "ys-repo-"))));
    await repo.save({ ...baseState(), id: "eski", createdAt: "2026-01-01T00:00:00Z" });
    await repo.save({ ...baseState(), id: "yeni", createdAt: "2026-10-01T00:00:00Z" });
    expect((await repo.list()).map((s) => s.id)).toEqual(["yeni", "eski"]);
    const updated = await repo.update("eski", (s) => selectCandidate(s, "c1", 0));
    expect(updated.concept?.selected.c1?.key).toBe("a");
  });

  it("bölüm silinince kendi dosyaları gider; adı benzeyen bölüm, kütüphane ve ortak önbellek kalır", async () => {
    const store = new FsAssetStore(mkdtempSync(join(tmpdir(), "ys-repo-")));
    const repo = new EpisodeRepo(store);
    await repo.save({ ...baseState(), id: "e1" });
    await repo.save({ ...baseState(), id: "e10" });
    const bytes = new Uint8Array([1]);
    for (const key of ["episodes/e1/run.lock.json", "assets/stills/e1/s1-ab.jpg", "assets/sfx/e1/x.wav", "assets/music/e1/y.wav", "assets/stills/e10/s1.jpg", "assets/abc123", "library/vector/ada.svg"]) {
      await store.put(key, bytes);
    }
    expect(await deleteEpisode(store, "e1")).toBe(5);
    expect((await repo.list()).map((s) => s.id)).toEqual(["e10"]);
    expect((await store.list("")).sort()).toEqual(["assets/abc123", "assets/stills/e10/s1.jpg", "episodes/e10/state.json", "library/vector/ada.svg"]);
    await expect(repo.load("e1")).rejects.toThrow();
    expect(await deleteEpisode(store, "e1")).toBe(0);
  });
});

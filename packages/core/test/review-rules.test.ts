import { describe, expect, it } from "vitest";
import { DRAFT_REVIEW, REVIEW_RUBRIC, scenesBelow, shotPasses, type ShotReviewRecord } from "../src/rules.ts";

const checks = { off_story: { evidence: "Ada at her desk, as narrated", verdict: "pass" as const } };
const rec = (score: number, withChecks = true): ShotReviewRecord => ({ score, issues: [], ...(withChecks ? { checks } : {}) });

describe("8 barajı (12 Kas, kullanıcı: her sahnede kontrol listesi ve 10 üzerinden 8 şartı)", () => {
  it("kontrol listeli kare 8 ve üstüyle geçer; eski genel puanlı kare eski sınırla; kaydı olmayan geçmez", () => {
    expect(DRAFT_REVIEW.passAtLeast).toBe(8);
    expect(shotPasses(rec(8))).toBe(true);
    expect(shotPasses(rec(7))).toBe(false);
    expect(shotPasses(rec(5, false))).toBe(true);
    expect(shotPasses(rec(4, false))).toBe(false);
    expect(shotPasses(undefined)).toBe(false);
  });

  it("sahne, tek karesi bile geçemezse ya da denetlenmemişse barajın altında kalır; en kötü kare ve denetlenmeyen sayısı verilir", () => {
    const shots = [
      { id: "a1", sceneId: "s1" },
      { id: "a2", sceneId: "s1" },
      { id: "b1", sceneId: "s2" },
      { id: "c1", sceneId: "s3" },
      { id: "c2", sceneId: "s3" },
      { id: "c3", sceneId: "s3" },
    ];
    const review = { rubric: REVIEW_RUBRIC, shots: { a1: rec(9), a2: rec(10), b1: rec(7), c1: rec(6), c2: rec(4) } };
    expect(scenesBelow(shots, review)).toEqual([
      { sceneId: "s2", worst: 7, unreviewed: 0 },
      { sceneId: "s3", worst: 4, unreviewed: 1 },
    ]);
    // Hiç denetlenmemiş sahne: en kötü kare yok.
    expect(scenesBelow(shots, { rubric: REVIEW_RUBRIC, shots: {} })).toEqual([
      { sceneId: "s1", worst: null, unreviewed: 2 },
      { sceneId: "s2", worst: null, unreviewed: 1 },
      { sceneId: "s3", worst: null, unreviewed: 3 },
    ]);
  });

  it("rubriksiz (eski) inceleme ya da inceleme yoksa kimse barajda tutulmaz", () => {
    const shots = [{ id: "a1", sceneId: "s1" }];
    expect(scenesBelow(shots, undefined)).toEqual([]);
    expect(scenesBelow(shots, { shots: { a1: rec(3, false) } })).toEqual([]);
    expect(scenesBelow(shots, { rubric: REVIEW_RUBRIC + 1, shots: {} })).toEqual([]);
  });
});

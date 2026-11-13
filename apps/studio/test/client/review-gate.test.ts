import { describe, expect, it } from "vitest";
import { approved, draftBelow } from "../../src/app/episodes/[id]/parts.tsx";
import { makeState } from "./fixtures.tsx";

describe("önizleme kapısının istemci kopyası (12 Kas: 8 barajı)", () => {
  const checks = { off_story: { evidence: "Ada at her desk, as narrated", verdict: "pass" as const } };
  const below = () =>
    makeState({
      shots: [{ id: "sh1", sceneId: "s1" }, { id: "sh2", sceneId: "s2" }] as never,
      draftReview: { at: "t", rubric: 1, lessons: [], avg: 7, revisedScenes: [], shots: { sh1: { score: 7, issues: [], checks }, sh2: { score: 10, issues: [], checks } } },
    });

  it("barajı geçemeyen sahne varken önizleme yalnız açık onayla geçilir; öteki kapılar ve temiz taslak eskisi gibi", () => {
    const state = below();
    state.input.autoApprove = true;
    expect(draftBelow(state)).toEqual([{ sceneId: "s1", worst: 7, unreviewed: 0 }]);
    expect(approved(state, "preview")).toBe(false);
    expect(approved(state, "script")).toBe(true);
    expect(approved({ ...state, approvals: { preview: "t" } }, "preview")).toBe(true);
    state.draftReview!.shots.sh1!.score = 8;
    expect(approved(state, "preview")).toBe(true);
  });

  it("denetim kapalıysa ya da çekim yoksa baraj yok", () => {
    const state = below();
    expect(draftBelow({ ...state, input: { ...state.input, qa: false } })).toEqual([]);
    expect(draftBelow({ ...state, shots: undefined })).toEqual([]);
  });
});

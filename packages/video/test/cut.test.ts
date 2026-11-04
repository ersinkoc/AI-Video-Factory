import { describe, expect, it } from "vitest";
import { CROSSFADE, cutsOf, cutStyle, SCENE_CUT, sceneOf } from "../src/cut.ts";

const shots = (...ids: string[]) => ids.map((shotId) => ({ shotId }));

describe("çekim geçişleri", () => {
  it("sahne, çekim kimliğinin sahne öneki; başka biçimde kimliğin kendisi", () => {
    expect(sceneOf("s3-sh2")).toBe("s3");
    expect(sceneOf("s12-sh10")).toBe("s12");
    expect(sceneOf("intro")).toBe("intro");
  });

  it("ilk çekime geçiş yok; sahne içinde kısa çapraz geçiş; sahne değişince tür döner, yön her sahnede değişir", () => {
    const cuts = cutsOf(shots("s1-sh1", "s1-sh2", "s2-sh1", "s3-sh1", "s3-sh2", "s4-sh1", "s5-sh1"), "ep");
    expect(cuts[0]).toBeUndefined();
    expect(cuts[1]).toEqual({ kind: "dissolve", frames: CROSSFADE, dir: 1 });
    expect(cuts[4]).toEqual({ kind: "dissolve", frames: CROSSFADE, dir: 1 });
    const scene = [cuts[2]!, cuts[3]!, cuts[5]!, cuts[6]!];
    expect(scene.every((c) => c.frames === SCENE_CUT.frames)).toBe(true);
    // Dört sahne geçişinde dört tür, art arda aynısı yok.
    expect(new Set(scene.map((c) => c.kind)).size).toBe(SCENE_CUT.kinds.length);
    expect(scene.map((c) => c.dir)).toEqual([1, -1, 1, -1]);
    // Aynı bölüm aynı geçişleri alır; başka bölüm başka türden başlayabilir.
    expect(cutsOf(shots("s1-sh1", "s2-sh1"), "ep")).toEqual(cutsOf(shots("s1-sh1", "s2-sh1"), "ep"));
    const firsts = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((seed) => cutsOf(shots("s1-sh1", "s2-sh1"), seed)[1]!.kind));
    expect(firsts.size).toBeGreaterThan(1);
  });

  it("geçiş biçemi: her türün ortası görünür biçimde, sonu biçemsiz", () => {
    const cut = (kind: (typeof SCENE_CUT.kinds)[number] | "dissolve", dir: 1 | -1 = 1) => ({ kind, frames: 18, dir });
    expect(cutStyle(cut("dissolve"), 0.25)).toEqual({ opacity: 0.25 });
    expect(cutStyle(cut("wipe"), 0.25)).toEqual({ clipPath: "inset(0 75% 0 0)" });
    expect(cutStyle(cut("wipe", -1), 0.25)).toEqual({ clipPath: "inset(0 0 0 75%)" });
    expect(cutStyle(cut("slide"), 0.5)).toEqual({ transform: "translateX(50%)", boxShadow: "-24px 0 48px rgba(0,0,0,0.35)" });
    expect(cutStyle(cut("slide", -1), 0.5)).toEqual({ transform: "translateX(-50%)", boxShadow: "24px 0 48px rgba(0,0,0,0.35)" });
    expect(cutStyle(cut("iris"), 0.5)).toEqual({ clipPath: "circle(36% at 50% 50%)" });
    expect(cutStyle(cut("zoom"), 0.5)).toEqual({ opacity: 0.5, transform: "scale(1.09)" });
    for (const kind of [...SCENE_CUT.kinds, "dissolve" as const]) expect(cutStyle(cut(kind), 1)).toEqual({});
  });
});

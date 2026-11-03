import { describe, expect, it } from "vitest";
import { reach, tip, wrap } from "../src/ik.ts";

const S = [260, 300] as const;

describe("iki kemikli ters kinematik", () => {
  it("el hedefe ulaşır; iki çözümden dirseği aşağıda olan seçilir", () => {
    for (const target of [
      [214, 246],
      [330, 420],
      [200, 380],
      [150, 300],
    ] as const) {
      const r = reach(S, target, 100, 112);
      expect(r.reached).toBe(true);
      const [x, y] = tip(S, 100, 112, r.arm, r.forearm);
      expect(x).toBeCloseTo(target[0], 6);
      expect(y).toBeCloseTo(target[1], 6);
    }
    // Omuz hizasındaki hedefe uzanırken dirsek çizginin altında kalır (havaya kalkmaz).
    expect(reach(S, [150, 300], 100, 112).elbow[1]).toBeGreaterThan(300);
    // Aşağıdaki hedefe düz uzanırken kol dik (0°) ve ön kol düz.
    const down = reach(S, [260, 512], 100, 112);
    expect(down.arm).toBeCloseTo(0, 1);
    expect(down.forearm).toBeCloseTo(0, 1);
  });

  it("uzak hedefe kol uzanır, çok yakın hedefe katlanır; omzun üstündeki hedef aşağı sayılır", () => {
    const far = reach(S, [900, 300], 100, 112);
    expect(far.reached).toBe(false);
    const [x, y] = tip(S, 100, 112, far.arm, far.forearm);
    expect(Math.hypot(x - S[0], y - S[1])).toBeCloseTo(212, 3);
    expect(y).toBeCloseTo(300, 3);
    const near = reach(S, [262, 300], 100, 112);
    expect(near.reached).toBe(false);
    const same = reach(S, S, 100, 112);
    expect(Math.hypot(...tip(S, 100, 112, same.arm, same.forearm).map((v, i) => v - S[i]!) as [number, number])).toBeCloseTo(12, 3);
  });

  it("açılar en kısa dönüşe indirilir", () => {
    expect(wrap(190)).toBe(-170);
    expect(wrap(-190)).toBe(170);
    expect(wrap(180)).toBe(180);
    expect(wrap(-180)).toBe(180);
    expect(wrap(540)).toBe(180);
    expect(wrap(30)).toBe(30);
  });
});

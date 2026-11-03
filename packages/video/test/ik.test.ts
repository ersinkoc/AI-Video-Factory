import { describe, expect, it } from "vitest";
import { bend, reach, tip, wrap } from "../src/ik.ts";

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

  it("bend: dirsek verilen yerde, üst kol oraya kısalarak (kameraya uzanarak) ulaşır, el hedefte", () => {
    const hand = [210, 256] as const;
    const elbow = [226, 367] as const;
    const b = bend(S, elbow, hand, 100, 112, 0.6);
    expect(b.scale).toBeCloseTo(Math.hypot(elbow[0] - S[0], elbow[1] - S[1]) / 100, 6);
    expect(b.elbow[0]).toBeCloseTo(elbow[0], 6);
    expect(b.elbow[1]).toBeCloseTo(elbow[1], 6);
    expect(b.reached).toBe(Math.abs(Math.hypot(hand[0] - elbow[0], hand[1] - elbow[1]) - 112) < 1e-6);
    const [x, y] = tip(S, 100 * b.scale, Math.hypot(hand[0] - elbow[0], hand[1] - elbow[1]), b.arm, b.forearm);
    expect(x).toBeCloseTo(hand[0], 6);
    expect(y).toBeCloseTo(hand[1], 6);
    // Dirsek ön kol boyunda: el hedefe tam değer.
    const exact = bend(S, [hand[0], hand[1] + 112], hand, 100, 112, 0.6);
    expect(exact.reached).toBe(true);
    // Dirsek üst kol boyundan uzaksa düz IK (tam boy).
    const far = bend(S, [260, 450], [260, 340], 100, 112, 0.6);
    expect(far.scale).toBe(1);
    expect(far).toMatchObject(reach(S, [260, 340], 100, 112));
    // Omza çok yakın dirsek en kısa görünüşte, aynı yönde.
    const short = bend(S, [260, 320], [260, 430], 100, 112, 0.6);
    expect(short.scale).toBe(0.6);
    expect(short.elbow[1]).toBeCloseTo(360, 6);
    expect(short.reached).toBe(false);
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

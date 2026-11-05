import { describe, expect, it } from "vitest";
import { lipLine, MOUTH_COLORS, mouthIds, mouthSvg, SPOKEN, withMouths, type SpeakingMouth } from "../src/mouthShape.ts";

const box = { x: 180, y: 205, w: 40, h: 10 };
const plain = { ink: "#111", mood: 0 };
/** Mercek ağzın alt eğrisinin denetim noktası (y): eğrinin en alt noktası çizgiyle bunun ortasıdır. */
const lowCtrl = (svg: string) => Number(/Q200 ([\d.]+) 180 210Z/.exec(svg)![1]);

describe("konuşan ağız şekilleri", () => {
  it("kapalı ağızlar ifadeli eğridir; bastırılmış dudak (M, B, P) kalın, gülen yüzde köşeler kalkar", () => {
    expect(mouthSvg("X", box, plain)).toBe('<path d="M182 210 Q200 210 218 210" fill="none" stroke="#111" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>');
    expect(mouthSvg("A", box, { ink: "#111", mood: 1 })).toBe(
      '<path d="M184.8 205.2 Q200 218 215.2 205.2" fill="none" stroke="#111" stroke-width="3.64" stroke-linecap="round" stroke-linejoin="round"/>',
    );
    // İfade −1…1 aralığına kırpılır; nokta gibi ağız en az 22 px genişlikte çizilir, ince çizgi en az 1,6.
    expect(mouthSvg("X", box, { ink: "#111", mood: 5 })).toBe(mouthSvg("X", box, { ink: "#111", mood: 1 }));
    expect(mouthSvg("X", { x: 195, y: 209, w: 10, h: 2 }, plain)).toBe('<path d="M190.1 210 Q200 210 209.9 210" fill="none" stroke="#111" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>');
  });

  it("açık ağızlar: iç koyu, üst dişler, A'da alçak dil, L'de kalkık dil, B'de kapalı dişler; O ve U yuvarlak", () => {
    const d = mouthSvg("D", box, plain);
    expect(d.startsWith(`<path d="M180 210 Q200 193.87 220 210 Q200 251.47 180 210Z" fill="${MOUTH_COLORS.inside}"/>`)).toBe(true);
    expect(d.match(/<ellipse/g)).toHaveLength(2);
    expect(d).toContain(`fill="${MOUTH_COLORS.tongue}"`);
    expect(d.endsWith('fill="none" stroke="#111" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>')).toBe(true);
    expect(mouthSvg("C", box, plain).split(`fill="${MOUTH_COLORS.teeth}"`)).toHaveLength(2);
    expect(mouthSvg("G", box, plain)).toContain(`fill="${MOUTH_COLORS.teeth}"`);
    const h = mouthSvg("H", box, plain);
    expect(h.match(/<ellipse/g)).toHaveLength(2);
    expect(h).toContain(`fill="${MOUTH_COLORS.tongue}"`);
    const b = mouthSvg("B", box, plain);
    expect(b.startsWith('<path d="M183.6 210')).toBe(true);
    expect(b).toContain(`fill="${MOUTH_COLORS.teeth}"/>`);
    expect(b).toContain(`stroke="${MOUTH_COLORS.inside}"`);
    for (const v of ["E", "F"] as const) {
      const o = mouthSvg(v, box, plain);
      expect(o.match(/<ellipse/g)).toHaveLength(2);
      expect(o).not.toContain("<path");
    }
    // U (F) O'dan (E) dardır.
    const rx = (v: "E" | "F") => Number(/rx="([\d.]+)"/.exec(mouthSvg(v, box, plain))![1]);
    expect(rx("F")).toBeLessThan(rx("E"));
  });

  it("çene yakınsa açıklıklar birlikte küçülür; en az %35 kalır; sınır yoksa ya da genişse tam açılır", () => {
    // En alt nokta = çizgi (210) ile denetim noktasının ortası.
    const low = (drop?: number) => (210 + lowCtrl(mouthSvg("D", box, { ...plain, ...(drop === undefined ? {} : { drop }) }))) / 2;
    expect(low()).toBeCloseTo(210 + 0.72 * 0.72 * 40, 1);
    expect(low(100)).toBeCloseTo(low(), 6);
    expect(low(10)).toBeCloseTo(220, 1);
    expect(low(0)).toBeCloseTo(210 + 0.72 * 0.72 * 40 * 0.35, 1);
  });
});

describe("konuşan ağzın çizime konması", () => {
  const mouth: SpeakingMouth = { box, frame: [2, 0, 0, 2, 10, 20], ink: "#222", drop: 30 };
  const ids = mouthIds("p-");

  it("bütün şekiller ağız grubunun hemen arkasına, ebeveyn matrisinin tersiyle sarılıp gizli konur", () => {
    const svg = '<svg><g id="p-head"><g id="p-mouth"><g><path d="M0 0"/></g><path d="M1 1"></path></g><g id="p-nose"/></g></svg>';
    const out = withMouths(svg, "p-", mouth, 0.3)!;
    const shapes = SPOKEN.map((v) => `<g id="${ids.shape(v)}" display="none">${mouthSvg(v, box, { ink: "#222", mood: 0.3, drop: 30 })}</g>`).join("");
    expect(out).toBe(svg.replace('</path></g><g id="p-nose"/>', `</path></g><g transform="matrix(0.5 0 0 0.5 -5 -10)">${shapes}</g><g id="p-nose"/>`));
    expect(ids.mouth).toBe("p-mouth");
    // Somurtan yüzde kapalı ağız (X) da konur: çizimin gülümsemesi yerine köşeleri aşağı eğri.
    const sad = withMouths(svg, "p-", mouth, -0.7)!;
    expect(sad).toContain(`<g id="${ids.shape("X")}" display="none">${mouthSvg("X", box, { ink: "#222", mood: -0.7, drop: 30 })}</g>`);
    expect(out).not.toContain(ids.shape("X"));
  });

  it("ağız tek şekilse onun arkasına; ağız yoksa, kapanmamışsa ya da matris tersinmezse undefined", () => {
    expect(withMouths('<svg><path id="p-mouth" d="M0 0"/><rect/></svg>', "p-", mouth, 0)).toMatch(/^<svg><path id="p-mouth" d="M0 0"\/><g transform="matrix\(0\.5 0 0 0\.5 -5 -10\)">.*<\/g><rect\/><\/svg>$/);
    expect(withMouths('<svg><g id="p-head"/></svg>', "p-", mouth, 0)).toBeUndefined();
    expect(withMouths('<svg><g id="p-mouth"><path d="M0 0"/>', "p-", mouth, 0)).toBeUndefined();
    expect(withMouths('<svg><g id="p-mouth"/></svg>', "p-", { ...mouth, frame: [1, 0, 0, 0, 0, 205] }, 0)).toBeUndefined();
  });
});

describe("dudak çizgisi", () => {
  it("çizgi ağızda kutunun ortası, kocaman açık ağızda üstten genişliğin %15'i", () => {
    expect(lipLine({ x: 0, y: 200, w: 40, h: 10 })).toBe(205);
    expect(lipLine({ x: 162, y: 204, w: 76, h: 42 })).toBeCloseTo(215.4, 6);
  });
});

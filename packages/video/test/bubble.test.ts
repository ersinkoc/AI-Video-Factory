import { VectorSay } from "@ys/core";
import { describe, expect, it } from "vitest";
import { BUBBLE, bubbleAt, bubbleSide, bubbleSize, bubbleSvg, bubbleTail, bubbleTiming, sayRows, sayText, sayWindow } from "../src/bubble.ts";

const say = (text: string, extra: object = {}) => VectorSay.parse({ text, ...extra });
const BOUNDS = { left: 0, right: 1920, top: 60, bottom: 800 };
// Konuşanın yüzü (ekran px): ağız x 950, y 386,4; BUBBLE.stop payıyla kutu 890–1010 × 290–430.
const FACE = { x: 900, y: 300, w: 100, h: 120 };

describe("konuşma balonunun yazısı", () => {
  it("sözcük sınırından satırlara bölünür; satıra sığmayan tek sözcük kesilir", () => {
    expect(sayRows("Merhaba dünya nasılsın", BUBBLE.size)).toEqual(["Merhaba dünya nasılsın"]);
    // 36 px'te satıra 26 harf: beş harflik dört sözcük.
    expect(sayRows(Array(6).fill("aaaaa").join(" "), BUBBLE.size)).toEqual(["aaaaa aaaaa aaaaa aaaaa", "aaaaa aaaaa"]);
    expect(sayRows("x".repeat(40), BUBBLE.size)).toEqual([`${"x".repeat(25)}…`]);
    expect(sayRows("   ", BUBBLE.size)).toEqual([]);
  });

  it("BUBBLE.rows satıra sığana kadar küçülür; en küçük boyda da sığmazsa son satır '…' ile biter", () => {
    expect(sayText("Merhaba")).toEqual({ size: BUBBLE.size, rows: ["Merhaba"] });
    // 13 sözcük 36 px'te dört satır, 32 px'te (satıra beş sözcük) üç satır.
    expect(sayText(Array(13).fill("aaaaa").join(" "))).toEqual({ size: 32, rows: [Array(5).fill("aaaaa").join(" "), Array(5).fill("aaaaa").join(" "), "aaaaa aaaaa aaaaa"] });
    const long = sayText(Array(40).fill("aaaaa").join(" "));
    expect(long.size).toBe(BUBBLE.min);
    expect(long.rows).toHaveLength(BUBBLE.rows);
    expect(long.rows[2]).toBe(`${Array(5).fill("aaaaa").join(" ")}…`);
  });

  it("balonun ölçüsü yazıdan; düşünce bulutu yazıyı elipsin içinde taşısın diye büyük; boş sözde balon yok", () => {
    const one = bubbleSize(say("Merhaba"))!;
    expect(one.w).toBeCloseTo(7 * 36 * BUBBLE.char + 2 * BUBBLE.pad[0] * 36);
    expect(one.h).toBeCloseTo(36 + 2 * BUBBLE.pad[1] * 36);
    const cloud = bubbleSize(say("Merhaba", { kind: "thought" }))!;
    expect(cloud.w).toBeCloseTo(one.w * BUBBLE.cloud);
    expect(bubbleSize(say("  "))).toBeUndefined();
  });
});

describe("konuşma balonunun yeri", () => {
  it("başın üstünde sağda/solda ya da yanında; kare sınırlarının içine alınır", () => {
    expect(bubbleAt("above-right", FACE, 200, 80, BOUNDS)).toEqual({ x: 955, y: 194, w: 200, h: 80 });
    expect(bubbleAt("above-left", FACE, 200, 80, BOUNDS)).toEqual({ x: 745, y: 194, w: 200, h: 80 });
    expect(bubbleAt("right", FACE, 200, 80, BOUNDS)).toEqual({ x: 1026, y: 256, w: 200, h: 80 });
    expect(bubbleAt("left", FACE, 200, 80, BOUNDS)).toEqual({ x: 674, y: 256, w: 200, h: 80 });
    // Üst kenara ve sağ kenara dayanan baş: balon içeride kalır.
    expect(bubbleAt("above-right", { x: 1800, y: 70, w: 100, h: 120 }, 200, 80, BOUNDS)).toEqual({ x: 1920 - BUBBLE.margin - 200, y: 60 + BUBBLE.margin, w: 200, h: 80 });
  });

  it("karenin ortasına bakan yan, başın üstü önce; yazıyı, yüzü ya da konuşanın kendi yüzünü örtecek yan seçilmez", () => {
    expect(bubbleSide({ ...FACE, x: 300 }, 200, 80, { faces: [], texts: [] }, BOUNDS)).toBe("above-right");
    expect(bubbleSide({ ...FACE, x: 1500 }, 200, 80, { faces: [], texts: [] }, BOUNDS)).toBe("above-left");
    // Sağ üstte bilgi kartı: yanına iner.
    expect(bubbleSide({ ...FACE, x: 300 }, 200, 80, { faces: [], texts: [{ x: 300, y: 150, w: 400, h: 100 }] }, BOUNDS)).toBe("right");
    // Sağında başka biri: sol üste geçer.
    expect(bubbleSide({ ...FACE, x: 300 }, 200, 80, { faces: [{ x: 380, y: 150, w: 300, h: 300 }], texts: [] }, BOUNDS)).toBe("above-left");
    // Sağında başka birinin işaret eden kolu (üst gövdesi): sol üste geçer.
    expect(bubbleSide({ ...FACE, x: 300 }, 200, 80, { faces: [], texts: [], bodies: [{ x: 340, y: 100, w: 400, h: 300 }] }, BOUNDS)).toBe("above-left");
    // Baş üst kenarda: üste konan balon yüze iner, yanına konur.
    expect(bubbleSide({ x: 300, y: 70, w: 100, h: 120 }, 200, 80, { faces: [], texts: [] }, BOUNDS)).toBe("right");
  });

  it("kuyruk balonun kenarından ağza doğru, yüze BUBBLE.stop px kala biter; taban köşenin yuvarlağına taşmaz", () => {
    // Sağ üstteki balon: kuyruk alt kenardan iner, ucu yüzün sağ kenarının stop px dışında.
    const above = bubbleTail({ x: 955, y: 194, w: 200, h: 80 }, FACE)!;
    expect(above.tip[0]).toBeCloseTo(1010);
    expect(above.tip[1]).toBeCloseTo(299.3, 1);
    expect(above.base[0][1]).toBeCloseTo(194 + 80 - BUBBLE.stroke * 2.5);
    expect(above.base[1][0] - above.base[0][0]).toBeCloseTo(2 * 0.22 * 80);
    // Tam üstte (dikey çizgi): alt kenarın ortasından; tam yanda (yatay): yan kenardan, düz yer yoksa kenarın ortası.
    expect(bubbleTail({ x: 850, y: 150, w: 200, h: 80 }, FACE)).toEqual({ base: [[950 - 17.6, 222.5], [950 + 17.6, 222.5]], tip: [950, 290] });
    const right = bubbleTail({ x: 1026, y: 346.4, w: 200, h: 80 }, FACE)!;
    expect(right.tip).toEqual([1010, 386.4]);
    expect(right.base.map(([x]) => x)).toEqual([1033.5, 1033.5]);
    expect(right.base[0][1]).toBeCloseTo(386.4 - 17.6);
    // Solda ve altta duran balon da başa uzanır.
    expect(bubbleTail({ x: 600, y: 346.4, w: 200, h: 80 }, FACE)!.tip).toEqual([890, 386.4]);
    expect(bubbleTail({ x: 850, y: 600, w: 200, h: 80 }, FACE)!.tip).toEqual([950, 430]);
  });

  it("yüzün üstündeki, yüze değen ya da kenara itilip çok uzak kalan balonun kuyruğu yok", () => {
    expect(bubbleTail({ x: 900, y: 320, w: 100, h: 60 }, FACE)).toBeUndefined();
    expect(bubbleTail({ x: 1011, y: 346.4, w: 200, h: 80 }, FACE)).toBeUndefined();
    expect(bubbleTail({ x: 1600, y: 100, w: 200, h: 80 }, { x: 100, y: 600, w: 100, h: 120 })).toBeUndefined();
  });
});

describe("konuşma balonunun zamanı", () => {
  it("konuşan sahneye girince açılır, en az BUBBLE.minSec görünür; söz yoksa ya da çekim bitiyorsa balon yok", () => {
    expect(sayWindow({ anims: [] }, 10)).toBeUndefined();
    expect(sayWindow({ say: say("a"), anims: [] }, 10)).toEqual({ start: 0.15, end: 0.9 });
    expect(sayWindow({ say: say("a"), anims: [{ type: "fade_in", start: 0, end: 0.3, delay: 0 } as never, { type: "talk", start: 0, end: 1 } as never] }, 10)).toEqual({ start: 0.3, end: 0.9 });
    expect(sayWindow({ say: say("a"), anims: [{ type: "pop", start: 0.5, end: 1 } as never] }, 10)).toBeUndefined();
    expect(sayWindow({ say: say("a", { start: 0.5, end: 0.52 }), anims: [] }, 10)!.end).toBeCloseTo(0.65);
    expect(sayWindow({ say: say("a", { start: 0.95, end: 0.96 }), anims: [] }, 10)).toEqual({ start: 0.95, end: 1 });
  });

  it("açılış yaylanarak (q), kapanış solarak (fade); pencerenin dışında yok", () => {
    const win = { start: 0.2, end: 0.8 };
    expect(bubbleTiming(win, 1, 10)).toBeUndefined();
    expect(bubbleTiming(win, 9, 10)).toBeUndefined();
    expect(bubbleTiming(win, 2, 10)).toEqual({ q: 0, fade: 1 });
    expect(bubbleTiming(win, 2 + BUBBLE.pop / 2, 10)!.q).toBeCloseTo(0.5);
    expect(bubbleTiming(win, 8 - BUBBLE.out / 2, 10)!.fade).toBeCloseTo(0.5);
  });
});

describe("konuşma balonunun çizimi", () => {
  const box = { x: 955, y: 194, w: 200, h: 80 };
  const tail = bubbleTail(box, FACE)!;
  it("konuşma: kuyruk (konturlu), gövde, kuyruğun konturu örten dolgusu, yazı; kuyruğun ucundan yaylanarak açılır", () => {
    const svg = bubbleSvg({ box, tail, rows: ['"Evet" & <hayır>'], size: 36, kind: "speech", q: 1, fade: 1 });
    expect(svg.match(/<path/g)).toHaveLength(2);
    expect(svg).toContain('<rect x="955.0" y="194.0" width="200.0" height="80.0" rx="34.0"');
    expect(svg).toContain("&quot;Evet&quot; &amp; &lt;hayır&gt;</text>");
    expect(svg).toContain(`translate(${tail.tip[0].toFixed(1)} ${tail.tip[1].toFixed(1)}) scale(1.0000)`);
    expect(svg).toContain('opacity="1.000"');
    // Açılırken küçük ve saydam; kuyruksuz balon alt kenarının ortasından büyür.
    const opening = bubbleSvg({ box, rows: ["a"], size: 36, kind: "speech", q: 0, fade: 1 });
    expect(opening).toContain("translate(1055.0 274.0) scale(0.4000)");
    expect(opening).toContain('opacity="0.000"');
    expect(opening).not.toContain("<path");
  });

  it("düşünce: tümsekli bulut ve ağza doğru küçülen üç daire; kuyruk yoksa daire de yok", () => {
    const svg = bubbleSvg({ box, tail, rows: ["hmm", "acaba"], size: 36, kind: "thought", q: 1, fade: 0.5 });
    expect(svg.match(/<circle/g)).toHaveLength(3);
    expect(svg.match(/ A /g)!.length).toBeGreaterThanOrEqual(8);
    expect(svg.match(/<text/g)).toHaveLength(2);
    expect(svg).toContain('opacity="0.500"');
    expect(bubbleSvg({ box, rows: ["hmm"], size: 36, kind: "thought", q: 1, fade: 1 })).not.toContain("<circle");
  });
});

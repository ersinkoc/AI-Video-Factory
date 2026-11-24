// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { Timeline, type MotionLook, type MotionScene } from "@ys/core";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bars, count, diagram, field, grid, kinetic, line, object, PALETTE, sc } from "./film-fixture.ts";

// Remotion bağlamı yerine kare ve video ayarı testten; WebGL bileşenleri (Pixi, Three) kayıt tutan sahte.
const clock = vi.hoisted(() => ({ frame: 0, fps: 30, width: 1920, height: 1080 }));
vi.mock("remotion", async (orig) => ({
  ...(await orig<typeof import("remotion")>()),
  useCurrentFrame: () => clock.frame,
  useVideoConfig: () => ({ fps: clock.fps, width: clock.width, height: clock.height, durationInFrames: 300 }),
  staticFile: (p: string) => `/public/${p}`,
  Img: (p: { src: string }) => <img data-image="" src={p.src} />,
  OffthreadVideo: (p: { src: string }) => <video src={p.src} />,
  Sequence: (p: { children: ReactNode; name: string }) => <section data-name={p.name}>{p.children}</section>,
  Audio: () => null,
}));
const gl = vi.hoisted(() => ({ particles: [] as Record<string, unknown>[], three: [] as Record<string, unknown>[] }));
vi.mock("../src/PixiParticles.tsx", () => ({ PixiParticles: (p: Record<string, unknown>) => (gl.particles.push(p), <canvas data-pixi={String(p.kind)} />) }));
vi.mock("../src/Scene3D.tsx", () => ({ Scene3D: (p: { spec: Record<string, unknown> }) => (gl.three.push(p.spec), <canvas data-three={String(p.spec.preset)} />) }));

const { FilmScene, ILLUSTRATIVE } = await import("../src/motion-film/Film.tsx");
const { capMarked, foldedIndex, markedWords, PILL_LIFT, pillRoom } = await import("../src/motion-film/Kinetic.tsx");
const { halves, labelSpot, layoutNodes } = await import("../src/motion-film/Diagram.tsx");
const { gridShape } = await import("../src/motion-film/Grid.tsx");
const { titleSizes } = await import("../src/motion-film/Ambient.tsx");
const { fileSrc, labelParts } = await import("../src/motion-film/context.ts");
const { calloutPoint } = await import("../src/motion-film/Data.tsx");
const { Episode } = await import("../src/Episode.tsx");
const { chunkKeys } = await import("../src/chunks.ts");

const LOOK: MotionLook = { bpm: 120, palette: PALETTE, type: "clear", images: ["assets/motion/e/img/logo.png", "https://example.com/shot.png"], sections: [] };

afterEach(() => {
  cleanup();
  clock.frame = 0;
  clock.width = 1920;
  clock.height = 1080;
  gl.particles.length = 0;
  gl.three.length = 0;
});

const draw = (scene: MotionScene, frame: number, opts: { lang?: string; captions?: boolean; look?: MotionLook; frames?: number } = {}) => {
  clock.frame = frame;
  return render(<FilmScene scene={scene} look={opts.look ?? LOOK} frames={opts.frames ?? 240} lang={opts.lang ?? "en"} captions={opts.captions ?? false} />).container;
};

describe("film sahnesi çerçevesi", () => {
  it("zemin rengi, kamera ve slam inişinin sarsıntısı", () => {
    const c = draw(kinetic("slam", { camera: "punch", ground: "ink" }), 6);
    const root = c.querySelector("[data-film]") as HTMLElement;
    expect(root.style.background).toBe(PALETTE.ink);
    // İlk satır 6. karede iner (giriş 10 karenin %60'ı): sahne genişliğin %0,55'i kadar kayar.
    expect((root.firstElementChild as HTMLElement).style.transform).toContain("translateX(0.550%)");
    expect(draw(kinetic("rise"), 6).querySelector("[data-film] > div")!.getAttribute("style")).toContain("translateX(0.000%)");
  });

  it("giriş örtüleri: parlama, taşma (vurgu zemininde mürekkep renginde), renk dönüşü; süreleri bitince yok", () => {
    expect(draw(object({ transition: "flash" }), 0).querySelector('[data-entry="flash"]')).not.toBeNull();
    expect(draw(object({ transition: "flash" }), 20).querySelector("[data-entry]")).toBeNull();
    const flood = draw(object({ transition: "flood" }), 2).querySelector('[data-entry="flood"]') as HTMLElement;
    expect(flood.style.background).toBe(PALETTE.accent);
    const onAccent = draw(object({ transition: "flood", ground: "accent" }), 2).querySelector('[data-entry="flood"]') as HTMLElement;
    expect(onAccent.style.background).not.toBe(PALETTE.accent);
    expect(draw(object({ transition: "flood" }), 30).querySelector("[data-entry]")).toBeNull();
    expect((draw(object({ transition: "flip" }), 1).querySelector('[data-entry="flip"]') as HTMLElement).style.background).toBe(PALETTE.alt);
    expect(draw(object({ transition: "flip" }), 30).querySelector("[data-entry]")).toBeNull();
    expect(draw(object({ transition: "whip" }), 0).querySelector("[data-entry]")).toBeNull();
  });

  it("temsili veri rozeti dilde; bilinmeyen dilde İngilizce", () => {
    expect(draw(bars({ illustrative: true }), 100, { lang: "tr" }).querySelector("[data-badge]")!.textContent).toBe(ILLUSTRATIVE.tr);
    expect(draw(bars({ illustrative: true }), 100, { lang: "ja" }).querySelector("[data-badge]")!.textContent).toBe(ILLUSTRATIVE.en);
    expect(draw(bars(), 100).querySelector("[data-badge]")).toBeNull();
  });

  it("görsel yolu: yerel dosya public/ altından, adres olduğu gibi", () => {
    expect(fileSrc("a/b.png")).toBe("/public/a/b.png");
    expect(fileSrc("https://x.y/z.png")).toBe("https://x.y/z.png");
  });
});

describe("kinetik yazı", () => {
  it("slam ve rise: satırlar ve vurgu hapı (oturduktan sonra yazı rengi döner)", () => {
    const c = draw(kinetic("slam"), 120);
    expect([...c.querySelectorAll("[data-slam]")].map((e) => e.textContent)).toEqual(["Ship faster now", "40 minutes"]);
    const pill = c.querySelector("[data-pill]") as HTMLElement;
    expect(pill.textContent).toBe("40 minutes");
    expect(pill.style.color).not.toBe("");
    expect((draw(kinetic("slam"), 0).querySelector("[data-pill]") as HTMLElement).style.color).toBe("");
    expect(draw(kinetic("rise", { kinetic: { lines: ["Plain"], mode: "rise" } }), 60).querySelector("[data-pill]")).toBeNull();
    expect(draw(kinetic("rise"), 60).querySelectorAll("[data-line]").length).toBe(2);
    // Maske hapın taşmasını kesmez: iki yandan geniş, yerleşim aynı.
    const mask = draw(kinetic("rise"), 60).querySelector<HTMLElement>("[data-line]")!.style;
    expect([mask.padding, mask.margin]).toEqual(["0px 0.3em 0.2em", "0px -0.3em -0.12em"]);
  });

  it("kelime kelime: vurgu ifadesi birkaç kelimeye yayılır; dikeyde sola yaslı", () => {
    clock.width = 1080;
    clock.height = 1920;
    const c = draw(kinetic("words"), 200);
    expect(c.querySelectorAll("[data-word]").length).toBe(5);
    expect([...c.querySelectorAll("[data-pill]")].map((e) => e.textContent)).toEqual(["40", "minutes"]);
    expect(markedWords("a b c", "b c")).toEqual([false, true, true]);
    // Hapın taşması kadar boşluk yalnız vurgusuz komşunun yanına: "40 minutes" tek hap, "now"dan ayrı.
    const margins = (e: Element) => [(e as HTMLElement).style.marginLeft, (e as HTMLElement).style.marginRight];
    const mid = draw(kinetic("words", { kinetic: { lines: ["in 40 minutes now"], mode: "words", highlight: "40 minutes" } }), 200);
    expect([...mid.querySelectorAll("[data-word]")].map(margins)).toEqual([["0px", "0px"], ["0.2em", "0px"], ["0px", "0.2em"], ["0px", "0px"]]);
    // Hapın ardındaki noktalama hapla aynı satırda kalır.
    const dot = draw(kinetic("rise", { kinetic: { lines: ["Open source. Now"], mode: "rise", highlight: "Open source" } }), 60);
    expect(dot.querySelector("[data-pill]")!.textContent).toBe("Open source.");
    expect(dot.querySelector("[data-line]")!.textContent).toBe("Open source. Now");
    expect(markedWords("a b", "zz")).toEqual([false, false]);
    expect(markedWords("a b")).toEqual([false, false]);
    // "İ" küçülünce iki karakter olur: arama metnin kendi indeksinde kalır, hap kaymaz.
    expect(foldedIndex("İlk önizleme ne kadar sürdü?", "ne kadar")).toBe(13);
    expect(foldedIndex("İLK", "ilk")).toBe(0);
    const tr = draw(kinetic("rise", { kinetic: { lines: ["İlk önizleme ne kadar sürdü?"], mode: "rise", highlight: "ne kadar" } }), 60);
    expect(tr.querySelector("[data-pill]")!.textContent).toBe("ne kadar");
    expect(markedWords("İzle. Seç.", "seç.")).toEqual([false, true]);
  });

  it("satır içi hap komşu yazının yanında taşması kadar boşluk bırakır; sığdırma bunu bir harf sayar", () => {
    const pillOf = (line: string, highlight: string) => draw(kinetic("rise", { kinetic: { lines: [line], mode: "rise", highlight } }), 60).querySelector<HTMLElement>("[data-pill]")!.style;
    expect([pillOf("ilk altı ayı.", "altı ayı").marginLeft, pillOf("ilk altı ayı.", "altı ayı").marginRight]).toEqual(["0.2em", "0px"]);
    expect([pillOf("14 çiftlik.", "14").marginLeft, pillOf("14 çiftlik.", "14").marginRight]).toEqual(["0px", "0.2em"]);
    expect([pillOf("a b c", "b").marginLeft, pillOf("a b c", "b").marginRight]).toEqual(["0.2em", "0.2em"]);
    expect([pillOf("Kavruk.", "Kavruk").marginLeft, pillOf("Kavruk.", "Kavruk").marginRight]).toEqual(["0px", "0px"]);
    expect(pillRoom("ilk altı ayı.", "altı ayı")).toBe("ilk altı ayı.x");
    expect(pillRoom("14 çiftlik.", "14")).toBe("14x çiftlik.");
    expect(pillRoom("Kavruk.", "kavruk")).toBe("Kavruk.");
    expect(pillRoom("a b", "zz")).toBe("a b");
    expect(pillRoom("a b")).toBe("a b");
    // Genişliğe dayanan uzun satırda komşulu hap yazıyı küçültür (satır ve bölüm kartı kipi).
    const long = "Kapına kırk sekiz saatte taze kahve gelir";
    const sizeOf = (mode: "rise" | "chapter", highlight?: string) =>
      parseFloat(draw(kinetic(mode, { kinetic: { lines: [long], mode, highlight } }), 60).querySelector<HTMLElement>("[data-line]")!.style.fontSize);
    expect(sizeOf("rise", "sekiz saatte")).toBeLessThan(sizeOf("rise"));
    expect(sizeOf("chapter", "sekiz saatte")).toBeLessThan(sizeOf("chapter"));
  });

  it("üstünde işaret olan büyük harfli hap üstte uzar, satır onunla büyür (İ'nin noktası hapın dışına taşmaz)", () => {
    expect([capMarked("İstasyon"), capMarked("Öz"), capMarked("ÇAĞ"), capMarked("Â")]).toEqual([true, true, true, true]);
    // Alttaki çengel (Ç, Ş) ve küçük harfin noktası büyük harfin üstüne çıkmaz.
    expect([capMarked("Çark"), capMarked("Şimdi"), capMarked("istasyon"), capMarked("ölçü"), capMarked("400")]).toEqual([false, false, false, false, false]);
    const lift = (mode: "rise" | "slam", line: string, highlight: string) =>
      draw(kinetic(mode, { kinetic: { lines: [line], mode, highlight } }), 120).querySelector<HTMLElement>("[data-pill]")!.style.paddingTop;
    expect(lift("slam", "400 İstasyon", "400 İstasyon")).toBe(`${PILL_LIFT}em`);
    expect(lift("rise", "daha temiz İzmir", "daha temiz İzmir")).toBe(`${PILL_LIFT}em`);
    // Hap yalnız kendi metnine bakar: satırın başka yerindeki İ hapı uzatmaz.
    expect(lift("slam", "400 İstasyon", "400")).toBe("0px");
    // Kelime kipinde uzayan kelime taban çizgisinde kalır.
    const words = draw(kinetic("words", { kinetic: { lines: ["Yeni Ölçü"], mode: "words", highlight: "Ölçü" } }), 200);
    expect(words.querySelector<HTMLElement>("[data-pill]")!.style.paddingTop).toBe(`${PILL_LIFT}em`);
    expect(words.querySelector<HTMLElement>("[data-word]")!.parentElement!.style.alignItems).toBe("baseline");
  });

  it("bölüm kartı: sayaç ve toplam, bölüm bilgisi yoksa 01/01", () => {
    const c = draw(kinetic("chapter"), 100);
    expect(c.querySelector("[data-chapter]")!.textContent).toBe("02/05");
    const bare = draw(sc({ language: "kinetic", kinetic: { lines: ["Intro"], mode: "chapter" } }), 100);
    expect(bare.querySelector("[data-chapter]")!.textContent).toBe("01/01");
    const indexOnly = draw(sc({ language: "kinetic", kinetic: { lines: ["Intro"], mode: "chapter", chapter: { index: 3, total: 3 } } }), 100);
    expect(indexOnly.querySelector("[data-chapter]")!.textContent).toBe("03/03");
  });
});

describe("veri hikayesi", () => {
  it("çubuklar sıfırdan büyür, değer çubukla sayar; vurgu, not ve kaynak", () => {
    const before = draw(bars(), 0);
    expect(before.querySelectorAll("[data-bar]").length).toBe(3);
    expect(before.querySelector("[data-callout]")).toBeNull();
    const after = draw(bars({ illustrative: true }), 200, { lang: "en" });
    expect(after.textContent).toContain("12.5 min");
    expect(after.textContent).toContain("-5.0 min");
    expect(after.querySelector("[data-callout]")!.textContent).toBe("Cache");
    expect(after.querySelector("[data-source]")!.textContent).toBe("Internal");
    // Vurgusuz grafikte bütün çubuklar tam renkte.
    const plain = draw(bars({ data: { chart: "bars", title: "t", points: [{ label: "a", value: 1 }, { label: "b", value: 2 }] } }), 200);
    expect(plain.textContent).toContain("2");
    expect(plain.querySelector("[data-source]")).toBeNull();
  });

  it("çizgi noktadan noktaya çizilir; vurgulanan nokta halka taşır, değeri yazılır; simge birim bitişik", () => {
    expect(draw(line(), 0).querySelector("[data-path]")).toBeNull();
    const mid = draw(line(), 42);
    expect(mid.querySelector("[data-path]")!.getAttribute("points")!.split(" ").length).toBe(3);
    const end = draw(line(), 200);
    expect(end.querySelectorAll("[data-dot]").length).toBe(3);
    expect(end.querySelector('[data-dot="2"] circle')!.getAttribute("stroke")).toBe(PALETTE.accent);
    expect(end.textContent).toContain("22%");
    expect(draw(line({ data: { chart: "line", title: "t", points: [{ label: "a", value: 3 }, { label: "b", value: 3 }] } }), 200).querySelectorAll("[data-dot]").length).toBe(2);
  });

  it("sayaç sayarak oturur (son anda hafif büyüme), not sayının altına iner", () => {
    expect((draw(count(), 0).querySelector("[data-count]") as HTMLElement).style.opacity).toBe("0");
    const landing = draw(count(), 15 + 27) .querySelector("[data-count]") as HTMLElement;
    expect(landing.textContent).toBe("70%");
    expect(landing.style.transform).not.toBe("scale(1)");
    expect((draw(count(), 200).querySelector("[data-count]") as HTMLElement).style.transform).toBe("scale(1)");
    const noted = draw(count({ data: { chart: "count", title: "t", unit: "x", callout: "Wow", count: { to: 2.5, decimals: 1, prefix: "~" } } }), 200);
    expect(noted.textContent).toContain("~2.5x");
    expect(noted.querySelector("[data-callout]")!.textContent).toBe("Wow");
    // Sayı vurgu rengindedir, zeminde okunmuyorsa (4,5:1 altı) yazı rengindedir: açık zeminde turuncu 2,9:1.
    const colorOf = (ground: MotionScene["ground"]) => (draw(count({ ground }), 200).querySelector("[data-count]") as HTMLElement).style.color;
    expect(colorOf("ground")).toBe(PALETTE.ink);
    expect(colorOf("ink")).toBe(PALETTE.accent);
  });

  it("sayacın notu sayının altındaki kendi bandında, sayı bandın üstüne sığar (iki oranda); notsuz sayaç alanın tamamını kullanır", () => {
    const noted = count({ data: { chart: "count", title: "Average alert to phones", callout: "From river rise to SMS", count: { to: 40, suffix: " s" } } });
    for (const [w, h] of [[1920, 1080], [1080, 1920]] as const) {
      clock.width = w;
      clock.height = h;
      const c = draw(noted, 200);
      const num = c.querySelector("[data-count]") as HTMLElement;
      const callout = c.querySelector("[data-callout]") as HTMLElement;
      const [top, height, size] = [num.style.top, num.style.height, num.style.fontSize].map(parseFloat) as [number, number, number];
      // Notun üst kenarı (alt ucu - boyu ~1,9 × yazı boyu) sayının satır kutusunun (merkez + 0,6 × boy) altında.
      const calloutTop = parseFloat(callout.style.top) - parseFloat(callout.style.fontSize) * 1.9;
      expect(calloutTop).toBeGreaterThanOrEqual(top + height / 2 + 0.6 * size);
      const plain = draw(count({ data: { ...noted.data!, callout: undefined } }), 200).querySelector("[data-count]") as HTMLElement;
      expect(parseFloat(plain.style.height)).toBeGreaterThan(height);
    }
    expect(calloutPoint(count().data!, { x: 0, y: 100, w: 800, h: 500 }, 200, 40)).toEqual({ x: 400, y: 600 });
  });

  it("çubuklarda not grafiğin üstündeki bantta, genişliğiyle grafiğin içinde; kayan başlık grafiği aşağı iter", () => {
    const chart = { x: 100, y: 300, w: 800, h: 600 };
    const d = bars().data!;
    // Vurgulanan C sağda (x 766): 300 px'lik not sağ kenarı aşmaz, bandın altına oturur.
    expect(calloutPoint(d, chart, 300, 40)).toEqual({ x: 750, y: 236 });
    expect(calloutPoint({ ...d, highlight: 1 }, chart, 300, 40).x).toBe(500);
    expect(calloutPoint(d, chart, 900, 40).x).toBe(500);
    // Çizgide noktanın üstünde, başlık payının altında.
    expect(calloutPoint(line().data!, chart, 200, 40)).toEqual({ x: 800, y: 376 });
    clock.width = 1080;
    clock.height = 1920;
    const barTop = (over: Record<string, unknown>) => parseFloat((draw(bars({ data: { ...bars().data!, ...over } }), 200).querySelector('[data-bar="0"] > div') as HTMLElement).style.top);
    expect(barTop({ title: "Audio rendered separately from the picture" })).toBeGreaterThan(barTop({}));
    expect(barTop({ callout: undefined })).toBeLessThan(barTop({}));
    // Vurgulanan çubuk en uzunsa not onun değer etiketinin üstünde biter (iki oranda da).
    for (const [w, h] of [[1920, 1080], [1080, 1920]] as const) {
      clock.width = w;
      clock.height = h;
      const c = draw(bars({ data: { ...bars().data!, highlight: 0 } }), 200);
      const label = parseFloat((c.querySelector('[data-bar="0"] > div:nth-child(2)') as HTMLElement).style.top);
      expect(parseFloat((c.querySelector("[data-callout]") as HTMLElement).style.top)).toBeLessThan(label - 15);
    }
  });
});

describe("sistem diyagramı", () => {
  it("düğümler, çizilerek açılan bağlar, ok ucu, etiket ve akan paketler; vurgulanan düğüm yanar", () => {
    const c = draw(diagram(), 239);
    expect(c.querySelectorAll("[data-node]").length).toBe(3);
    expect(c.querySelectorAll("[data-edge]").length).toBe(2);
    expect(c.querySelectorAll("polygon").length).toBe(2);
    expect(c.querySelector("text")!.textContent).toBe("push");
    expect(c.querySelectorAll("[data-packet]").length).toBe(2);
    expect((c.querySelector('[data-node="c"]') as HTMLElement).style.background).toBe(PALETTE.accent);
    // Yazı kenara değmez: iç boşluk iki yandan genişliğin %4'ü, dış boyut aynı.
    const node = (c.querySelector('[data-node="c"]') as HTMLElement).style;
    const pad = parseFloat(node.padding.split(" ")[1]!);
    expect(pad).toBeGreaterThan(0);
    expect(Math.round((parseFloat(node.width) + pad * 2) * 0.04)).toBe(pad);
    expect(node.textWrap).toBe("balance");
    expect(c.querySelector("[data-title]")!.textContent).toBe("Flow");
    // Bağ henüz girmemiş; paket yok.
    const early = draw(diagram({ diagram: { ...diagram().diagram!, packets: false, title: undefined } }), 0);
    expect(early.querySelectorAll("[data-edge]").length).toBe(0);
    expect(early.querySelector("[data-title]")).toBeNull();
    expect(draw(diagram({ diagram: { ...diagram().diagram!, packets: false } }), 239).querySelectorAll("[data-packet]").length).toBe(0);
  });

  it("dikey ve yatay bağlar; dikey videoda ızgara döner; etiket kelime sınırından ikiye", () => {
    clock.width = 1080;
    clock.height = 1920;
    const straight = diagram({
      diagram: { nodes: [{ id: "a", label: "A", col: 0, row: 0 }, { id: "b", label: "B", col: 0, row: 1 }, { id: "c", label: "C", col: 1, row: 1 }], edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }] },
    });
    expect(draw(straight, 239).querySelectorAll("[data-edge] line").length).toBe(2);
    const area = { x: 0, y: 0, w: 400, h: 400 };
    expect(layoutNodes(straight.diagram!, area, true).at.get("b")).toEqual({ x: 300, y: 100 });
    expect(layoutNodes(straight.diagram!, area, false).at.get("b")).toEqual({ x: 100, y: 300 });
    expect(halves("Kurgu ve Render")).toBe("Kurgu ve");
    // Bağ etiketi çizgiye değmez: kutunun dik yöndeki yarısı + boşluk kadar, bağın üst yanına.
    const gap = (s: { x1: number; y1: number; x2: number; y2: number }, w: number, h: number) => {
      const p = labelSpot(s, w, h, 10);
      const [dx, dy] = [s.x2 - s.x1, s.y2 - s.y1];
      const len = Math.hypot(dx, dy);
      const dist = ((p.x - s.x1) * dy - (p.y - s.y1) * dx) / len;
      const reach = (w / 2) * Math.abs(dy / len) + (h / 2) * Math.abs(dx / len);
      return { p, clear: Math.abs(dist) - reach };
    };
    expect(gap({ x1: 0, y1: 0, x2: 200, y2: 0 }, 100, 20)).toEqual({ p: { x: 100, y: -20 }, clear: 10 });
    for (const s of [{ x1: 0, y1: 0, x2: 120, y2: 140 }, { x1: 300, y1: 200, x2: 0, y2: 0 }, { x1: 0, y1: 0, x2: 0, y2: 200 }]) {
      const { p, clear } = gap(s, 110, 24);
      expect(clear).toBeCloseTo(10);
      // Eğik bağda etiket bağın üst yanında kalır.
      if (s.y1 !== s.y2 && s.x1 !== s.x2) expect(p.y).toBeLessThan((s.y1 + s.y2) / 2);
    }
    expect(halves("Deploy")).toBe("Deploy");
  });

  it("bağ etiketi düğüm kutularına binmez: önce üstte uzaklaşır, başlık alanına çıkamazsa alta iner, hiç yer yoksa ilk yer", () => {
    // 16:9'da dört sütun: düğümler arası 100 px, "every 30 s" ~190 px (23 Kas, film m3).
    const boxes = [{ x: 0, y: 0, w: 300, h: 134 }, { x: 400, y: 0, w: 300, h: 134 }];
    const s = { x1: 306, y1: 67, x2: 394, y2: 67 };
    const hits = (p: { x: number; y: number }) => boxes.some((b) => p.x + 96 > b.x && p.x - 96 < b.x + b.w && p.y + 15 > b.y && p.y - 15 < b.y + b.h);
    expect(labelSpot(s, 192, 30, 12)).toEqual({ x: 350, y: 40 });
    const up = labelSpot(s, 192, 30, 12, boxes);
    expect(hits(up)).toBe(false);
    expect(up.y).toBeLessThan(0);
    const down = labelSpot(s, 192, 30, 12, boxes, { x: -100, y: -10, w: 900, h: 400 });
    expect(hits(down)).toBe(false);
    expect(down.y).toBeGreaterThan(134);
    expect(labelSpot(s, 192, 30, 12, boxes, { x: 0, y: 0, w: 700, h: 134 })).toEqual({ x: 350, y: 40 });
    // Kısa bağın etiketleri çizilen diyagramda da düğümlerin dışında (dört sütun, 1920×1080).
    const nodes = ["Water sensor", "LoRa gateway", "Rise-rate model", "SMS alert"].map((label, i) => ({ id: `n${i}`, label, col: i, row: 1 }));
    const c = draw(diagram({ diagram: { title: "From river sensor to SMS", nodes, edges: [0, 1, 2].map((i) => ({ from: `n${i}`, to: `n${i + 1}`, label: "every 30 s" })), packets: false } }), 239);
    const top = Math.min(...[...c.querySelectorAll("[data-node]")].map((n) => parseFloat((n as HTMLElement).style.top)));
    for (const t of c.querySelectorAll("[data-edge] text")) expect(Number(t.getAttribute("y")) + parseFloat((t as SVGElement).style.fontSize) / 2).toBeLessThan(top);
  });

  it("ayraçlı düğüm etiketi ad ve alt yazı olarak iki satırdır, ayraç düşer", () => {
    expect(labelParts("İzle · Sahneler")).toEqual(["İzle", "Sahneler"]);
    expect(labelParts("Dinle - Metin")).toEqual(["Dinle", "Metin"]);
    expect(labelParts("A · B · C")).toEqual(["A · B · C"]);
    expect(labelParts(" · x")).toEqual([" · x"]);
    // Sayılar arasındaki tire aralıktır, bölünmez; sayılar arasındaki nokta ayraçtır.
    expect(labelParts("31 – 60 sn")).toEqual(["31 – 60 sn"]);
    expect(labelParts("10 - 20 ms")).toEqual(["10 - 20 ms"]);
    expect(labelParts("v2 · 3 bölge")).toEqual(["v2", "3 bölge"]);
    expect(labelParts("Katman 2 - Önbellek")).toEqual(["Katman 2", "Önbellek"]);
    expect(labelParts("Deploy")).toEqual(["Deploy"]);
    const [, b, c3] = diagram().diagram!.nodes;
    const nodes = [{ id: "a", label: "Commit · Kaynaklar", col: 0, row: 0 }, b!, { ...c3!, label: "Yayınla · CI" }];
    const c = draw(diagram({ diagram: { ...diagram().diagram!, nodes } }), 239);
    const a = c.querySelector('[data-node="a"]')!;
    expect(a.textContent).toBe("CommitKaynaklar");
    expect(a.querySelector("[data-sub]")!.textContent).toBe("Kaynaklar");
    expect(c.querySelector('[data-node="b"] [data-sub]')).toBeNull();
  });

  it("dikeyde her düğüm kendi satırındaki zincir tek sütuna toplanır; atlayan bağ, ortak satır ya da yatay kare dokunmaz", () => {
    const area = { x: 0, y: 0, w: 400, h: 800 };
    const nodes = [0, 1, 2, 3].map((i) => ({ id: `n${i}`, label: `N${i}`, col: i, row: i }));
    const chain = [{ from: "n0", to: "n1" }, { from: "n1", to: "n2" }, { from: "n2", to: "n3" }];
    const stair = layoutNodes({ nodes, edges: chain, packets: false }, area, true);
    expect(stair.cellW).toBe(400);
    expect(nodes.map((n) => stair.at.get(n.id)!.x)).toEqual([200, 200, 200, 200]);
    expect(nodes.map((n) => stair.at.get(n.id)!.y)).toEqual([100, 300, 500, 700]);
    // Atlayan bağ tek sütunda aradaki düğümün üstünden geçerdi: merdiven kalır.
    expect(layoutNodes({ nodes, edges: [...chain, { from: "n0", to: "n2" }], packets: false }, area, true).cellW).toBe(100);
    // İki düğüm aynı satırda (dalda): ızgara kalır.
    expect(layoutNodes({ nodes: [...nodes.slice(0, 3), { id: "n3", label: "N3", col: 2, row: 0 }], edges: chain, packets: false }, area, true).cellW).toBe(400 / 3);
    expect(layoutNodes({ nodes, edges: chain, packets: false }, area, false).cellH).toBe(200);
  });

  it("dikeyde iki satıra kayan başlık düğümleri aşağı iter", () => {
    clock.width = 1080;
    clock.height = 1920;
    const topOf = (title: string) => parseFloat((draw(diagram({ diagram: { ...diagram().diagram!, title } }), 239).querySelector('[data-node="a"]') as HTMLElement).style.top);
    expect(topOf("A much longer diagram title that wraps")).toBeGreaterThan(topOf("Flow"));
  });
});

describe("kart ızgarası ve montaj", () => {
  it("ızgara şekli (dikeyde döner)", () => {
    expect([1, 3, 4, 5, 7].map((n) => gridShape(n, false))).toEqual([{ cols: 1, rows: 1 }, { cols: 3, rows: 1 }, { cols: 2, rows: 2 }, { cols: 3, rows: 2 }, { cols: 3, rows: 3 }]);
    expect(gridShape(3, true)).toEqual({ cols: 1, rows: 3 });
  });

  it("kartlar ızgaraya oturur: başlık, görsel, rakam, gövde", () => {
    const c = draw(grid("grid", { illustrative: true }), 200);
    expect(c.querySelectorAll("[data-card]").length).toBe(3);
    expect(c.querySelector("[data-title]")!.textContent).toBe("All in one");
    expect(c.querySelector("[data-image]")!.getAttribute("src")).toBe("/public/assets/motion/e/img/logo.png");
    expect(c.textContent).toContain("Every build");
    const untitled = draw(grid("grid", { grid: { mode: "grid", cards: [{ title: "x", image: 1 }] } }), 200);
    expect(untitled.querySelector("[data-title]")).toBeNull();
    expect(untitled.querySelector("[data-image]")!.getAttribute("src")).toBe("https://example.com/shot.png");
    expect(draw(grid("grid", { grid: { mode: "grid", cards: [{ title: "x", image: 9 }] } }), 200).querySelector("[data-image]")).toBeNull();
  });

  it("kart rakamı tek satırdır ve kartın iç genişliğine sığacak kadar küçülür", () => {
    const stat = (c: HTMLElement) => c.querySelector("[data-card] div > div, [data-montage] div > div") as HTMLElement;
    const cards = (s: string) => draw(grid("grid", { grid: { mode: "grid", cards: [{ title: "Süre aralığı", stat: s }, { title: "b" }, { title: "c" }] } }), 200);
    const short = stat(cards("12"));
    expect(short.textContent).toBe("12");
    expect(short.style.whiteSpace).toBe("nowrap");
    // Vurgu kart renginde okunmuyorsa rakam kartın yazı rengindedir.
    expect(short.style.color).toBe(PALETTE.ground);
    const dark = { ...PALETTE, alt: "#101010", accent: "#ffd23f" };
    const bright = draw(grid("grid", { grid: { mode: "grid", cards: [{ title: "a", stat: "12" }] } }), 200, { look: { ...LOOK, palette: dark } });
    expect((bright.querySelector("[data-card] div > div") as HTMLElement).style.color).toBe(dark.accent);
    expect(parseFloat(stat(cards("31-60 saniye")).style.fontSize)).toBeLessThan(parseFloat(short.style.fontSize));
    clock.width = 1080;
    clock.height = 1920;
    const reel = (s: string) => stat(draw(grid("montage", { grid: { mode: "montage", cards: [{ title: "x", stat: s }] } }), 0));
    expect(reel("12").style.whiteSpace).toBe("nowrap");
    expect(parseFloat(reel("1750 kelime!").style.fontSize)).toBeLessThan(parseFloat(reel("12").style.fontSize));
    // Montaj rakamı da kart zemininde okunmuyorsa kartın yazı rengindedir; koyu kartta vurgu.
    expect(reel("12").style.color).toBe(PALETTE.ink);
    const second = draw(grid("montage", { grid: { mode: "montage", cards: [{ title: "x" }, { title: "y", stat: "12" }] } }), 16);
    expect((second.querySelector("[data-montage] div > div") as HTMLElement).style.color).toBe(PALETTE.accent);
  });

  it("montajda her tempo adımında tek kart kareyi doldurur, zemin ile mürekkep arasında döner", () => {
    const first = draw(grid("montage"), 0).querySelector("[data-montage]") as HTMLElement;
    expect(first.getAttribute("data-montage")).toBe("0");
    expect(first.querySelector("[data-image]")).not.toBeNull();
    const second = draw(grid("montage"), 16).querySelector("[data-montage]") as HTMLElement;
    expect(second.getAttribute("data-montage")).toBe("1");
    expect(second.style.background).toBe(PALETTE.ink);
    expect(second.textContent).toContain("Every build");
    expect(draw(grid("montage"), 239).querySelector("[data-montage]")!.getAttribute("data-montage")).toBe("2");
    expect(draw(grid("montage", { grid: { mode: "montage", cards: [{ title: "x", image: 7 }] } }), 0).querySelector("[data-image]")).toBeNull();
  });

  it("montaj başlığı kartlar kesilirken üstte sabit etiket kalır; uzun başlık tek satıra sığacak kadar küçülür", () => {
    const size = (c: HTMLElement) => parseFloat((c.querySelector("[data-title]") as HTMLElement).style.fontSize);
    const first = draw(grid("montage"), 0);
    expect(first.querySelector("[data-title]")!.textContent).toBe("All in one");
    expect(draw(grid("montage"), 239).querySelector("[data-title]")!.textContent).toBe("All in one");
    expect(draw(grid("montage", { grid: { mode: "montage", cards: [{ title: "x" }] } }), 0).querySelector("[data-title]")).toBeNull();
    const long = "Every stage of the pipeline checks its own output first";
    expect(size(draw(grid("montage", { illustrative: true, grid: { mode: "montage", title: long, cards: [{ title: "x" }] } }), 0))).toBeLessThan(size(first));
    const wide = draw(grid("grid"), 200);
    expect(size(draw(grid("grid", { grid: { mode: "grid", title: long, cards: [{ title: "x" }] } }), 200))).toBeLessThan(size(wide));
  });
});

describe("alan ve 3D nesne", () => {
  it("parçacık alanı vurgu renginde, başlık ve alt yazı; yazısız alan yalnız parçacık", () => {
    const c = draw(field(), 100);
    expect(gl.particles[0]).toMatchObject({ kind: "starfield", tint: 0xff4f1f, size: [1920, 1080] });
    expect([...c.querySelectorAll("[data-rise]")].map((e) => e.textContent)).toEqual(["Build once", "Ship everywhere"]);
    expect(draw(field({ field: { kind: "sparks" } }), 100).querySelectorAll("[data-rise]").length).toBe(0);
    expect([...draw(field({ field: { kind: "sparks", subtitle: "Only sub" } }), 100).querySelectorAll("[data-rise]")].map((e) => e.textContent)).toEqual(["Only sub"]);
  });

  it("3D nesne ortada; görsel (logo) başlık yerine, not ikinci sırada", () => {
    const c = draw(object(), 100);
    expect(gl.three[0]).toMatchObject({ preset: "crystal", camera: "push_in" });
    expect(c.querySelector("[data-image]")).toBeNull();
    const logo = draw(object({ object: { preset: "atom", image: 0, caption: "Ship" } }), 100);
    expect(logo.querySelector("[data-image]")).not.toBeNull();
    expect([...logo.querySelectorAll("[data-rise]")].map((e) => e.textContent)).toEqual(["Ship"]);
    expect(draw(object({ object: { preset: "atom", image: 5 } }), 100).querySelector("[data-image]")).toBeNull();
  });

  it("başlıksız not kendi boyunda okunur; başlığın altındaki not en az 32 px", () => {
    const face = { em: 0.64 } as never;
    const wide = { width: 1920, height: 1080, box: { x: 0, y: 0, w: 1500, h: 800 }, heading: face, body: { em: 0.55 } as never };
    const tall = { ...wide, width: 1080, height: 1920, box: { x: 0, y: 0, w: 787, h: 1136 } };
    const note = "Northwind Relay · Messages that never wait";
    expect(titleSizes(wide, undefined, note)).toEqual({ title: 0, sub: 64 });
    expect(titleSizes(tall, undefined, note).sub).toBeGreaterThanOrEqual(56);
    expect(titleSizes(wide, "Relay").sub).toBe(0);
    expect(titleSizes(wide, "Relay", "Ship").sub).toBe(Math.round(titleSizes(wide, "Relay").title * 0.42));
    expect(titleSizes(wide, "A much longer object title for the end card here", "Ship").sub).toBe(32);
    const sub = (c: HTMLElement) => parseFloat(([...c.querySelectorAll("[data-rise] > div")].at(-1) as HTMLElement).style.fontSize);
    const wideNote = draw(object({ object: { preset: "atom", image: 0, caption: note } }), 100);
    expect(sub(wideNote)).toBeGreaterThanOrEqual(48);
    // Ayraçlı not ayraçta iki satıra bölünür.
    expect(([...wideNote.querySelectorAll("[data-rise] > div")].at(-1) as HTMLElement).textContent).toBe("Northwind Relay\nMessages that never wait");
    clock.width = 1080;
    clock.height = 1920;
    expect(sub(draw(object({ object: { preset: "atom", image: 0, caption: note } }), 100))).toBeGreaterThanOrEqual(48);
  });
});

describe("bölüm kompozisyonu ve önbellek", () => {
  const timeline = (motion?: MotionLook) =>
    Timeline.parse({
      episodeId: "e",
      lang: "en",
      durationInFrames: 120,
      visuals: [{ shotId: "m1", assetUrl: "", kind: "motion_graphic", fromFrame: 0, durationInFrames: 120, film: kinetic("slam") }],
      audio: [],
      ...(motion ? { motion, typography: { pair: "clear" } } : {}),
    });

  it("film sahnesi görünümle çizilir; görünüm yoksa düz klibe düşer", () => {
    clock.frame = 30;
    expect(render(<Episode timeline={timeline(LOOK)} />).container.querySelector("[data-film]")).not.toBeNull();
    cleanup();
    expect(render(<Episode timeline={timeline()} />).container.querySelector("[data-film]")).toBeNull();
  });

  it("önbellek anahtarı filmin görünümüne ve görsellerine bağlı; filmsiz bölümün anahtarı değişmez", async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "film-chunks-"));
    mkdirSync(join(dir, "assets/motion/e/img"), { recursive: true });
    writeFileSync(join(dir, "assets/motion/e/img/logo.png"), "a");
    const look = { ...LOOK, images: ["assets/motion/e/img/logo.png"] };
    const ranges = [{ from: 0, to: 120, shots: ["m1"] }];
    const a = await chunkKeys(timeline(look), ranges, dir, "c");
    const b = await chunkKeys(timeline({ ...look, bpm: 100 }), ranges, dir, "c");
    writeFileSync(join(dir, "assets/motion/e/img/logo.png"), "b");
    const c = await chunkKeys(timeline(look), ranges, dir, "c");
    expect(new Set([a[0], b[0], c[0]]).size).toBe(3);
    const plain = await chunkKeys(timeline(), ranges, dir, "c");
    expect(plain[0]).not.toBe(a[0]);
  });
});

describe("kalan dallar", () => {
  it("dikey kare: veri, bölüm kartı, montaj ve alan başlığı küçülür; yatayda kelimeler ortalı", () => {
    clock.width = 1080;
    clock.height = 1920;
    expect(draw(bars(), 200).querySelector("[data-title]")).not.toBeNull();
    expect(draw(kinetic("chapter"), 100).querySelector("[data-chapter]")).not.toBeNull();
    expect(draw(grid("montage"), 0).querySelector("[data-montage]")).not.toBeNull();
    expect(draw(field(), 100).querySelectorAll("[data-rise]").length).toBe(2);
    expect(draw(field({ field: { kind: "sparks", subtitle: "Only" } }), 100).querySelectorAll("[data-rise]").length).toBe(1);
    clock.width = 1920;
    clock.height = 1080;
    expect(draw(kinetic("words"), 200).querySelectorAll("[data-word]").length).toBe(5);
  });

  it("hepsi sıfır olan grafik, vurgusuz not, başlıklı ama temsili olmayan ızgara, koyu zeminde kart yazısı", () => {
    expect(draw(bars({ data: { chart: "bars", title: "t", points: [{ label: "a", value: 0 }, { label: "b", value: 0 }] } }), 200).querySelectorAll("[data-bar]").length).toBe(2);
    expect(draw(line({ data: { chart: "line", title: "t", callout: "Here", points: [{ label: "a", value: 1 }, { label: "b", value: 2 }] } }), 200).querySelector("[data-callout]")!.textContent).toBe("Here");
    expect(draw(grid("grid"), 200).querySelector("[data-title]")).not.toBeNull();
    expect(draw(grid("grid", { ground: "ink" }), 200).querySelectorAll("[data-card]").length).toBe(3);
  });

  it("bağ girdi ama henüz çizilmedi: paket yok; ikiye bölmede kısa yarım kazanmaz", () => {
    // Bağ 0: 30. karede girer, 0,5 sn'de çizilir.
    const c = draw(diagram(), 31);
    expect(c.querySelectorAll("[data-edge]").length).toBe(1);
    expect(c.querySelectorAll("[data-packet]").length).toBe(0);
    expect(halves("aaaa b c")).toBe("aaaa");
  });
});

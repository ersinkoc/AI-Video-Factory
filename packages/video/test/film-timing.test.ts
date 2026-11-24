import { describe, expect, it } from "vitest";
import { emOf, fitSize, fitWrapped, rowsOf } from "../src/motion-film/context.ts";
import { FILM_LINT, filmEvents, fitScene, holdSec, lintFilm, neededFrames, textUnits } from "../src/motion-film/lint.ts";
import { diagramOrder, edgeKey } from "../src/motion-film/order.ts";
import {
  beatFrames,
  CAMERA_MAX,
  cameraAt,
  clamp01,
  colorsOf,
  contrast,
  countAt,
  enterFrames,
  enterK,
  expoOut,
  figureOn,
  FILM,
  filmStill,
  formatValue,
  luminance,
  safeBox,
  shakeAt,
  unitsOf,
  wordsOf,
} from "../src/motion-film/timing.ts";
import { bars, count, diagram, field, film, grid, kinetic, line, object, PALETTE, sc } from "./film-fixture.ts";

describe("film zamanlaması", () => {
  it("öğe sayısı dile ve kipe göre", () => {
    expect(unitsOf(kinetic("slam"))).toBe(2);
    expect(unitsOf(kinetic("rise"))).toBe(2);
    expect(unitsOf(kinetic("words"))).toBe(5);
    expect(unitsOf(kinetic("chapter"))).toBe(3);
    expect(unitsOf(bars())).toBe(5);
    expect(unitsOf(line())).toBe(5);
    expect(unitsOf(count())).toBe(2);
    expect(unitsOf(diagram())).toBe(6);
    expect(unitsOf(grid("grid"))).toBe(4);
    expect(unitsOf(grid("montage"))).toBe(3);
    expect(unitsOf(grid("grid", { grid: { cards: [{ title: "x" }] } }))).toBe(1);
    expect(unitsOf(field())).toBe(2);
    expect(unitsOf(field({ field: { kind: "sparks" } }))).toBe(0);
    expect(unitsOf(object())).toBe(2);
    expect(unitsOf(object({ object: { preset: "atom", image: 0, caption: "c" } }))).toBe(2);
    expect(unitsOf(object({ object: { preset: "atom" } }))).toBe(0);
  });

  it("öğeler tempo adımında vuruşlara girer; sığmazsa aralık sıkışır", () => {
    const words = kinetic("words");
    expect(beatFrames(120, 30)).toBe(15);
    expect(enterFrames(words, 240, 120, 30)).toEqual([0, 15, 30, 45, 60]);
    // 60 karede %70'e sığmalı: 42 / 4 = 10,5 kare aralık.
    expect(enterFrames(words, 60, 120, 30)).toEqual([0, 11, 21, 32, 42]);
    expect(enterFrames(kinetic("slam", { pace: "half" }), 240, 120, 30)).toEqual([0, 30]);
    expect(enterFrames(field({ field: { kind: "sparks", title: "t" } }), 100, 120, 30)).toEqual([0]);
    expect(enterFrames(field({ field: { kind: "sparks" } }), 100, 120, 30)).toEqual([]);
  });

  it("inceleme karesi son öğe oturduktan sonra: en erken %80, en geç son kare", () => {
    const words = kinetic("words");
    // Son giriş 60. kare, oturma 0,95 sn (28,5 kare) + 1 kare.
    expect(filmStill(words, 100, 120, 30)).toBeCloseTo(0.895);
    expect(filmStill(words, 240, 120, 30)).toBe(FILM.still);
    expect(filmStill(words, 60, 120, 30)).toBeCloseTo(59 / 60);
    expect(filmStill(field({ field: { kind: "sparks" } }), 100, 120, 30)).toBe(FILM.still);
  });

  it("giriş expo ile, kamera türleri ve en büyük ölçekleri", () => {
    expect(clamp01(-1)).toBe(0);
    expect(expoOut(0)).toBe(0);
    expect(expoOut(2)).toBe(1);
    expect(enterK(10, 10, 30)).toBe(0);
    expect(enterK(10 + FILM.enterSec * 30, 10, 30)).toBe(1);
    expect(cameraAt("still", 5, 10, 120, 30)).toEqual({ scale: 1, x: 0 });
    expect(cameraAt("push", 5, 10, 120, 30).scale).toBeCloseTo(1.035);
    expect(cameraAt("pull", 0, 10, 120, 30).scale).toBeCloseTo(1.12);
    expect(cameraAt("pull", 10, 10, 120, 30).scale).toBeCloseTo(1);
    expect(cameraAt("drift", 0, 0, 120, 30)).toEqual({ scale: 1.04, x: 0.018 });
    expect(cameraAt("punch", 0, 60, 120, 30).scale).toBe(1);
    expect(cameraAt("punch", 19, 60, 120, 30).scale).toBeCloseTo(FILM.punch);
    expect(Math.max(...Object.values(CAMERA_MAX))).toBe(FILM.punch);
    expect([9, 10, 11, 12, 13].map((f) => shakeAt([10], f))).toEqual([0, 0.55, -0.38, 0, 0]);
  });

  it("renkler: karşıtlık, zemine göre yazı ve vurgu", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21);
    expect(luminance("#ffffff")).toBeCloseTo(1);
    // Rakam vurgu renginde yalnız zeminde okunuyorsa (4,5:1).
    expect(figureOn("#f3e6d3", "#e8a33d", "#2b1b17")).toBe("#2b1b17");
    expect(figureOn("#2b1b17", "#e8a33d", "#f3e6d3")).toBe("#e8a33d");
    expect(colorsOf("ground", PALETTE)).toMatchObject({ bg: PALETTE.ground, fg: PALETTE.ink, accent: PALETTE.accent, card: PALETTE.alt });
    expect(colorsOf("ink", PALETTE)).toMatchObject({ bg: PALETTE.ink, fg: PALETTE.ground });
    const onAccent = colorsOf("accent", PALETTE);
    expect(onAccent.bg).toBe(PALETTE.accent);
    expect(onAccent.accent).toBe(onAccent.fg);
    expect(onAccent.onAccent).toBe(PALETTE.accent);
    // Açık vurguda koyu yazı seçilir.
    expect(colorsOf("accent", { ...PALETTE, accent: "#ffe066" }).fg).toBe(PALETTE.ink);
    expect(colorsOf("accent", { ...PALETTE, accent: "#1a1aa0" }).fg).toBe(PALETTE.ground);
  });

  it("güvenli kutu: dikeyde platform arayüzü, yatayda altyazı payı", () => {
    expect(safeBox(1080, 1920, false)).toEqual({ x: 64, y: 250, w: 866, h: 1250 });
    expect(safeBox(1920, 1080, false)).toEqual({ x: 134, y: 108, w: 1652, h: 864 });
    expect(safeBox(1920, 1080, true).h).toBe(756);
  });

  it("sayılar dilin biçiminde, sayaç ease-out ile", () => {
    expect(formatValue(1234.5, 1, "en")).toBe("1,234.5");
    expect(formatValue(1234.5, 1, "tr")).toBe("1.234,5");
    expect(countAt(0, 100, 5, 5, 30)).toBe(0);
    expect(countAt(0, 100, 5 + 27, 5, 30)).toBe(100);
    expect(countAt(0, 100, 5 + 13, 5, 30)).toBeGreaterThan(50);
    expect(wordsOf("  a  b ")).toEqual(["a", "b"]);
  });

  it("yazı tipinin harf genişliği ve sığdırma", () => {
    expect(emOf({ id: "ibm-plex-mono", generic: "monospace" })).toBe(0.64);
    expect(emOf({ id: "oswald", generic: "sans-serif" })).toBe(0.47);
    expect(emOf({ id: "bitter", generic: "serif" })).toBe(0.57);
    expect(emOf({ id: "ibm-plex-sans", generic: "sans-serif" })).toBe(0.58);
    expect(fitSize(["abcd"], 400, 500, 0.5)).toBe(200);
    expect(fitSize(["abcd"], 400, 100, 0.5)).toBe(100);
    expect(fitSize([], 400, 100, 0.5)).toBe(100);
    // Dikey: satır kelime sınırından kayar, yazı büyük kalır; en uzun kelime sığmalı; yükseklik sınırlar; en az 24.
    expect(fitWrapped(["27 dakika beklemek mi?"], 866, 1000, 170, 0.64)).toBeGreaterThan(150);
    expect(fitSize(["27 dakika beklemek mi?"], 866, 170, 0.64)).toBeLessThan(65);
    expect(fitWrapped(["Supercalifragilistic"], 400, 1000, 170, 0.5)).toBeLessThanOrEqual(40);
    expect(fitWrapped(["a b c d e f g h"], 100, 200, 170, 0.5)).toBeLessThan(60);
    expect(fitWrapped(["x".repeat(500)], 100, 100, 170, 0.5)).toBe(24);
    // Açgözlü kaydırmanın satır sayısı: boş satır bir satırdır, sığmayan tek kelime yine bir satır.
    expect(rowsOf("a bb ccc", 100, 10)).toBe(1);
    expect(rowsOf("a bb ccc", 50, 10)).toBe(2);
    expect(rowsOf("", 50, 10)).toBe(1);
    expect(rowsOf("xxxxxxxxxx", 50, 10)).toBe(1);
  });
});

describe("diyagram sırası", () => {
  it("düğümün ardından iki ucu görünen bağ; bilinmeyen uçlu bağ girmez", () => {
    expect(diagramOrder(diagram().diagram!)).toEqual(["a", "b", edgeKey(0), "c", edgeKey(1)]);
    expect(edgeKey(3)).toBe("edge:3");
  });
});

describe("film denetimi", () => {
  it("yazılı öğelerin sırası ve kelimeleri (her dil)", () => {
    expect(textUnits(kinetic("words"))).toEqual([{ unit: 2, words: 3 }, { unit: 4, words: 2 }]);
    expect(textUnits(kinetic("chapter"))).toEqual([{ unit: 1, words: 3 }, { unit: 2, words: 2 }]);
    expect(textUnits(kinetic("slam"))).toEqual([{ unit: 0, words: 3 }, { unit: 1, words: 2 }]);
    expect(textUnits(bars())).toEqual([{ unit: 0, words: 2 }, { unit: 4, words: 1 }]);
    expect(textUnits(count())).toEqual([{ unit: 0, words: 1 }, { unit: 1, words: 1, after: FILM.countSec }]);
    expect(textUnits(count({ data: { chart: "count", title: "T", callout: "c d", count: { to: 5 } } }))).toEqual([
      { unit: 0, words: 1 },
      { unit: 1, words: 1, after: FILM.countSec },
      { unit: 2, words: 2 },
    ]);
    expect(textUnits(diagram())).toEqual([{ unit: 0, words: 1 }, { unit: 1, words: 2 }, { unit: 3, words: 1 }]);
    expect(textUnits(grid("grid"))).toEqual([{ unit: 0, words: 3 }, { unit: 1, words: 1 }, { unit: 2, words: 3 }, { unit: 3, words: 4 }]);
    expect(textUnits(grid("grid", { grid: { cards: [{ title: "x" }] } }))).toEqual([{ unit: 0, words: 1 }]);
    expect(textUnits(grid("montage"))).toEqual([{ unit: 1, words: 3, until: 2 }, { unit: 2, words: 4, until: 3 }]);
    expect(textUnits(field())).toEqual([{ unit: 0, words: 2 }, { unit: 1, words: 2 }]);
    expect(textUnits(object())).toEqual([{ unit: 0, words: 1 }, { unit: 1, words: 2 }]);
    expect(textUnits(object({ object: { preset: "atom", image: 0, caption: "c" } }))).toEqual([{ unit: 1, words: 1 }]);
    expect(textUnits(object({ object: { preset: "atom", caption: "c" } }))).toEqual([{ unit: 0, words: 1 }]);
    expect(textUnits(object({ object: { preset: "atom", title: "T" } }))).toEqual([{ unit: 0, words: 1 }]);
    expect(holdSec(4)).toBe(1.5);
  });

  it("sahne yazıları okunacak ve öğeler sığacak kadar uzar (en çok 32 vuruş)", () => {
    const short = kinetic("slam", { beats: 1 });
    // İki öğe vuruşta: 22 kare; ikinci satır 15. karede girer, 2 kelime 1 sn okunur: 45 kare = 3 vuruş.
    expect(neededFrames(short, 120, 30)).toBe(45);
    expect(fitScene(short, 120, 30).beats).toBe(3);
    const long = kinetic("slam", { beats: 8 });
    expect(fitScene(long, 120, 30)).toBe(long);
    const huge = sc({ language: "kinetic", beats: 1, pace: "bar", kinetic: { lines: ["a b c d", "e f g h", "i j k l", "m n o p"], mode: "words" } });
    expect(fitScene(huge, 120, 30).beats).toBe(32);
    // Montaj kartı bir sonrakine kadar kendi süresince okunur, sahneyi uzatmaz; son kart sahnenin sonuna kadar kalır, sahne
    // onun okunacağı kadar uzar: üçüncü kart 15. karede girer, 4 kelime 1,5 sn = 60 kare.
    expect(neededFrames(grid("montage", { pace: "eighth" }), 120, 30)).toBe(15 + 45);
    expect(neededFrames(grid("montage", { pace: "eighth", grid: { mode: "montage", cards: [{ title: "Alerts on every deploy" }, { title: "Logs" }] } }), 120, 30)).toBe(Math.ceil(7.5 / 0.7));
    // Tek kartlı montaj (24 Kas, 9:16 film m9 "Installed in One Day"): 2 vuruştan 3'e.
    const one = grid("montage", { beats: 2, pace: "eighth", grid: { mode: "montage", cards: [{ title: "Installed in One Day", stat: "1 day" }] } });
    expect(fitScene(one, 120, 30).beats).toBe(3);
    expect(lintFilm(film([fitScene(one, 120, 30)]), 30).filter((i) => i.kind === "hold")).toEqual([]);
    expect(neededFrames(field({ field: { kind: "sparks" } }), 120, 30)).toBe(1);
    // Sayaç 15. karede girer, 0,9 sn sayar, son değeri 0,75 sn okunur: 65 kare = 5 vuruş (2 vuruşta kesmede yarım kalıyordu).
    expect(neededFrames(count({ beats: 2 }), 120, 30)).toBe(65);
    expect(fitScene(count({ beats: 2 }), 120, 30).beats).toBe(5);
  });

  it("olaylar: kesmeler, girişler, montaj kesmeleri; öğesiz sahne kesmesiyle sayılır", () => {
    const f = film([field({ field: { kind: "sparks" }, beats: 4 }), grid("montage", { beats: 4 })]);
    const ev = filmEvents(f, 30);
    expect(ev[0]).toEqual({ at: 0, cut: true, sceneId: "m1" });
    expect(ev.filter((e) => e.sceneId === "m2").every((e) => e.cut)).toBe(true);
  });

  it("kanca ve boşluk; planlı duruş boşluk sayılmaz", () => {
    const quiet = film([field({ field: { kind: "sparks" }, beats: 16 })]);
    expect(lintFilm(quiet, 30).map((i) => i.kind)).toEqual(["hook", "gap"]);
    expect(lintFilm(film([field({ field: { kind: "sparks" }, beats: 16 })], { sections: [{ name: "stop", bars: 4, energy: 0 }] }), 30).map((i) => i.kind)).toEqual(["hook"]);
    const gap = lintFilm(quiet, 30).find((i) => i.kind === "gap")!;
    expect(gap).toMatchObject({ sceneId: "m1", atSec: 0 });
  });

  it("patlama ve düzlük (20 sn'den uzun montaj/hibrit film); sürekli rotada aranmaz", () => {
    const slow = film([field({ beats: 32 }), field({ beats: 32 })], { bpm: 88 });
    expect(lintFilm(slow, 30).map((i) => i.kind)).toEqual(expect.arrayContaining(["burst", "flat"]));
    expect(lintFilm({ ...slow, route: "continuous" }, 30).map((i) => i.kind)).not.toContain("burst");
    const burst = film([field({ beats: 16 }), ...Array.from({ length: 6 }, () => sc({ language: "kinetic", beats: 1, kinetic: { lines: ["Go"], mode: "slam" } })), field({ beats: 24 })]);
    const kinds = lintFilm(burst, 30).map((i) => i.kind);
    expect(kinds).not.toContain("burst");
    expect(kinds).not.toContain("flat");
    expect(FILM_LINT.burst.cuts).toBe(5);
  });

  it("sıkışan öğeler ve okunamayan yazı; montaj kartı bir sonrakine kadar", () => {
    const issues = lintFilm(film([kinetic("words", { beats: 1 })]), 30);
    expect(issues.map((i) => i.kind)).toEqual(expect.arrayContaining(["crowded", "hold"]));
    const montage = lintFilm(film([grid("montage", { beats: 2, pace: "eighth" })]), 30);
    expect(montage.filter((i) => i.kind === "hold").length).toBeGreaterThan(0);
    expect(lintFilm(film([kinetic("slam", { beats: 8 })]), 30).filter((i) => i.kind === "hold")).toEqual([]);
    // Sayacın okunması sayış bittikten sonra başlar.
    expect(lintFilm(film([count({ beats: 4 })]), 30).filter((i) => i.kind === "hold")).toHaveLength(1);
    expect(lintFilm(film([count({ beats: 5 })]), 30).filter((i) => i.kind === "hold")).toEqual([]);
  });
});

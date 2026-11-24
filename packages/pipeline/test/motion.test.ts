import { MotionFilm, MotionScene } from "@ys/core";
import { describe, expect, it } from "vitest";
import { betterFilm, reviewShare } from "../src/motion-stages.ts";
import { shortTimeline } from "../src/short.ts";
import { briefNumbers, clipSections, describeScene, filmOffsets, filmPosterMs, filmScript, filmShots, filmTimeline, fitSections, fitToVoice, fixPalette, illustrative, MOTION, normalizeFilm, numbersIn } from "../src/motion.ts";

const PALETTE = { ground: "#f3efe6", ink: "#141414", accent: "#ff4f1f", alt: "#1e2a3a" };
const sc = (over: Record<string, unknown>) => MotionScene.parse({ id: "m9", beats: 8, ...over });
const kin = (over: Record<string, unknown> = {}) => sc({ language: "kinetic", kinetic: { lines: ["Ship faster"], mode: "slam" }, ...over });
const film = (scenes: MotionScene[], over: Record<string, unknown> = {}): MotionFilm =>
  MotionFilm.parse({ title: "Relay", bpm: 120, route: "hybrid", palette: PALETTE, type: "clear", sections: [{ name: "hook", bars: 2, energy: 7 }, { name: "build", bars: 30, energy: 6 }], scenes: scenes.map((s) => ({ ...s, id: "m1" })), ...over });
const opts = { brief: "Deploys drop from 40 minutes to 12; 70% faster.", images: 1, colors: [] as string[], targetSec: 60, fps: 30 };

describe("brifin sayıları ve temsili veri", () => {
  it("binlik ayırıcı ve ondalığı ikisi de dener", () => {
    expect(numbersIn("1,5 ve 1.000; 40% 2.3M 27")).toEqual([15, 1.5, 1000, 1, 40, 23, 2.3, 27]);
    expect(numbersIn("yok")).toEqual([]);
    // Yazıyla geçen küçük sayılar brifte bilinir (24 Kas, 9:16 film: "installed in one day" kartta "1 day" oldu, üç sahne
    // yanlış rozet taşıdı); tam kelime, iki dilde, büyük harfle de.
    expect(briefNumbers("Installed in ONE day, İKİ yıl, THIRTY units, 12-year, bir buçuk, bonus, once")).toEqual([12, 1, 2, 30, 1, 0.5]);
    const grid1 = sc({ language: "grid", grid: { cards: [{ title: "Installed in One Day", stat: "1 day" }] } });
    expect(illustrative(grid1, "Installed in one day.")).toBe(false);
    expect(illustrative(grid1, "Installed fast.")).toBe(true);
  });

  it("grafik, sayaç ve kart rakamı brifte yoksa sahne temsilidir; eksi değer mutlak değeriyle aranır", () => {
    const bars = (values: number[]) => sc({ language: "data", data: { chart: "bars", title: "t", points: values.map((value, i) => ({ label: `p${i}`, value })) } });
    expect(illustrative(bars([40, 12]), opts.brief)).toBe(false);
    expect(illustrative(bars([40, -12]), opts.brief)).toBe(false);
    expect(illustrative(bars([40, 13]), opts.brief)).toBe(true);
    expect(illustrative(sc({ language: "data", data: { chart: "count", title: "t", count: { to: 70 } } }), opts.brief)).toBe(false);
    expect(illustrative(sc({ language: "grid", grid: { cards: [{ title: "x", stat: "3x" }] } }), opts.brief)).toBe(true);
    expect(illustrative(sc({ language: "grid", grid: { cards: [{ title: "x" }] } }), opts.brief)).toBe(false);
    expect(illustrative(kin(), opts.brief)).toBe(false);
  });
});

describe("palet", () => {
  it("kullanıcı renk verdiyse vurgu onlardan; mürekkep zeminde okunmazsa siyaha ya da beyaza döner", () => {
    expect(fixPalette(PALETTE, [])).toEqual(PALETTE);
    expect(fixPalette(PALETTE, ["#2563EB"]).accent).toBe("#2563eb");
    expect(fixPalette({ ...PALETTE, accent: "#2563EB" }, ["#2563eb"]).accent).toBe("#2563EB");
    expect(fixPalette({ ...PALETTE, ink: "#e0e0e0" }, []).ink).toBe("#000000");
    expect(fixPalette({ ...PALETTE, ground: "#101010", ink: "#202020" }, []).ink).toBe("#ffffff");
  });
});

describe("filmin kuralları", () => {
  it("geçersiz sahne atılır, kimlikler sıralanır, ilk sahne sert kesmeyle açılır, parlama en çok iki kez", () => {
    const f = normalizeFilm(
      film([
        sc({ language: "kinetic" }),
        kin({ transition: "flash" }),
        kin({ transition: "flash" }),
        kin({ transition: "flash" }),
        kin({ transition: "flash" }),
      ]),
      opts,
    );
    expect(f.scenes.map((s) => [s.id, s.transition])).toEqual([
      ["m1", "cut"],
      ["m2", "flash"],
      ["m3", "flash"],
      ["m4", "cut"],
    ]);
  });

  it("içerik temizliği: dil dışı içerik, bulunamayan vurgu, bölüm bilgisi, sayaç ve grafik alanları", () => {
    const [k, c, d, chapter, b] = normalizeFilm(
      film([
        kin({ data: { chart: "count", title: "t", count: { to: 1 } }, kinetic: { lines: ["A"], mode: "slam", highlight: "zz", chapter: { index: 2, total: 3 } } }),
        sc({ language: "data", data: { chart: "count", title: "t", count: { to: 70 }, points: [{ label: "a", value: 1 }], highlight: 0 } }),
        sc({ language: "data", data: { chart: "bars", title: "t", count: { to: 5 }, points: [{ label: "a", value: 40 }, { label: "b", value: 12 }], highlight: 5 } }),
        kin({ kinetic: { lines: ["Intro"], mode: "chapter", chapter: { index: 4, total: 2 } } }),
        kin({ kinetic: { lines: ["Intro"], mode: "chapter", highlight: "intro" } }),
      ]),
      opts,
    ).scenes;
    expect(k!.data).toBeUndefined();
    expect(k!.kinetic).toEqual({ lines: ["A"], mode: "slam" });
    expect(c!.data).toMatchObject({ points: [], count: { to: 70 } });
    expect(c!.data!.highlight).toBeUndefined();
    expect(d!.data!.count).toBeUndefined();
    expect(d!.data!.highlight).toBeUndefined();
    expect(chapter!.kinetic!.chapter).toEqual({ index: 4, total: 4 });
    expect(b!.kinetic).toMatchObject({ highlight: "intro", chapter: { index: 1, total: 1 } });
  });

  it("diyagram: tekrar eden düğüm, aynı hücre (sonraki boş hücre, 16'da başa döner), geçersiz bağ, bilinmeyen vurgu; tek düğüm kalırsa sahne atılır", () => {
    const g = normalizeFilm(
      film([
        sc({
          language: "diagram",
          diagram: {
            nodes: [
              { id: "a", label: "A", col: 3, row: 3 },
              { id: "a", label: "A2", col: 0, row: 0 },
              { id: "b", label: "B", col: 3, row: 3 },
              { id: "c", label: "C", col: 0, row: 0 },
            ],
            edges: [{ from: "a", to: "b" }, { from: "a", to: "b" }, { from: "a", to: "a" }, { from: "a", to: "zz" }, { from: "b", to: "c", label: "x" }],
            highlight: "zz",
          },
        }),
        sc({ language: "diagram", diagram: { nodes: [{ id: "a", label: "A", col: 0, row: 0 }, { id: "a", label: "B", col: 1, row: 0 }] } }),
        sc({ language: "diagram", diagram: { nodes: [{ id: "a", label: "A", col: 0, row: 0 }, { id: "b", label: "B", col: 1, row: 0 }], highlight: "b" } }),
      ]),
      opts,
    ).scenes;
    expect(g).toHaveLength(2);
    expect(g[0]!.diagram!.nodes.map((n) => [n.id, n.col, n.row])).toEqual([
      ["a", 3, 3],
      ["b", 0, 0],
      ["c", 1, 0],
    ]);
    expect(g[0]!.diagram!.edges).toEqual([{ from: "a", to: "b" }, { from: "b", to: "c", label: "x" }]);
    expect(g[0]!.diagram!.highlight).toBeUndefined();
    expect(g[1]!.diagram!.highlight).toBe("b");
  });

  it("sayaçta birim son ekte varsa bir kez; montajda okunmayan gövde atılır, okunmayan başlık tempoyu yavaşlatır", () => {
    const [dup, keep, fast, slow, long, roomy] = normalizeFilm(
      film([
        sc({ language: "data", data: { chart: "count", title: "t", unit: "ms", count: { to: 50, suffix: " ms" } } }),
        sc({ language: "data", data: { chart: "count", title: "t", unit: "x", count: { to: 50, suffix: "%" } } }),
        sc({ language: "grid", grid: { mode: "montage", cards: [{ title: "Windows", body: "Direct device sync" }, { title: "Linux" }] } }),
        sc({ language: "grid", grid: { mode: "montage", cards: [{ title: "Alerts on every deploy" }] } }),
        sc({ language: "grid", grid: { mode: "montage", cards: [{ title: "a b c d e f g h" }] } }),
        sc({ language: "grid", pace: "bar", grid: { mode: "montage", cards: [{ title: "Mac", body: "Fast" }] } }),
      ]),
      opts,
    ).scenes;
    expect(dup!.data!.unit).toBeUndefined();
    expect(keep!.data!.unit).toBe("x");
    expect(fast!.grid!.cards.map((c) => c.body)).toEqual([undefined, undefined]);
    expect(fast!.pace).toBe("beat");
    expect(slow!.pace).toBe("bar");
    expect(long!.pace).toBe("bar");
    expect(roomy!.grid!.cards[0]!.body).toBe("Fast");
  });

  it("görsel dizini verilen görsel sayısını aşarsa düşer", () => {
    const [gr, ob, ok] = normalizeFilm(
      film([
        sc({ language: "grid", grid: { cards: [{ title: "a", image: 0 }, { title: "b", image: 3 }] } }),
        sc({ language: "object", object: { preset: "atom", image: 2 } }),
        sc({ language: "object", object: { preset: "atom", image: 0 } }),
      ]),
      opts,
    ).scenes;
    expect(gr!.grid!.cards.map((c) => c.image)).toEqual([0, undefined]);
    expect(ob!.object!.image).toBeUndefined();
    expect(ok!.object!.image).toBe(0);
  });

  it("yazılar okunacak kadar uzar, temsili veri işaretlenir, uzun film sondan kısalır (son sahne kalır), ritim çizelgesi uyar", () => {
    const f = normalizeFilm(film([kin({ beats: 1 }), sc({ language: "data", data: { chart: "count", title: "t", count: { to: 9 } } })]), opts);
    expect(f.scenes[0]!.beats).toBeGreaterThan(1);
    expect(f.scenes[1]!.illustrative).toBe(true);
    expect(f.scenes[0]!.illustrative).toBe(false);
    const long = normalizeFilm(film(Array.from({ length: 6 }, (_, i) => kin({ beats: 32, kinetic: { lines: [`Line ${i}`], mode: "slam" } }))), { ...opts, targetSec: 20 });
    // 120 BPM'de 32 vuruş 16 sn; sınır 25 sn: iki sahne kalır, sonuncusu korunur.
    expect(long.scenes.map((s) => [s.id, s.kinetic!.lines[0]])).toEqual([
      ["m1", "Line 0"],
      ["m2", "Line 5"],
    ]);
    expect(long.sections.reduce((n, s) => n + s.bars, 0)).toBe(16);
    expect(() => normalizeFilm(film([sc({ language: "kinetic" })]), opts)).toThrow();
    expect(MOTION.over).toBe(1.25);
  });

  it("ritim çizelgesi: fazlası kesilir, eksik son bölüme eklenir, boşsa tek kurulum", () => {
    expect(fitSections([{ name: "hook", bars: 2, energy: 7 }, { name: "peak", bars: 9, energy: 9 }, { name: "resolve", bars: 4, energy: 3 }], [{ beats: 16 }])).toEqual([
      { name: "hook", bars: 2, energy: 7 },
      { name: "peak", bars: 2, energy: 9 },
    ]);
    expect(fitSections([{ name: "hook", bars: 1, energy: 7 }], [{ beats: 10 }])).toEqual([{ name: "hook", bars: 3, energy: 7 }]);
    expect(fitSections([], [{ beats: 0 }])).toEqual([{ name: "build", bars: 1, energy: 6 }]);
  });
});

describe("kapak ve Short'un ritim çizelgesi", () => {
  it("kapak ilk kinetik sahnenin sonuna doğru; kinetik yoksa ilk sahne", () => {
    const v = (id: string, language: string, fromFrame: number) => ({ shotId: id, fromFrame, durationInFrames: 100, film: { language } });
    expect(filmPosterMs({ fps: 30, visuals: [v("m1", "data", 0), v("m2", "kinetic", 100)] as never })).toBe(Math.round((185 / 30) * 1000));
    expect(filmPosterMs({ fps: 30, visuals: [v("m1", "data", 0)] as never })).toBe(Math.round((85 / 30) * 1000));
  });

  it("sahne başlangıçları timeline'dan (seslendirmeden değil)", () => {
    expect(filmOffsets({ fps: 30, visuals: [{ shotId: "m1", fromFrame: 0 }, { shotId: "m2", fromFrame: 45 }] as never })).toEqual({ m1: 0, m2: 1500 });
  });

  it("yalnız aralıkla örtüşen bölümler, aralığın başından", () => {
    // 120 BPM: ölçü 2 sn. kanca 0–4, duruş 4–6, zirve 6–14, çözülme 14–18 sn.
    const sections = [{ name: "hook", bars: 2, energy: 7 }, { name: "stop", bars: 1, energy: 0 }, { name: "peak", bars: 4, energy: 9 }, { name: "resolve", bars: 2, energy: 3 }] as const;
    expect(clipSections([...sections], 120, 6000, 16000)).toEqual([{ name: "peak", bars: 4, energy: 9 }, { name: "resolve", bars: 1, energy: 3 }]);
    expect(clipSections([...sections], 120, 3000, 5000)).toEqual([{ name: "hook", bars: 1, energy: 7 }, { name: "stop", bars: 1, energy: 0 }]);
  });

  it("filmin Short'u kendi çizelgesini taşır; filmsiz timeline'a dokunmaz", () => {
    const f = normalizeFilm(film([kin({ beats: 16 }), kin({ beats: 16 })]), { ...opts, targetSec: 180 });
    const t = filmTimeline({ episodeId: "e", lang: "en", fps: 30, width: 1920, height: 1080, film: f, images: [], voice: {}, captions: false });
    const short = shortTimeline(t, 8000, 16000);
    expect(short.motion!.sections.reduce((n, s) => n + s.bars, 0)).toBe(4);
    expect(shortTimeline({ ...t, motion: undefined }, 8000, 16000).motion).toBeUndefined();
  });
});

describe("anlatım, senaryo, çekim ve timeline", () => {
  const f = normalizeFilm(
    film([
      kin({ narration: "Bir." }),
      sc({ language: "data", data: { chart: "bars", title: "Süre", points: [{ label: "a", value: 40 }, { label: "b", value: 12 }] } }),
      sc({ language: "diagram", diagram: { nodes: [{ id: "a", label: "A", col: 0, row: 0 }, { id: "b", label: "B", col: 1, row: 0 }], edges: [{ from: "a", to: "b" }] } }),
      sc({ language: "diagram", diagram: { title: "Akış", nodes: [{ id: "a", label: "A", col: 0, row: 0 }, { id: "b", label: "B", col: 1, row: 0 }] } }),
      sc({ language: "grid", grid: { cards: [{ title: "x" }, { title: "y" }] } }),
      sc({ language: "grid", grid: { title: "Hepsi", cards: [{ title: "x" }] } }),
      sc({ language: "field", field: { kind: "sparks", title: "Hava" } }),
      sc({ language: "object", object: { preset: "atom" } }),
      sc({ language: "object", object: { preset: "atom", title: "Logo" } }),
      sc({ language: "field", field: { kind: "sparks" } }),
    ]),
    { ...opts, targetSec: 180 },
  );

  it("sahnenin kısa tarifi her dilde", () => {
    expect(f.scenes.map(describeScene)).toEqual(["kinetic: Ship faster", "data: Süre", "diagram: A → B", "diagram: Akış", "grid: x, y", "grid: Hepsi", "field: Hava", "object: atom", "object: Logo", "field: "]);
  });

  it("anlatım varsa sahne vuruşla uzar; senaryo ve çekimler sahne başına", () => {
    const timed = fitToVoice(f, { m1: 9000 });
    expect(timed.scenes[0]!.beats).toBe(19);
    expect(timed.scenes[1]).toBe(f.scenes[1]);
    expect(fitToVoice(f, { m1: 100 }).scenes[0]).toBe(f.scenes[0]);
    expect(filmScript(f).scenes[0]).toEqual({ id: "m1", beatId: "m1", narration: "Bir.", visualIntent: `kinetic (${f.scenes[0]!.beats} beats)`, emotion: "neutral", location: "" });
    const shots = filmShots(f, 30);
    expect(shots[0]).toMatchObject({ id: "m1", sceneId: "m1", kind: "motion_graphic", startMs: 0, camera: "static" });
    expect(shots[1]!.startMs).toBe(shots[0]!.endMs);
  });

  it("timeline: sahne başına film görseli, anlatım sahne başında, altyazı isteğe bağlı, görünüm ve yazı tipi", () => {
    const voice = { m2: { key: "v.mp3", durationMs: 1000, words: [{ text: "Süre", startMs: 100, endMs: 400 }] } };
    const t = filmTimeline({ episodeId: "e", lang: "tr", fps: 30, width: 1920, height: 1080, film: f, images: ["img.png"], voice, captions: true });
    expect(t.visuals).toHaveLength(10);
    expect(t.visuals[1]).toMatchObject({ shotId: "m2", kind: "motion_graphic", assetUrl: "", film: { id: "m2" } });
    const at = t.visuals[1]!.fromFrame;
    expect(t.audio).toEqual([{ role: "voice", assetUrl: "v.mp3", fromFrame: at, durationInFrames: 30, volume: 1 }]);
    expect(t.captions[0]).toMatchObject({ text: "Süre", startMs: Math.round((at / 30) * 1000 + 100) });
    expect(t.motion).toEqual({ bpm: 120, palette: f.palette, type: "clear", images: ["img.png"], sections: f.sections });
    expect(t.typography).toEqual({ pair: "clear" });
    expect(t.durationInFrames).toBe(t.visuals.at(-1)!.fromFrame + t.visuals.at(-1)!.durationInFrames);
    const silent = filmTimeline({ episodeId: "e", lang: "tr", fps: 30, width: 1920, height: 1080, film: f, images: [], voice, captions: false });
    expect(silent.captions).toEqual([]);
    expect(silent.speech).toHaveLength(1);
  });
});

describe("film düzeltmesinin ölçüsü", () => {
  it("geçemeyen pay küçülürse ya da aynı payda ortalama yükselirse daha iyi", () => {
    // Kontrol listeli kayıtta 8 barajı; denetlenmeyen kare (m3) geçemez sayılır.
    const shots = { m1: { score: 10, issues: [], checks: {} }, m2: { score: 7, issues: [], checks: {} } };
    expect(reviewShare({ shots }, ["m1", "m2", "m3"])).toEqual({ share: 2 / 3, mean: 8.5 });
    expect(reviewShare({ shots: {} }, [])).toEqual({ share: 0, mean: 0 });
    expect(betterFilm({ share: 0.2, mean: 6 }, { share: 0.5, mean: 9 })).toBe(true);
    expect(betterFilm({ share: 0.5, mean: 9 }, { share: 0.5, mean: 8 })).toBe(true);
    expect(betterFilm({ share: 0.5, mean: 8 }, { share: 0.5, mean: 8 })).toBe(false);
    expect(betterFilm({ share: 0.6, mean: 10 }, { share: 0.5, mean: 8 })).toBe(false);
  });
});

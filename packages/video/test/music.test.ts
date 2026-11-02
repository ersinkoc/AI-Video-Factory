import { Timeline } from "@ys/core";
import { describe, expect, it } from "vitest";
import { FEEL, MUSIC, MUSIC_RATE, musicSections, musicTrack, speechRegions } from "../src/music.ts";

const FPS = 30;
const tl = (visuals: object[], extra: object = {}, sec = 40) =>
  Timeline.parse({ episodeId: "e", lang: "tr", durationInFrames: sec * FPS, visuals, audio: [], ...extra });
/** sn cinsinden başlayan, havası verilmiş vektör çekim; havasız ise durağan kare. */
const shot = (fromSec: number, sec: number, mood?: string) => ({
  shotId: `s${fromSec}`,
  assetUrl: "",
  kind: mood ? "motion_graphic" : "still_motion",
  fromFrame: fromSec * FPS,
  durationInFrames: sec * FPS,
  ...(mood ? { vector: { mood } } : {}),
});
const word = (startSec: number, endSec: number) => ({ text: "x", startMs: startSec * 1000, endMs: endSec * 1000 });

/** İzin [a, b) saniye aralığındaki RMS düzeyi (doğrusal). */
function rms(samples: Int16Array, a: number, b: number): number {
  let sum = 0;
  for (let i = Math.round(a * MUSIC_RATE); i < Math.round(b * MUSIC_RATE); i++) sum += (samples[i]! / 32767) ** 2;
  return Math.sqrt(sum / ((b - a) * MUSIC_RATE));
}

describe("müzik bölümleri", () => {
  it("çekimsiz ya da havasız bölüm tek nötr bölümdür; aynı havadaki çekimler birleşir", () => {
    expect(musicSections(tl([]))).toEqual([{ fromFrame: 0, frames: 40 * FPS, mood: "neutral" }]);
    // Durağan karelerin havası yok: nötr; sırasız çekimler sıralanır, ilk bölüm 0'dan başlar.
    expect(musicSections(tl([shot(20, 20, "warm"), shot(2, 18), shot(0, 2)]))).toEqual([
      { fromFrame: 0, frames: 20 * FPS, mood: "neutral" },
      { fromFrame: 20 * FPS, frames: 20 * FPS, mood: "warm" },
    ]);
    expect(musicSections(tl([shot(0, 10, "day"), shot(10, 10, "day"), shot(20, 20, "night")]))).toEqual([
      { fromFrame: 0, frames: 20 * FPS, mood: "day" },
      { fromFrame: 20 * FPS, frames: 20 * FPS, mood: "night" },
    ]);
  });

  it("kısa bölüm komşusuna katılır: ilki sonrakine, öteki öncekine; aynı havadaki komşular birleşir", () => {
    // Baştaki 3 sn'lik gece sonraki bölüme katılır.
    expect(musicSections(tl([shot(0, 3, "night"), shot(3, 37, "day")]))).toEqual([{ fromFrame: 0, frames: 40 * FPS, mood: "day" }]);
    // Ortadaki 4 sn'lik dram öncekine katılır, iki gündüz bölümü tek bölüm olur.
    expect(musicSections(tl([shot(0, 15, "day"), shot(15, 4, "dramatic"), shot(19, 21, "day")]))).toEqual([{ fromFrame: 0, frames: 40 * FPS, mood: "day" }]);
    // Sondaki kısa bölüm öncekine katılır.
    expect(musicSections(tl([shot(0, 35, "cool"), shot(35, 5, "warm")]))).toEqual([{ fromFrame: 0, frames: 40 * FPS, mood: "cool" }]);
    // Tek bölüm kısa olsa da kalır.
    expect(musicSections(tl([shot(0, 5, "warm")], {}, 5))).toEqual([{ fromFrame: 0, frames: 5 * FPS, mood: "warm" }]);
    expect(MUSIC.minSectionSec).toBe(8);
  });
});

describe("anlatım bölgeleri", () => {
  it("kelimeler önden ve arkadan payla genişler, kısa sessizlik köprülenir; baş 0'ın altına inmez", () => {
    const regions = speechRegions(tl([], { speech: [word(0.05, 0.4), word(0.6, 1), word(3, 4)] }));
    expect(regions).toEqual([
      [0, Math.round((1 + MUSIC.postSec) * MUSIC_RATE)],
      [Math.round((3 - MUSIC.preSec) * MUSIC_RATE), Math.round((4 + MUSIC.postSec) * MUSIC_RATE)],
    ]);
  });

  it("konuşma zamanı yoksa altyazı kelimeleri, o da yoksa ses izlerinin tamamı", () => {
    expect(speechRegions(tl([], { captions: [word(2, 3)] }))).toEqual([[Math.round((2 - MUSIC.preSec) * MUSIC_RATE), Math.round((3 + MUSIC.postSec) * MUSIC_RATE)]]);
    const audio = [
      { role: "voice", assetUrl: "v2", fromFrame: 10 * FPS, durationInFrames: 5 * FPS },
      { role: "sfx", assetUrl: "s", fromFrame: 0, durationInFrames: 40 * FPS },
      { role: "voice", assetUrl: "v1", fromFrame: 0, durationInFrames: 4 * FPS },
    ];
    expect(speechRegions(tl([], { audio }))).toEqual([
      [0, 4 * MUSIC_RATE],
      [10 * MUSIC_RATE, 15 * MUSIC_RATE],
    ]);
    expect(speechRegions(tl([]))).toEqual([]);
  });
});

describe("müzik izi", () => {
  it("anlatımsız yerde hedef düzeyde, anlatımda kısık; baş ve son yumuşak", () => {
    const speech = Array.from({ length: 20 }, (_, i) => word(10 + i * 0.5, 10 + i * 0.5 + 0.4));
    const { samples, sections } = musicTrack(tl([shot(0, 40, "neutral")], { speech }), "bölüm");
    expect(sections).toHaveLength(1);
    expect(samples.length).toBe(40 * MUSIC_RATE);
    const gap = rms(samples, 3, 9);
    const under = rms(samples, 12, 19);
    expect(gap / MUSIC.rms).toBeGreaterThan(0.85);
    expect(gap / MUSIC.rms).toBeLessThan(1.15);
    expect(under / gap).toBeGreaterThan(MUSIC.duck * 0.8);
    expect(under / gap).toBeLessThan(MUSIC.duck * 1.2);
    // Anlatım bitince müzik geri gelir.
    expect(rms(samples, 22, 28) / gap).toBeGreaterThan(0.85);
    expect(rms(samples, 0, 0.1)).toBeLessThan(gap * 0.1);
    expect(Math.abs(samples.at(-1)!)).toBeLessThan(50);
  });

  it("her hava kendi düzeninde çalar (tempo, arpej, bas), bölümler çapraz kararır; aynı tohum aynı müzik", () => {
    const moods = Object.keys(FEEL);
    const visuals = moods.map((m, i) => shot(i * 9, 9, m));
    const a = musicTrack(tl(visuals, {}, moods.length * 9), "x");
    expect(a.sections.map((s) => s.mood)).toEqual(moods);
    for (let k = 0; k < moods.length; k++) expect(rms(a.samples, k * 9 + 2, k * 9 + 7) / MUSIC.rms).toBeGreaterThan(0.6);
    // Bölüm sınırında sessizlik yok: iki bölüm üst üste biner.
    expect(rms(a.samples, 8.8, 9.2) / MUSIC.rms).toBeGreaterThan(0.4);
    // Aynı tohum aynı müzik; başka bölüm başka anahtarda çalabilir (izler bayt olarak karşılaştırılır, hızlı).
    const bytes = (seed: string) => Buffer.from(musicTrack(tl([shot(0, 2, "day")], {}, 2), seed).samples.buffer);
    expect(bytes("x").equals(bytes("x"))).toBe(true);
    const others = ["a", "b", "c", "d", "e", "f"].map(bytes);
    expect(others.some((s) => !s.equals(others[0]!))).toBe(true);
  });
});

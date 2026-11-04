import { Timeline } from "@ys/core";
import { describe, expect, it } from "vitest";
import { SHORT, shortRange, shortTimeline } from "../src/short.ts";

const S = 1000;

describe("Short aralığı", () => {
  const ids = ["s1", "s2", "s3", "s4"];
  const starts = { s1: 0, s2: 20 * S, s3: 50 * S, s4: 60 * S };

  it("seçilen sahneler aynen; bilinmeyen ya da ters seçim baştan", () => {
    expect(shortRange(ids, starts, 90 * S, { from: "s2", to: "s3" })).toEqual({ scenes: ["s2", "s3"], fromMs: 20 * S, toMs: 60 * S });
    // Baştan: bir dakikayı aşmayan en uzun aralık.
    const head = { scenes: ["s1", "s2", "s3"], fromMs: 0, toMs: 60 * S };
    expect(shortRange(ids, starts, 90 * S)).toEqual(head);
    expect(shortRange(ids, starts, 90 * S, { from: "yok", to: "s3" })).toEqual(head);
    expect(shortRange(ids, starts, 90 * S, { from: "s3", to: "yok" })).toEqual(head);
    expect(shortRange(ids, starts, 90 * S, { from: "s3", to: "s2" })).toEqual(head);
  });

  it("uzun seçim sondan kısalır; kısa seçim sınırı aşmadan uzar; tek uzun sahne Shorts sınırına kadar", () => {
    expect(shortRange(ids, starts, 90 * S, { from: "s1", to: "s4" }).scenes).toEqual(["s1", "s2", "s3"]);
    // s4 tek başına 30 sn: kısa değil. s3 10 sn: s4 ile 40 sn olur.
    expect(shortRange(ids, starts, 90 * S, { from: "s3", to: "s3" })).toEqual({ scenes: ["s3", "s4"], fromMs: 50 * S, toMs: 90 * S });
    // Uzatmak sınırı aşacaksa kısa kalır.
    expect(shortRange(ids, { s1: 0, s2: 5 * S, s3: 70 * S, s4: 80 * S }, 90 * S, { from: "s1", to: "s1" }).scenes).toEqual(["s1"]);
    // Son sahne kısa ama sonrası yok.
    expect(shortRange(ids, starts, 65 * S, { from: "s4", to: "s4" }).scenes).toEqual(["s4"]);
    expect(shortRange(["s1"], { s1: 0 }, 400 * S)).toEqual({ scenes: ["s1"], fromMs: 0, toMs: SHORT.limitSec * S });
    // Anlatımı olmayan sahne atlanır.
    expect(shortRange(["s0", "s1"], { s1: 0 }, 10 * S).scenes).toEqual(["s1"]);
  });
});

describe("Short timeline'ı", () => {
  const tl = Timeline.parse({
    episodeId: "e",
    lang: "tr",
    fps: 10,
    durationInFrames: 100,
    visuals: [
      { shotId: "a", assetUrl: "a.png", kind: "still_motion", fromFrame: 0, durationInFrames: 40 },
      { shotId: "b", assetUrl: "b.png", kind: "still_motion", fromFrame: 40, durationInFrames: 40, enter: true },
      { shotId: "c", assetUrl: "c.png", kind: "still_motion", fromFrame: 80, durationInFrames: 20 },
    ],
    audio: [
      { role: "voice", assetUrl: "v1", fromFrame: 0, durationInFrames: 30 },
      { role: "voice", assetUrl: "v2", fromFrame: 40, durationInFrames: 30 },
      { role: "music", assetUrl: "m", fromFrame: 0, durationInFrames: 100 },
      { role: "sfx", assetUrl: "s", fromFrame: 0, durationInFrames: 100 },
    ],
    captions: [
      { text: "önce", startMs: 1000, endMs: 1500 },
      { text: "içinde", startMs: 4000, endMs: 4500 },
      { text: "taşan", startMs: 7900, endMs: 8300 },
      { text: "sonra", startMs: 8500, endMs: 9000 },
    ],
    vectorAssets: {},
  });

  it("aralıktaki çekim, anlatım ve kelimeler başa kayar; tuval dikey, müzik/efekt atılır", () => {
    const s = shortTimeline(tl, 3500, 8000);
    expect([s.width, s.height, s.durationInFrames, s.fps, s.episodeId]).toEqual([1080, 1920, 45, 10, "e"]);
    // Aralıktan önce başlayan çekim başa kırpılır, aralığı aşan sona.
    expect(s.visuals.map((v) => [v.shotId, v.fromFrame, v.durationInFrames])).toEqual([
      ["a", 0, 5],
      ["b", 5, 40],
    ]);
    expect(s.audio.map((a) => [a.assetUrl, a.fromFrame, a.durationInFrames])).toEqual([["v2", 5, 30]]);
    // Short dolu açılır: ilk çekimi kurulmaz, sonrakiler kurulur.
    expect(shortTimeline(tl, 4000, 9000).visuals.map((v) => v.enter)).toEqual([undefined, undefined]);
    expect(s.visuals.map((v) => v.enter)).toEqual([undefined, true]);
    expect(s.captions).toEqual([
      { text: "içinde", startMs: 500, endMs: 1000 },
      { text: "taşan", startMs: 4400, endMs: 4500 },
    ]);
    expect(s.speech).toEqual([]);
    // Aralık boşsa en az bir kare.
    expect(shortTimeline(tl, 5000, 5000).durationInFrames).toBe(1);
  });
});

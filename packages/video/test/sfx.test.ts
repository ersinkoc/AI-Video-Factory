import { Timeline } from "@ys/core";
import { describe, expect, it } from "vitest";
import { KINETIC, kineticLength } from "../src/kinetic-timing.ts";
import { mixSfx, SFX_RATE, sfxEvents, synth, wavFile, type SfxEvent } from "../src/sfx.ts";

const tl = (visuals: object[]) => Timeline.parse({ episodeId: "e", lang: "tr", durationInFrames: 300, visuals, audio: [] });
const vec = (vector: object, extra: object = {}) => ({ shotId: "v", assetUrl: "", kind: "motion_graphic", fromFrame: 100, durationInFrames: 100, vector, ...extra });
const text = (t: string, anims: object[]) => ({ text: t, x: 960, y: 300, anims });

describe("efekt sesi olayları", () => {
  it("katman animasyonları: pop pıt, slide_in/spin vınlama, draw_on çizim süresince kalem; diğerleri sessiz", () => {
    const ev = sfxEvents(
      tl([
        vec({
          layers: [
            { asset: "a", x: 1, anims: [{ type: "pop", start: 0.1, end: 0.2 }, { type: "slide_in", start: 0.3, end: 0.4 }, { type: "spin", start: 0.5, end: 0.6 }, { type: "fade_in" }] },
            { asset: "b", x: 1, anims: [{ type: "draw_on", start: 0, end: 0.5 }] },
            { asset: "c", x: 1, anims: [{ type: "draw_on", start: 0.9, end: 0.9 }] },
          ],
        }),
        { shotId: "k", assetUrl: "k.png", kind: "still_motion", fromFrame: 0, durationInFrames: 100 },
      ]),
    );
    expect(ev).toEqual([
      { frame: 100, sound: "scratch", frames: 40 },
      { frame: 110, sound: "pop" },
      { frame: 130, sound: "whoosh" },
      { frame: 150, sound: "whoosh" },
      { frame: 190, sound: "scratch", frames: 1 },
    ]);
  });

  it("kinetik yazı: plaka vınlar, her kelime oturduğu anda perdesi artan tık", () => {
    const ev = sfxEvents(tl([vec({ texts: [text("Altair 8800 doğdu", [{ type: "kinetic", start: 0, end: 1 }])] })]));
    expect(ev[0]).toEqual({ frame: 100, sound: "whoosh", pitch: 1.4 });
    const ticks = ev.filter((e) => e.sound === "tick");
    expect(ticks.map((e) => e.pitch)).toEqual([1, 1.04, 1.08]);
    const total = kineticLength(3);
    expect(ticks[0]!.frame).toBe(Math.round(100 + ((KINETIC.words + KINETIC.word * 0.55) / total) * 100));
    expect(ticks[2]!.frame - ticks[1]!.frame).toBe(Math.round(100 + ((KINETIC.words + 2 * KINETIC.stagger + KINETIC.word * 0.55) / total) * 100) - ticks[1]!.frame);
    expect(kineticLength(0)).toBe(KINETIC.words + KINETIC.word);
  });

  it("daktilo: her harf bir tuş, boşluk sessiz, en az 2 kare arayla", () => {
    const slow = sfxEvents(tl([vec({ texts: [text("ab c", [{ type: "typewriter", start: 0, end: 0.4 }])] })]));
    expect(slow.map((e) => [e.frame, e.sound])).toEqual([
      [105, "type"],
      [115, "type"],
      [135, "type"],
    ]);
    const fast = sfxEvents(tl([vec({ texts: [text("abcdefghij", [{ type: "typewriter", start: 0, end: 0.1 }])] })]));
    const gaps = fast.slice(1).map((e, i) => e.frame - fast[i]!.frame);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(2);
    expect(fast.length).toBeLessThan(10);
  });

  it("sayaç: tıklar yavaşlayan sayıyla seyrelir, perde yükselir, bitişte zil; Manim tahtası açılırken vınlama", () => {
    const ev = sfxEvents(tl([vec({ texts: [text("1975", [{ type: "count_up", start: 0, end: 0.6 }])] }, { overlay: "m.webm" })]));
    expect(ev[0]).toEqual({ frame: 101, sound: "whoosh", pitch: 0.8 });
    const ticks = ev.filter((e) => e.sound === "tick");
    const gaps = ticks.slice(1).map((e, i) => e.frame - ticks[i]!.frame);
    expect(gaps.at(-1)!).toBeGreaterThan(gaps[0]!);
    expect(ticks.at(-1)!.pitch!).toBeGreaterThan(ticks[0]!.pitch!);
    expect(ev.at(-1)).toEqual({ frame: 160, sound: "ding" });
  });
});

describe("efekt sesi sentezi", () => {
  it("her ses kısa, sınırlı ve tohumla aynı; kalem verilen süre kadar", () => {
    const sounds: SfxEvent[] = [{ frame: 0, sound: "pop" }, { frame: 0, sound: "tick" }, { frame: 0, sound: "type" }, { frame: 0, sound: "ding" }, { frame: 0, sound: "whoosh", pitch: 2 }, { frame: 0, sound: "scratch", frames: 15 }, { frame: 0, sound: "scratch" }];
    for (const e of sounds) {
      const s = synth(e, 30, 7);
      expect(s.length).toBeGreaterThan(0);
      expect(Math.max(...s.map(Math.abs))).toBeLessThanOrEqual(1);
      expect(Math.max(...s.map(Math.abs))).toBeGreaterThan(0.01);
      expect(synth(e, 30, 7)).toEqual(s);
    }
    expect(synth({ frame: 0, sound: "scratch", frames: 15 }, 30, 1).length).toBe(SFX_RATE / 2);
    expect(synth({ frame: 0, sound: "whoosh", pitch: 2 }, 30, 1).length).toBe(Math.round(0.18 * SFX_RATE));
    expect(synth({ frame: 0, sound: "tick" }, 30, 1)).not.toEqual(synth({ frame: 0, sound: "tick" }, 30, 2));
  });

  it("karışım bölüm uzunluğunda, olay kendi karesinde başlar, taşma yumuşakça kesilir, sondan taşan ses kırpılır", () => {
    const mix = mixSfx([{ frame: 15, sound: "pop" }, ...Array.from({ length: 12 }, () => ({ frame: 30, sound: "ding" as const })), { frame: 59, sound: "ding" }], 60, 30);
    expect(mix.length).toBe(2 * SFX_RATE);
    expect(Math.max(...mix.slice(0, SFX_RATE / 2).map(Math.abs))).toBe(0);
    expect(Math.abs(mix[SFX_RATE / 2 + 100]!)).toBeGreaterThan(0);
    expect(Math.max(...mix.map(Math.abs))).toBeLessThanOrEqual(Math.round(0.9 * 32767));
  });

  it("16 bit mono WAV başlığı", () => {
    const w = wavFile(new Int16Array([0, 1000, -1000]));
    const v = new DataView(w.buffer);
    expect(new TextDecoder().decode(w.slice(0, 4))).toBe("RIFF");
    expect(new TextDecoder().decode(w.slice(8, 16))).toBe("WAVEfmt ");
    expect([v.getUint16(22, true), v.getUint32(24, true), v.getUint16(34, true), v.getUint32(40, true)]).toEqual([1, SFX_RATE, 16, 6]);
    expect(v.getInt16(46, true)).toBe(1000);
    expect(w.length).toBe(50);
  });
});

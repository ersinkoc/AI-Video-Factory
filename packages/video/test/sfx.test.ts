import { Timeline } from "@ys/core";
import { describe, expect, it } from "vitest";
import { GESTURE_RHYTHM } from "../src/gesture-timing.ts";
import { KINETIC, kineticLength, revealWindow, TEXT_PACE } from "../src/kinetic-timing.ts";
import { CROWD, chantTimes, crowdVoices, stepTimes } from "../src/crowd-timing.ts";
import { CROWD_SOUND, mixSfx, SFX_RATE, sfxEvents, synth, wavFile, type SfxEvent } from "../src/sfx.ts";

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
    // Yazı doğal hızında oynar: pencere bütün çekim (3,3 sn) olsa da çizelge 1,25 kat yavaşta (~0,9 sn) biter.
    const span = (total * TEXT_PACE.kinetic) / (100 / 30);
    expect(ticks[0]!.frame).toBe(Math.round(100 + ((KINETIC.words + KINETIC.word * 0.55) / total) * span * 100));
    expect(ticks[2]!.frame - ticks[1]!.frame).toBe(Math.round(100 + ((KINETIC.words + 2 * KINETIC.stagger + KINETIC.word * 0.55) / total) * span * 100) - ticks[1]!.frame);
    expect(kineticLength(0)).toBe(KINETIC.words + KINETIC.word);
  });

  it("daktilo: her harf bir tuş, boşluk sessiz, en az 2 kare arayla", () => {
    const slow = sfxEvents(tl([vec({ texts: [text("ab c", [{ type: "typewriter", start: 0, end: 0.4 }])] })]));
    // Saniyede 16 harf: 4 karakter 0,25 sn'de (7,5 kare) yazılır, pencere daha uzun olsa da.
    expect(slow.map((e) => [e.frame, e.sound])).toEqual([
      [101, "type"],
      [103, "type"],
      [107, "type"],
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

describe("yazı animasyonunun gerçek penceresi", () => {
  it("kinetik, daktilo ve sayaç doğal hızında biter; kısa pencereye sığar; diğer animasyonların penceresi aynı", () => {
    const words = { type: "kinetic", start: 0.1, end: 0.9 } as const;
    expect(revealWindow(words, "Altair 8800 doğdu", 10).end).toBeCloseTo(0.1 + (kineticLength(3) * TEXT_PACE.kinetic) / 10, 9);
    expect(revealWindow({ type: "typewriter", start: 0, end: 1 }, "abcdefgh", 10).end).toBeCloseTo(0.05, 9);
    expect(revealWindow({ type: "count_up", start: 0.5, end: 1 }, "1975", 10).end).toBeCloseTo(0.72, 9);
    const short = { type: "typewriter", start: 0, end: 0.01 } as const;
    expect(revealWindow(short, "abcdefgh", 10)).toBe(short);
    const fade = { type: "fade_in", start: 0, end: 1 } as const;
    expect(revealWindow(fade, "x", 10)).toBe(fade);
  });
});

describe("iş jestlerinin sesi", () => {
  // Çekim 100 kare (30 fps, 3,33 sn), bölümün 100. karesinden başlar; jestin ilk ve son %8'i sessiz.
  const gesture = (type: string, start = 0, end = 1) => sfxEvents(tl([vec({ layers: [{ asset: "hero", x: 1, anims: [{ type, start, end }] }] })]));
  const dur = 100 / 30;

  it("alkış: eller birleştiği her anda, perdesi üçlü döngüde oynayan şaplak", () => {
    const ev = gesture("clap");
    const { clapHz } = GESTURE_RHYTHM;
    const first = Math.ceil(0.08 * dur * clapHz);
    expect(ev[0]).toEqual({ frame: 100 + Math.round((first / clapHz) * 30), sound: "clap", pitch: 1 + (first % 3) * 0.04 });
    expect(ev.every((e) => e.sound === "clap")).toBe(true);
    expect(ev.at(-1)!.frame).toBeLessThanOrEqual(100 + Math.round(0.92 * dur * 30));
    expect(ev).toHaveLength(Math.floor(0.92 * dur * clapHz) - first + 1);
  });

  it("klavye: parmak indikçe tuş, her beşinci vuruş boş; kısa jestte sessiz", () => {
    const ev = gesture("typing");
    const { typingHz } = GESTURE_RHYTHM;
    const taps = Math.floor(0.92 * dur * typingHz * 2) - Math.ceil(0.08 * dur * typingHz * 2) + 1;
    expect(ev.length).toBeLessThan(taps);
    expect(ev.length).toBeGreaterThan(taps * 0.7);
    expect(ev.every((e) => e.sound === "type")).toBe(true);
    expect(gesture("typing", 0.5, 0.5)).toEqual([]);
  });

  it("yazı: kalem her satırda yazma süresince cızırdar; satırı bitmeyen son vuruş yok; diğer jestler sessiz", () => {
    const ev = gesture("writing");
    const { strokeSec, pauseSec } = GESTURE_RHYTHM;
    expect(ev[0]).toEqual({ frame: 100 + Math.round((strokeSec + pauseSec) * 30), sound: "scratch", frames: Math.round(strokeSec * 30) });
    expect(ev).toHaveLength(2);
    expect(gesture("arms_crossed")).toEqual([]);
  });
});

describe("efekt sesi sentezi", () => {
  it("her ses kısa, sınırlı ve tohumla aynı; kalem verilen süre kadar", () => {
    const sounds: SfxEvent[] = [{ frame: 0, sound: "pop" }, { frame: 0, sound: "tick" }, { frame: 0, sound: "type" }, { frame: 0, sound: "ding" }, { frame: 0, sound: "whoosh", pitch: 2 }, { frame: 0, sound: "scratch", frames: 15 }, { frame: 0, sound: "scratch" }, { frame: 0, sound: "clap" }];
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

  it("figüranlar: alkışlayan, sevinen ve ayaktaki kalabalık çekim boyunca; protesto sloganı ve yürüyüş adımı ortak vuruşta; dinleyen sessiz", () => {
    const crowd = (c: object) => sfxEvents(tl([vec({ crowd: c })]));
    expect(crowd({ action: "applaud" })).toEqual([{ frame: 100, sound: "applause", frames: 100, voices: 34 }]);
    expect(crowd({ action: "cheer", size: "group" })).toEqual([{ frame: 100, sound: "cheer", frames: 100, voices: 11 }]);
    expect(crowd({})).toEqual([{ frame: 100, sound: "murmur", frames: 100, voices: 34 }]);
    expect(crowd({ action: "listen" })).toEqual([]);
    expect(crowd({ action: "protest" }).map((e) => [e.frame, e.sound])).toEqual(chantTimes(100 / 30).map((t) => [100 + Math.round(t * 30), "chant"]));
    expect(crowd({ action: "protest" })).toHaveLength(5);
    expect(crowd({ action: "advance" }).map((e) => e.sound)).toEqual(Array(7).fill("march"));
    expect(crowdVoices("group")).toBe(CROWD.perRow.group * 2 + 1);
    expect(stepTimes(1)).toEqual([0.25, 0.75]);
  });

  it("kalabalık sesleri: yatak sesi çekim boyu, açılıp söner; büyük kalabalık daha gür; slogan ve adım kısa; tohumla aynı", () => {
    const rms = (s: Float32Array, from = 0, to = s.length) => {
      let sum = 0;
      for (let i = from; i < to; i++) sum += s[i]! ** 2;
      return Math.sqrt(sum / (to - from));
    };
    for (const sound of ["applause", "cheer", "murmur"] as const) {
      const big = synth({ frame: 0, sound, frames: 60, voices: 34 }, 30, 5);
      expect(big.length).toBe(2 * SFX_RATE);
      expect(synth({ frame: 0, sound, frames: 60, voices: 34 }, 30, 5)).toEqual(big);
      const mid = rms(big, SFX_RATE / 2, SFX_RATE);
      expect(mid).toBeGreaterThan(0.001);
      // İlk 20 ms ve son 20 ms neredeyse sessiz (zarf).
      expect(rms(big, 0, SFX_RATE / 50)).toBeLessThan(mid / 4);
      expect(rms(big, big.length - SFX_RATE / 50)).toBeLessThan(mid / 4);
      expect(rms(synth({ frame: 0, sound, frames: 60, voices: 11 }, 30, 5), SFX_RATE / 2, SFX_RATE)).toBeLessThan(mid);
      // Kişi sayısı verilmezse tek kişi; süre verilmezse tek kare.
      expect(synth({ frame: 0, sound, frames: 30 }, 30, 5).length).toBe(SFX_RATE);
      expect(synth({ frame: 0, sound, voices: 34 }, 30, 5).length).toBe(SFX_RATE / 30);
    }
    // Uğultu alkıştan çok sessiz.
    expect(rms(synth({ frame: 0, sound: "murmur", frames: 60, voices: 34 }, 30, 5))).toBeLessThan(rms(synth({ frame: 0, sound: "applause", frames: 60, voices: 34 }, 30, 5)) / 3);
    expect(synth({ frame: 0, sound: "chant", voices: 34 }, 30, 5).length).toBe(Math.round(0.32 * SFX_RATE));
    expect(synth({ frame: 0, sound: "march", voices: 34 }, 30, 5).length).toBe(Math.round(0.18 * SFX_RATE));
    for (const sound of ["chant", "march"] as const) {
      expect(rms(synth({ frame: 0, sound, voices: 34 }, 30, 5))).toBeGreaterThan(rms(synth({ frame: 0, sound, voices: 2 }, 30, 5)));
      expect(rms(synth({ frame: 0, sound }, 30, 5))).toBeGreaterThan(0);
    }
    expect(CROWD_SOUND.formants).toHaveLength(4);
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

describe("konuşma balonu sesi", () => {
  it("balon açılırken tiz bir pop; boş söz, nesneye verilen söz ve atılan boş balon nesnesi sessiz", () => {
    const meta = { check: { kind: "prop", name: "bub", guess: "an empty speech bubble", recognizable: 8, passed: true } };
    const vectorAssets = {
      hero: { id: "hero", kind: "character", svg: "<svg/>", width: 400, height: 800 },
      pal: { id: "pal", kind: "character", svg: "<svg/>", width: 400, height: 800 },
      box: { id: "box", kind: "prop", svg: "<svg/>", width: 100, height: 100 },
      bub: { id: "bub", kind: "prop", svg: "<svg/>", width: 100, height: 80, meta },
    };
    const layers = [
      { asset: "hero", x: 1, say: { text: "Merhaba", start: 0.2 } },
      { asset: "pal", x: 2, say: { text: "  " } },
      { asset: "box", x: 3, say: { text: "kutu" } },
      { asset: "bub", x: 4, anims: [{ type: "pop", start: 0.5, end: 0.6 }] },
    ];
    const ev = sfxEvents(Timeline.parse({ episodeId: "e", lang: "tr", durationInFrames: 300, visuals: [vec({ layers })], audio: [], vectorAssets }));
    expect(ev).toEqual([{ frame: 120, sound: "pop", pitch: 1.3 }]);
  });
});

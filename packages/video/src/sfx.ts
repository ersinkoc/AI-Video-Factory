import type { Timeline, VectorAnim } from "@ys/core";
import { KINETIC, kineticLength } from "./kinetic-timing.ts";

/**
 * Kareye kilitli efekt sesleri: olaylar timeline'daki animasyonlardan çıkarılır (render'ın kullandığı zamanlamalarla),
 * sesler koddan sentezlenir (tohumlu gürültü, sinüs; API ve dosya yok) ve tek bir iz olarak karışır. Görüntüden
 * kaymaz: aynı timeline her zaman aynı sesi verir.
 */

export type Sound = "pop" | "tick" | "type" | "ding" | "whoosh" | "scratch";

export interface SfxEvent {
  /** Bölüm başından kare. */
  frame: number;
  sound: Sound;
  /** Süreli sesin (kalem) uzunluğu, kare. */
  frames?: number;
  /** Perde çarpanı (1 = olağan). */
  pitch?: number;
}

const local = (p: number, a: VectorAnim) => Math.min(1, Math.max(0, (p - a.start) / Math.max(0.0001, a.end - a.start)));
const easeOut = (k: number) => 1 - (1 - k) ** 3;

/** Timeline'daki vektör çekimlerinin animasyonlarından ses olayları (kare sırasıyla). */
export function sfxEvents(timeline: Timeline): SfxEvent[] {
  const out: SfxEvent[] = [];
  for (const v of timeline.visuals) {
    if (!v.vector) continue;
    const at = (p: number) => Math.round(v.fromFrame + p * v.durationInFrames);
    const span = (a: VectorAnim) => a.end - a.start;
    for (const layer of v.vector.layers) {
      for (const a of layer.anims) {
        if (a.type === "pop") out.push({ frame: at(a.start), sound: "pop" });
        if (a.type === "slide_in" || a.type === "spin") out.push({ frame: at(a.start), sound: "whoosh" });
        // Kalem konturları çizdiği sürece (draw_on ilerlemesinin %80'i) cızırdar.
        if (a.type === "draw_on") out.push({ frame: at(a.start), sound: "scratch", frames: Math.max(1, at(a.start + span(a) * 0.8) - at(a.start)) });
      }
    }
    for (const text of v.vector.texts) {
      for (const a of text.anims) {
        if (a.type === "kinetic") {
          const words = text.text.split(/\s+/).filter(Boolean).length;
          const total = kineticLength(words);
          out.push({ frame: at(a.start), sound: "whoosh", pitch: 1.4 });
          // Kelime yaylanarak oturduğu anda (tweenin ~%55'i) hafif tık; sırayla perdesi yükselir.
          for (let i = 0; i < words; i++) {
            const t = (KINETIC.words + KINETIC.stagger * i + KINETIC.word * 0.55) / total;
            out.push({ frame: at(a.start + span(a) * t), sound: "tick", pitch: 1 + i * 0.04 });
          }
        }
        if (a.type === "typewriter") {
          // Her yeni harf bir tuş; çok sık yazımda en az 2 kare arayla.
          const n = text.text.length;
          let last = -Infinity;
          for (let k = 1; k <= n; k++) {
            const f = at(a.start + span(a) * ((k - 0.5) / n));
            if (f - last < 2 || /\s/.test(text.text[k - 1]!)) continue;
            out.push({ frame: f, sound: "type", pitch: 0.9 + ((k * 7) % 5) * 0.05 });
            last = f;
          }
        }
        if (a.type === "count_up") {
          // Sayaç yavaşladıkça tıklar seyrelir (ekrandaki sayı ease-out ile yürür); bitişte zil.
          let shown = 0;
          const first = at(a.start);
          const last = at(a.end);
          for (let f = first; f < last; f++) {
            const k = easeOut(local((f - v.fromFrame) / v.durationInFrames, a));
            if (k - shown < 1 / 14) continue;
            out.push({ frame: f, sound: "tick", pitch: 0.8 + k * 0.6 });
            shown = k;
          }
          out.push({ frame: last, sound: "ding" });
        }
      }
    }
    // Manim tahtası açılırken.
    if (v.overlay) out.push({ frame: v.fromFrame + 1, sound: "whoosh", pitch: 0.8 });
  }
  return out.sort((a, b) => a.frame - b.frame);
}

/** Ses iz örnekleme hızı: efektler için yeterli, dosya küçük. */
export const SFX_RATE = 24000;

/** Tohumlu gürültü (mulberry32): aynı olay her zaman aynı ses. */
function noise(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** Tek bir sesin örnekleri (−1..1). */
export function synth(e: SfxEvent, fps: number, seed: number): Float32Array {
  const pitch = e.pitch ?? 1;
  const rnd = noise(seed);
  const make = (sec: number, fn: (t: number, i: number) => number) => {
    const out = new Float32Array(Math.round(sec * SFX_RATE));
    for (let i = 0; i < out.length; i++) out[i] = fn(i / SFX_RATE, i);
    return out;
  };
  switch (e.sound) {
    case "pop": {
      // Perdesi düşen kısa sinüs: kabarcık patlaması.
      let phase = 0;
      return make(0.09, (t) => {
        phase += (2 * Math.PI * 520 * pitch * (1 - 0.5 * (t / 0.09))) / SFX_RATE;
        return Math.sin(phase) * Math.exp(-t * 45) * 0.55;
      });
    }
    case "tick":
    case "type": {
      const f = (e.sound === "tick" ? 2400 : 1700) * pitch;
      const g = e.sound === "tick" ? 0.32 : 0.2;
      return make(0.03, (t) => (Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 220) + rnd() * 0.4 * Math.exp(-t * 500)) * g);
    }
    case "ding":
      return make(0.7, (t) => (Math.sin(2 * Math.PI * 1318.5 * t) + 0.45 * Math.sin(2 * Math.PI * 1977.8 * t)) * Math.exp(-t * 6) * 0.25);
    case "whoosh": {
      // Kesim frekansı yükselip inen süzgeçli gürültü, çan biçimli zarf.
      const dur = 0.36 / pitch;
      let y = 0;
      return make(dur, (t) => {
        const u = t / dur;
        const fc = (400 + 2600 * Math.sin(Math.PI * u)) * pitch;
        y += (1 - Math.exp((-2 * Math.PI * fc) / SFX_RATE)) * (rnd() - y);
        return y * Math.sin(Math.PI * u) ** 2 * 0.5;
      });
    }
    case "scratch": {
      // Kalem: yüksek geçiren gürültü, düzensiz vuruşlarla genlik oynar; başı ve sonu yumuşak.
      const dur = (e.frames ?? 1) / fps;
      let low = 0;
      return make(dur, (t) => {
        const x = rnd();
        low += 0.08 * (x - low);
        const stroke = 0.55 + 0.45 * Math.sin(2 * Math.PI * 6.5 * t + Math.sin(2 * Math.PI * 1.3 * t) * 2);
        const edge = Math.min(1, t / 0.03, (dur - t) / 0.03);
        return (x - low) * stroke * Math.max(0, edge) * 0.13;
      });
    }
  }
}

/** Olayları bölüm uzunluğunda tek ize karıştırır; yumuşak sınırlayıcı taşmayı keser. */
export function mixSfx(events: SfxEvent[], totalFrames: number, fps: number): Int16Array {
  const mix = new Float32Array(Math.ceil((totalFrames / fps) * SFX_RATE));
  events.forEach((e, i) => {
    const s = synth(e, fps, i + 1);
    const from = Math.round((e.frame / fps) * SFX_RATE);
    for (let k = 0; k < s.length && from + k < mix.length; k++) mix[from + k]! += s[k]!;
  });
  const out = new Int16Array(mix.length);
  for (let i = 0; i < mix.length; i++) out[i] = Math.round(Math.tanh(mix[i]! * 1.2) * 0.9 * 32767);
  return out;
}

/** 16 bit mono PCM WAV. */
export function wavFile(samples: Int16Array, rate = SFX_RATE): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, s, true));
  return new Uint8Array(buf);
}

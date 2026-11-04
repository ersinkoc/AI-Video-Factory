import type { Timeline, VectorAnim, VectorCrowd } from "@ys/core";
import { chantTimes, crowdVoices, stepTimes } from "./crowd-timing.ts";
import { GESTURE_RHYTHM } from "./gesture-timing.ts";
import { KINETIC, kineticLength, revealWindow } from "./kinetic-timing.ts";

/**
 * Kareye kilitli efekt sesleri: olaylar timeline'daki animasyonlardan çıkarılır (render'ın kullandığı zamanlamalarla),
 * sesler koddan sentezlenir (tohumlu gürültü, sinüs; API ve dosya yok) ve tek bir iz olarak karışır. Görüntüden
 * kaymaz: aynı timeline her zaman aynı sesi verir.
 */

export type Sound = "pop" | "tick" | "type" | "ding" | "whoosh" | "scratch" | "clap" | "applause" | "cheer" | "murmur" | "chant" | "march";

export interface SfxEvent {
  /** Bölüm başından kare. */
  frame: number;
  sound: Sound;
  /** Süreli sesin (kalem) uzunluğu, kare. */
  frames?: number;
  /** Perde çarpanı (1 = olağan). */
  pitch?: number;
  /** Kalabalık sesinde kişi sayısı (crowdVoices): gürlük ve doku. */
  voices?: number;
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
        out.push(...gestureSounds(a, v.fromFrame, v.durationInFrames, timeline.fps));
      }
    }
    for (const text of v.vector.texts) {
      // Yazı animasyonları render'daki gibi doğal hızında oynar (revealWindow): sesler de o pencerede.
      for (const a of text.anims.map((x) => revealWindow(x, text.text, v.durationInFrames / timeline.fps))) {
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
    if (v.vector.crowd) out.push(...crowdSounds(v.vector.crowd, v.fromFrame, v.durationInFrames, timeline.fps));
  }
  return out.sort((a, b) => a.frame - b.frame);
}

/**
 * İş jestlerinin sesi, pozla aynı saatte (gesture-timing.ts): alkışta eller birleşince, klavyede parmak inince (her
 * beşinci vuruş atlanır, tekdüze olmasın), yazarken kalem her satırda. Jestin girişi ve çıkışı (ilk/son %8) sessiz.
 */
function gestureSounds(a: VectorAnim, from: number, frames: number, fps: number): SfxEvent[] {
  if ((a.type !== "clap" && a.type !== "typing" && a.type !== "writing") || a.end <= a.start) return [];
  const dur = frames / fps;
  const t0 = (a.start + (a.end - a.start) * 0.08) * dur;
  const t1 = (a.end - (a.end - a.start) * 0.08) * dur;
  const frame = (t: number) => from + Math.round(t * fps);
  const out: SfxEvent[] = [];
  const { clapHz, typingHz, strokeSec, pauseSec } = GESTURE_RHYTHM;
  if (a.type === "clap") for (let n = Math.ceil(t0 * clapHz); n / clapHz <= t1; n++) out.push({ frame: frame(n / clapHz), sound: "clap", pitch: 1 + (n % 3) * 0.04 });
  if (a.type === "typing") {
    for (let n = Math.ceil(t0 * typingHz * 2); n / (typingHz * 2) <= t1; n++) if (n % 5 !== 3) out.push({ frame: frame(n / (typingHz * 2) + 1 / (typingHz * 4)), sound: "type", pitch: 0.85 + (n % 4) * 0.06 });
  }
  if (a.type === "writing") {
    const cycle = strokeSec + pauseSec;
    for (let n = Math.ceil(t0 / cycle); n * cycle + strokeSec <= t1; n++) out.push({ frame: frame(n * cycle), sound: "scratch", frames: Math.round(strokeSec * fps) });
  }
  return out;
}

/**
 * Figüranların sesi (crowd.tsx; 4 Kas): alkışlayan seyirci alkışlar, sevinen kalabalık tezahürat yapar, ayaktaki
 * kalabalık uğuldar, protestocular yumrukları kalktığında hep birlikte slogan atar, ordu adımını hep birlikte atar
 * (crowd-timing.ts, görüntüyle aynı vuruş). Dinleyen seyirci sessizdir.
 */
function crowdSounds(c: VectorCrowd, from: number, frames: number, fps: number): SfxEvent[] {
  const voices = crowdVoices(c.size);
  const at = (t: number) => from + Math.round(t * fps);
  switch (c.action) {
    case "applaud":
      return [{ frame: from, sound: "applause", frames, voices }];
    case "cheer":
      return [{ frame: from, sound: "cheer", frames, voices }];
    case "stand":
      return [{ frame: from, sound: "murmur", frames, voices }];
    case "protest":
      return chantTimes(frames / fps).map((t) => ({ frame: at(t), sound: "chant" as const, voices }));
    case "advance":
      return stepTimes(frames / fps).map((t) => ({ frame: at(t), sound: "march" as const, voices }));
    default:
      return [];
  }
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

/** İki kutuplu bant geçiren süzgeç (RBJ biquad): f merkez, q seçicilik. */
function bandpass(f: number, q: number): (x: number) => number {
  const w = (2 * Math.PI * f) / SFX_RATE;
  const alpha = Math.sin(w) / (2 * q);
  const a0 = 1 + alpha;
  const a1 = -2 * Math.cos(w);
  const a2 = 1 - alpha;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x) => {
    const y = (alpha * x - alpha * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

/**
 * Kalabalık sesinin ayarları. Sentezlenen en çok ses (voices fazlası yalnız gürlüğü artırır); kalabalığın gürlüğü kişi
 * sayısının kökü (34 kişilik kalabalıkta 1). Ünlü formantları (a, e, o, æ; Hz): tezahürat ve uğultu insan sesi gibi
 * okunsun. Yatak sesleri (alkış, tezahürat, uğultu) fade sn'de açılır, release sn'de söner. Gürlük anlatımın altında:
 * alkış ve tezahürat ~−22 dBFS RMS (anlatım ~−16,5), uğultu ~−34.
 */
export const CROWD_SOUND = {
  voices: 10,
  full: 34,
  formants: [
    [730, 1090],
    [530, 1840],
    [570, 840],
    [660, 1700],
  ],
  fade: 0.35,
  release: 0.6,
} as const;
const crowdGain = (voices: number) => Math.sqrt(voices / CROWD_SOUND.full);

/** Yatak sesinin zarfı: başta açılır, sonda söner. */
const bedEnvelope = (t: number, dur: number) => Math.max(0, Math.min(1, t / CROWD_SOUND.fade, (dur - t) / CROWD_SOUND.release));

/**
 * Bir insan sesi: titreşimli testere dalga (gırtlak) + nefes gürültüsü, iki formant süzgecinden; amp(t) ses zarfı.
 * f0: temel frekans (Hz); vowel: formant çifti.
 */
function voice(out: Float32Array, rnd: () => number, f0: number, vowel: readonly [number, number], gain: number, amp: (t: number) => number, from = 0): void {
  const f1 = bandpass(vowel[0], 5);
  const f2 = bandpass(vowel[1], 8);
  const vib = 4.5 + rnd() * 1.5;
  let phase = 0;
  for (let i = from; i < out.length; i++) {
    const t = (i - from) / SFX_RATE;
    const a = amp(t);
    phase = (phase + (f0 * (1 + 0.03 * Math.sin(2 * Math.PI * vib * t))) / SFX_RATE) % 1;
    const src = (2 * phase - 1) * 0.6 + rnd() * 0.8;
    const y = f1(src) + 0.7 * f2(src);
    out[i]! += y * a * gain;
  }
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
    case "clap": {
      // El çırpma: 1–2,5 kHz bandında gürültü; avuçlar 6 ms arayla iki kez çarpar, ardından kısa oda kuyruğu.
      let slow = 0;
      let band = 0;
      return make(0.14, (t) => {
        const x = rnd();
        slow += 0.06 * (x - slow);
        band += 0.45 * (x - slow - band);
        const hit = Math.exp(-t * 70) + (t > 0.006 ? 0.7 * Math.exp(-(t - 0.006) * 70) : 0);
        return band * (hit + 0.12 * Math.exp(-t * 14)) * 0.5 * pitch;
      });
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
    case "applause": {
      // Alkış: her kişi kendi hızında (3,5 Hz ± %20) ve evresinde çırpar, her çırpış kendi avucunun tınısında (bant
      // 0,9–2,3 kHz) kısa bir gürültü patlaması; arada hafif düzensizlik. Çok kişi birleşince alkış yatağı olur.
      const dur = (e.frames ?? 1) / fps;
      const out = new Float32Array(Math.round(dur * SFX_RATE));
      const u = () => (rnd() + 1) / 2;
      const burst = Math.round(0.04 * SFX_RATE);
      for (let v = 0; v < (e.voices ?? 1); v++) {
        const rate = 3.5 * (0.8 + 0.4 * u());
        const amp = 0.6 + 0.4 * u();
        const fc = 900 + 1400 * u();
        for (let t = u() / rate; t < dur; t += (1 + (u() - 0.5) * 0.15) / rate) {
          const bp = bandpass(fc, 1.2);
          const at = Math.round(t * SFX_RATE);
          for (let k = 0; k < burst && at + k < out.length; k++) out[at + k]! += bp(rnd()) * amp * Math.exp(-(k / SFX_RATE) * 80) * 0.52 * bedEnvelope(t, dur);
        }
      }
      return out;
    }
    case "cheer":
    case "murmur": {
      // Tezahürat: her ses bir ünlüyü ("aaa", "eee") uzatır, ara ara vurgulanır ve dalgalanır; uğultu: alçak sesle
      // konuşma, hece hece (4–6 Hz) açılıp kapanır, aralarda susar.
      const cheer = e.sound === "cheer";
      const dur = (e.frames ?? 1) / fps;
      const out = new Float32Array(Math.round(dur * SFX_RATE));
      const u = () => (rnd() + 1) / 2;
      const n = Math.min(e.voices ?? 1, CROWD_SOUND.voices);
      const gain = ((cheer ? 0.96 : 0.5) * crowdGain(e.voices ?? 1)) / Math.sqrt(n);
      for (let v = 0; v < n; v++) {
        const f0 = cheer ? 170 + 170 * u() : 110 + 110 * u();
        const vowel = CROWD_SOUND.formants[Math.floor(u() * CROWD_SOUND.formants.length)]!;
        const onset = u() * (cheer ? 0.4 : 1);
        const wobble = 1.2 + u() * 1.5;
        const syllable = 4 + u() * 2;
        const ph = u() * Math.PI * 2;
        voice(out, rnd, f0, vowel, gain, (t) => {
          const on = t < onset ? 0 : Math.min(1, (t - onset) / 0.25);
          const shape = cheer ? 0.65 + 0.35 * Math.sin(2 * Math.PI * wobble * t + ph) : Math.max(0, Math.sin(2 * Math.PI * syllable * t + ph)) * (Math.sin(2 * Math.PI * 0.4 * t + ph) > -0.3 ? 1 : 0);
          return on * shape * bedEnvelope(t, dur);
        });
      }
      return out;
    }
    case "chant": {
      // Slogan: kalabalık birlikte "hey!" der: aynı ünlü (e), sesler biraz farklı perdede ve 0–25 ms kaymayla.
      const out = new Float32Array(Math.round(0.32 * SFX_RATE));
      const u = () => (rnd() + 1) / 2;
      const n = Math.min(e.voices ?? 1, CROWD_SOUND.voices);
      for (let v = 0; v < n; v++) {
        const lag = u() * 0.025;
        voice(out, rnd, 160 + 90 * u(), CROWD_SOUND.formants[1], (0.7 * crowdGain(e.voices ?? 1)) / Math.sqrt(n), (t) => Math.min(1, t / 0.02) * (t < 0.12 ? 1 : Math.exp(-(t - 0.12) * 18)), Math.round(lag * SFX_RATE));
      }
      return out;
    }
    case "march": {
      // Adım: düşen perdeli alçak gümbürtü ve ayakkabı tıkırtısı; ayaklar 0–30 ms içinde birbiri ardına basar.
      const out = new Float32Array(Math.round(0.18 * SFX_RATE));
      const u = () => (rnd() + 1) / 2;
      const n = Math.min(e.voices ?? 1, 6);
      const gain = (0.16 * crowdGain(e.voices ?? 1)) / Math.sqrt(n);
      for (let v = 0; v < n; v++) {
        const from = Math.round(u() * 0.03 * SFX_RATE);
        let phase = 0;
        let low = 0;
        for (let i = from; i < out.length; i++) {
          const t = (i - from) / SFX_RATE;
          phase += (2 * Math.PI * 70 * (1 - 0.4 * Math.min(1, t / 0.12))) / SFX_RATE;
          low += 0.2 * (rnd() - low);
          out[i]! += (Math.sin(phase) * Math.exp(-t * 28) + low * 1.5 * Math.exp(-t * 110)) * gain;
        }
      }
      return out;
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

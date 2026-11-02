import type { Timeline, VectorMood } from "@ys/core";

/**
 * Arka plan müziği: koddan sentezlenir (API ve dosya yok; aynı timeline her zaman aynı müzik). Yönetmenin çekimlere
 * verdiği renk havası (`mood`) müziğin bölümlerini belirler: aydınlık sahnede majör ve kıpır kıpır, gecede ve krizde
 * minör ve ağır. Bütün bölümler aynı anahtardadır (majör ile relatif minörü aynı notalar), geçişler çapraz kararır.
 * Anlatım sırasında müzik kısılır (ducking): kelime zamanlarından, örnek hassasiyetinde, ize işlenmiş olarak.
 */

export const MUSIC_RATE = 24000;

export const MUSIC = {
  /** Bundan kısa hava bölümü komşusuna katılır (sn): müzik her çekimde değişmesin. */
  minSectionSec: 8,
  /** Bölüm geçişindeki çapraz kararma (sn). */
  crossfadeSec: 2,
  fadeInSec: 2,
  fadeOutSec: 3,
  /** Anlatımsız yerlerde müziğin RMS düzeyi: −25 dBFS (TTS anlatımı ~−16,5 dBFS ölçüldü). */
  rms: 0.056,
  /** Anlatım sırasında kazanç (−11 dB): müzik sesin ~20 dB altında kalır. */
  duck: 0.28,
  /** Bundan kısa sessizlik kısık kalır (sn): cümle aralarında müzik inip kalkmasın. */
  bridgeSec: 0.7,
  /** Kelimeden önce inmeye başlar, sonra biraz bekler (sn). */
  preSec: 0.15,
  postSec: 0.25,
  attackSec: 0.08,
  releaseSec: 0.6,
};

interface Feel {
  minor: boolean;
  bpm: number;
  /** Akorlar: dizinin derecesi (0 = tonik). */
  chords: number[];
  /** Pad süzgecinin kesim frekansı (Hz): karanlıktan aydınlığa. */
  cutoff: number;
  /** Arpej: 0 yok, 1 dörtlük, 2 sekizlik. */
  arp: 0 | 1 | 2;
  /** Bas: vuruşta (pulse) ya da sürekli (drone). */
  bass: "pulse" | "drone";
}

/** Hava → müzik. Sahne renk havasının anlamları yönetmen talimatındaki gibi (warm: nostalji/başarı, cool: teknoloji/gerilim…). */
export const FEEL: Record<VectorMood, Feel> = {
  neutral: { minor: false, bpm: 84, chords: [0, 4, 5, 3], cutoff: 1500, arp: 1, bass: "pulse" },
  day: { minor: false, bpm: 98, chords: [0, 3, 5, 4], cutoff: 2200, arp: 2, bass: "pulse" },
  warm: { minor: false, bpm: 76, chords: [5, 3, 0, 4], cutoff: 1100, arp: 1, bass: "pulse" },
  cool: { minor: true, bpm: 90, chords: [0, 5, 2, 6], cutoff: 1700, arp: 2, bass: "pulse" },
  night: { minor: true, bpm: 64, chords: [0, 3, 5, 4], cutoff: 750, arp: 0, bass: "drone" },
  dramatic: { minor: true, bpm: 70, chords: [0, 5, 6, 0], cutoff: 950, arp: 1, bass: "drone" },
};

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
/** Majör toniği (MIDI); minör bölümler relatif minörde (3 yarım ses aşağı). Bölüm kimliğinden seçilir. */
const KEYS = [60, 62, 63, 65, 67, 57];

export interface MusicSection {
  fromFrame: number;
  frames: number;
  mood: VectorMood;
}

/** Aynı havadaki ardışık çekimler tek bölüm; kısa bölüm komşusuna katılır. Bölümler 0'dan bölüm sonuna kesintisizdir. */
export function musicSections(timeline: Timeline): MusicSection[] {
  const total = timeline.durationInFrames;
  const marks: { from: number; mood: VectorMood }[] = [];
  for (const v of [...timeline.visuals].sort((a, b) => a.fromFrame - b.fromFrame)) {
    const mood = v.vector?.mood ?? "neutral";
    if (marks.at(-1)?.mood !== mood) marks.push({ from: v.fromFrame, mood });
  }
  if (!marks.length) marks.push({ from: 0, mood: "neutral" });
  marks[0]!.from = 0;
  let out: MusicSection[] = marks.map((m, i) => ({ fromFrame: m.from, frames: (marks[i + 1]?.from ?? total) - m.from, mood: m.mood }));
  const min = MUSIC.minSectionSec * timeline.fps;
  for (;;) {
    const i = out.findIndex((s) => s.frames < min);
    if (i < 0 || out.length === 1) break;
    // İlk bölüm sonrakine, ötekiler öncekine katılır; aynı havadaki komşular birleşir.
    if (i === 0) out[1] = { ...out[1]!, fromFrame: 0, frames: out[1]!.frames + out[0]!.frames };
    else out[i - 1] = { ...out[i - 1]!, frames: out[i - 1]!.frames + out[i]!.frames };
    out.splice(i, 1);
    out = out.reduce<MusicSection[]>((acc, s) => {
      const last = acc.at(-1);
      if (last?.mood === s.mood) last.frames += s.frames;
      else acc.push({ ...s });
      return acc;
    }, []);
  }
  return out;
}

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Bant sınırlı testere dalgası tablosu (16 harmonik): örnekleme hızında katlanma yapmaz. */
const TABLE = 2048;
const SAW = (() => {
  const t = new Float32Array(TABLE);
  for (let i = 0; i < TABLE; i++) for (let k = 1; k <= 16; k++) t[i]! += Math.sin((2 * Math.PI * k * i) / TABLE) / k;
  return t;
})();

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Derecenin MIDI notası. */
function degree(feel: Feel, tonic: number, d: number): number {
  const scale = feel.minor ? MINOR : MAJOR;
  return tonic + (feel.minor ? -3 : 0) + scale[d % 7]! + 12 * Math.floor(d / 7);
}

/** Akor sesleri sıkı dizilişte, G3–F#4 aralığında: akorlar arası ses yürüyüşü kendiliğinden yumuşak. */
function voicing(feel: Feel, tonic: number, chord: number): number[] {
  return [0, 2, 4].map((k) => 55 + (((degree(feel, tonic, chord + k) - 55) % 12) + 12) % 12);
}

/** Tek bölümün sesi (pad + arpej yankılı, bas kuru), hedef RMS'e getirilmiş. */
function renderSection(feel: Feel, tonic: number, len: number): Float32Array {
  const buf = new Float32Array(len);
  const beat = Math.round((60 / feel.bpm) * MUSIC_RATE);
  // Hızlı tempoda akor iki ölçü sürer: müzik anlatımın altında acele etmesin.
  const chordLen = beat * 4 * (feel.bpm >= 85 ? 2 : 1);
  const attack = Math.round(0.8 * MUSIC_RATE);
  const release = Math.round(0.7 * MUSIC_RATE);
  const chordAt = (c: number) => feel.chords[c % feel.chords.length]!;

  // Pad: her akor sesi iki hafif akortsuz testere; yumuşak giriş, sonraki akorun içine sönerek çıkış.
  for (let c = 0; c * chordLen < len; c++) {
    const from = c * chordLen;
    const end = from + chordLen;
    for (const m of voicing(feel, tonic, chordAt(c))) {
      for (const cents of [-7, 7]) {
        const inc = (hz(m) * 2 ** (cents / 1200)) / MUSIC_RATE;
        let ph = (m * 0.137 + cents / 100 + 1) % 1;
        for (let i = from; i < Math.min(len, end + release); i++) {
          const env = Math.min(1, (i - from) / attack) * (i < end ? 1 : 1 - (i - end) / release);
          const x = ph * TABLE;
          const j = x | 0;
          buf[i]! += (SAW[j & (TABLE - 1)]! + (SAW[(j + 1) & (TABLE - 1)]! - SAW[j & (TABLE - 1)]!) * (x - j)) * env * 0.08;
          ph += inc;
          if (ph >= 1) ph -= 1;
        }
      }
    }
  }
  // İki kademeli alçak geçiren süzgeç, kesim yavaşça nefes alır (9 sn).
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < len; i++) {
    const fc = feel.cutoff * (1 + 0.2 * Math.sin((2 * Math.PI * i) / (9 * MUSIC_RATE)));
    const a = 1 - Math.exp((-2 * Math.PI * fc) / MUSIC_RATE);
    y1 += a * (buf[i]! - y1);
    y2 += a * (y1 - y2);
    buf[i] = y2;
  }

  // Arpej: akor sesleri bir oktav yukarıda, yukarı-aşağı; ölçü başı vurgulu, hızlı sönen çekme tel.
  if (feel.arp) {
    const step = feel.arp === 2 ? beat / 2 : beat;
    const decay = Math.min(1.2, (step / MUSIC_RATE) * 2.5);
    for (let n = 0, at = 0; at < len; n++, at = Math.round(n * step)) {
      const tones = voicing(feel, tonic, chordAt(Math.floor(at / chordLen))).map((m) => m + 12);
      const m = [tones[0]!, tones[1]!, tones[2]!, tones[0]! + 12, tones[2]!, tones[1]!][n % 6]!;
      const f = hz(m);
      const vel = n % (feel.arp === 2 ? 8 : 4) === 0 ? 1 : 0.7;
      for (let k = 0; k < decay * MUSIC_RATE && at + k < len; k++) {
        const t = k / MUSIC_RATE;
        const edge = Math.min(1, t / 0.005, (decay - t) / 0.02);
        buf[at + k]! += (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) * Math.exp(-t / 0.22) * edge * 0.06 * vel;
      }
    }
  }

  // Yankı (Schroeder: 4 tarak + 2 tüm geçiren): pad ve arpeje oda verir.
  const combs = [607, 647, 695, 738].map((d) => ({ d, line: new Float32Array(d), i: 0, low: 0 }));
  const alls = [303, 240].map((d) => ({ d, line: new Float32Array(d), i: 0 }));
  for (let i = 0; i < len; i++) {
    const x = buf[i]!;
    let wet = 0;
    for (const c of combs) {
      const out = c.line[c.i]!;
      c.low += 0.3 * (out - c.low);
      c.line[c.i] = x + c.low * 0.8;
      c.i = (c.i + 1) % c.d;
      wet += out;
    }
    wet /= 4;
    for (const p of alls) {
      const z = p.line[p.i]!;
      p.line[p.i] = wet + z * 0.5;
      p.i = (p.i + 1) % p.d;
      wet = z - wet * 0.5;
    }
    buf[i] = x + wet * 0.35;
  }

  // Bas (kuru): akorun kökü; vuruşlu ise yarımlık notalar, sürekli ise kök + beşli dem.
  for (let c = 0; c * chordLen < len; c++) {
    const from = c * chordLen;
    const f = hz(36 + (((degree(feel, tonic, chordAt(c)) - 36) % 12) + 12) % 12);
    if (feel.bass === "pulse") {
      for (let at = from; at < Math.min(len, from + chordLen); at += beat * 2) {
        for (let k = 0; k < beat * 2 && at + k < len; k++) {
          const t = k / MUSIC_RATE;
          // Sonraki nota başlarken 30 ms'de söner: kesik dalga tık yapmasın.
          const edge = Math.min(1, t / 0.01, (beat * 2 - k) / (0.03 * MUSIC_RATE));
          buf[at + k]! += (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * Math.exp(-t / 0.6) * edge * 0.16;
        }
      }
    } else {
      for (let i = from; i < Math.min(len, from + chordLen + release); i++) {
        const t = (i - from) / MUSIC_RATE;
        const env = Math.min(1, t / 0.5) * (i < from + chordLen ? 1 : 1 - (i - from - chordLen) / release);
        buf[i]! += (Math.sin(2 * Math.PI * f * t) + 0.5 * Math.sin(2 * Math.PI * f * 1.5 * t)) * env * 0.1;
      }
    }
  }

  let sum = 0;
  for (let i = 0; i < len; i++) sum += buf[i]! * buf[i]!;
  const gain = MUSIC.rms / Math.sqrt(sum / len);
  for (let i = 0; i < len; i++) buf[i]! *= gain;
  return buf;
}

/** Anlatım bölgeleri (örnek): kelimeler, aradaki kısa sessizlik köprülenir. Kelime yoksa ses izlerinin tamamı. */
export function speechRegions(timeline: Timeline): [number, number][] {
  const words = timeline.speech.length ? timeline.speech : timeline.captions;
  const spans: [number, number][] = words.length
    ? words.map((w) => [w.startMs / 1000 - MUSIC.preSec, w.endMs / 1000 + MUSIC.postSec])
    : timeline.audio.filter((a) => a.role === "voice").map((a) => [a.fromFrame / timeline.fps, (a.fromFrame + a.durationInFrames) / timeline.fps]);
  spans.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const [s, e] of spans) {
    const last = out.at(-1);
    if (last && s - last[1] < MUSIC.bridgeSec) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out.map(([s, e]) => [Math.max(0, Math.round(s * MUSIC_RATE)), Math.round(e * MUSIC_RATE)]);
}

/** Bölümün müzik izi (16 bit mono, MUSIC_RATE): bölümler çapraz kararır, anlatımda kısılır, baş ve son yumuşak. */
export function musicTrack(timeline: Timeline, seed: string): { samples: Int16Array; sections: MusicSection[] } {
  const sections = musicSections(timeline);
  const n = Math.ceil((timeline.durationInFrames / timeline.fps) * MUSIC_RATE);
  const tonic = KEYS[hash(seed) % KEYS.length]!;
  const mix = new Float32Array(n);
  const xf = Math.round(MUSIC.crossfadeSec * MUSIC_RATE);
  for (const s of sections) {
    const start = Math.round((s.fromFrame / timeline.fps) * MUSIC_RATE);
    const end = Math.min(n, Math.round(((s.fromFrame + s.frames) / timeline.fps) * MUSIC_RATE));
    const from = Math.max(0, start - xf / 2);
    const to = Math.min(n, end + xf / 2);
    const buf = renderSection(FEEL[s.mood], tonic, to - from);
    // Eşit güçte çapraz kararma; bölümün başı ve sonu daha uzun kararır.
    const fadeIn = from === 0 ? MUSIC.fadeInSec * MUSIC_RATE : xf;
    const fadeOut = to === n ? MUSIC.fadeOutSec * MUSIC_RATE : xf;
    for (let i = 0; i < buf.length; i++) {
      const k = Math.min(1, i / fadeIn, (buf.length - i) / fadeOut);
      mix[from + i]! += buf[i]! * Math.sin((k * Math.PI) / 2);
    }
  }
  const regions = speechRegions(timeline);
  const atk = 1 - Math.exp(-1 / (MUSIC.attackSec * MUSIC_RATE));
  const rel = 1 - Math.exp(-1 / (MUSIC.releaseSec * MUSIC_RATE));
  const samples = new Int16Array(n);
  let g = 1;
  let r = 0;
  for (let i = 0; i < n; i++) {
    while (r < regions.length && regions[r]![1] <= i) r++;
    const target = r < regions.length && regions[r]![0] <= i ? MUSIC.duck : 1;
    g += (target - g) * (target < g ? atk : rel);
    samples[i] = Math.round(Math.tanh(mix[i]! * g * 1.1) * 32767);
  }
  return { samples, sections };
}

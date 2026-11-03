import type { WordTiming } from "@ys/core";

/**
 * Kelime zamanlarının sesin sessizliklerine hizalanması (3 Kas). Gemini TTS kelime zamanı vermiyor; eskiden süre harf
 * sayısına göre bölünüyordu: duraklamalar bütün kelimelere yayılıyor, kelimeler arasında hiç boşluk kalmıyordu. Dudak
 * senkronu cümle aralarında da konuşuyor, altyazı ve vurgular sesten kayıyordu (Google bölümü: 5 dakikada yalnız iki
 * öbek başı bulunabildi). Ses dosyasındaki sessizlikler (ffmpeg silencedetect) metnin noktalama duraklamalarıyla
 * eşleştirilir: eşleşme, konuşma hızının en düzgün kaldığı sıradır (dinamik programlama). Öbek içinde süre harf
 * sayısıyla bölünür. Sessizlik ölçülemezse noktalamadan tahmini duraklama eklenir.
 */

/** Klip içi sessizlik (ms). */
export interface Silence {
  start: number;
  end: number;
}

export const ALIGN = {
  /** silencedetect eşiği (dB) ve en kısa sessizlik (sn): gerçek anlatımda cümle sonu 0,25–0,6, virgül 0,12–0,35 sn. */
  noiseDb: -35,
  minSilence: 0.12,
  /** Sessizlik ölçülemezse noktalamadan tahmini duraklama (ms) ve toplam sürenin en çok bu kesri. */
  sentencePause: 380,
  commaPause: 180,
  maxPauseShare: 0.3,
  /** Eşleşmeyen noktalama ve sessizliğin cezası (konuşma hızı sapmasıyla aynı birimde). */
  skipSentence: 1.5,
  skipComma: 0.3,
  skipLongSilence: 1,
  skipShortSilence: 0.2,
  /** Bundan uzun sessizlik eşleşmemişse ağır ceza (ms). */
  longSilence: 250,
  /** Kenara bu kadar yakın sessizlik baştaki/sondaki boşluktur (ms; kaydın başında kısa bir tıkırtı olabiliyor). */
  edge: 150,
  /** Aralarında bundan az ses olan iki sessizlik birleşir (ms). */
  join: 100,
} as const;

type Pause = "sentence" | "comma";

interface Token {
  text: string;
  /** Söyleniş süresi ağırlığı: harf + rakam × 3 + kelime geçişi. */
  weight: number;
  pause?: Pause;
}

function tokens(text: string): Token[] {
  const words = text.split(/\s+/).filter(Boolean);
  return words.map((w, i) => {
    const letters = w.match(/\p{L}/gu)?.length ?? 0;
    const digits = w.match(/\d/g)?.length ?? 0;
    const last = i === words.length - 1;
    const pause: Pause | undefined = last ? undefined : /[.!?…]["'”’»)]*$/.test(w) ? "sentence" : /[,;:—–]["'”’»)]*$/.test(w) ? "comma" : undefined;
    return { text: w, weight: letters + digits * 3 + 1, ...(pause ? { pause } : {}) };
  });
}

/** Kelimeleri [from, to) aralığında ağırlıklarına göre [t0, t1] süresine yayar. */
function spread(out: WordTiming[], toks: Token[], from: number, to: number, t0: number, t1: number): void {
  const total = toks.slice(from, to).reduce((s, t) => s + t.weight, 0);
  let at = 0;
  for (let i = from; i < to; i++) {
    const start = t0 + (at / total) * (t1 - t0);
    at += toks[i]!.weight;
    out.push({ text: toks[i]!.text, startMs: Math.round(start), endMs: Math.round(t0 + (at / total) * (t1 - t0)) });
  }
}

/** Sessizlik yokken: noktalamadan tahmini duraklamalar (toplam sürenin en çok %30'u), kalan süre harflerle bölünür. */
function estimate(toks: Token[], start: number, end: number): WordTiming[] {
  const raw = toks.map((t): number => (t.pause === "sentence" ? ALIGN.sentencePause : t.pause === "comma" ? ALIGN.commaPause : 0));
  const sum = raw.reduce((s, p) => s + p, 0);
  const k = sum > 0 ? Math.min(1, ((end - start) * ALIGN.maxPauseShare) / sum) : 0;
  const speech = end - start - sum * k;
  const total = toks.reduce((s, t) => s + t.weight, 0);
  const out: WordTiming[] = [];
  let at = start;
  toks.forEach((t, i) => {
    const len = (t.weight / total) * speech;
    out.push({ text: t.text, startMs: Math.round(at), endMs: Math.round(at + len) });
    at += len + raw[i]! * k;
  });
  return out;
}

/**
 * Metnin kelime zamanları (klip başından ms): sessizlikler noktalamaya hizalanır, baştaki ve sondaki sessizlikte kelime
 * yoktur. Sessizlik listesi boşsa noktalamadan tahmin.
 */
export function alignWords(text: string, durationMs: number, silences: readonly Silence[]): WordTiming[] {
  const toks = tokens(text);
  if (!toks.length) return [];
  // Nefes ya da tıkırtıyla bölünmüş sessizlik tektir (gerçek seste "istiyor." sonrası 6137–6414 ve 6416–6543).
  const sorted: Silence[] = [];
  for (const s of [...silences].filter((x) => x.end > x.start).sort((a, b) => a.start - b.start)) {
    const last = sorted.at(-1);
    if (last && s.start - last.end < ALIGN.join) last.end = Math.max(last.end, s.end);
    else sorted.push({ ...s });
  }
  const lead = sorted.find((s) => s.start <= ALIGN.edge);
  const tail = sorted.find((s) => s.end >= durationMs - ALIGN.edge && s !== lead);
  const s0 = lead?.end ?? 0;
  const s1 = Math.max(s0 + 1, tail?.start ?? durationMs);
  const inner = sorted.filter((s) => s !== lead && s !== tail && s.start >= s0 && s.end <= s1);
  if (!inner.length) return estimate(toks, s0, s1);

  // Noktalamalı kelimeler (son kelime hariç) ve konumları (ağırlık toplamı).
  const cum: number[] = [];
  toks.reduce((s, t, i) => (cum[i] = s + t.weight), 0);
  const W = cum.at(-1)!;
  const slots = toks.flatMap((t, i) => (t.pause ? [{ word: i, at: cum[i]!, pause: t.pause }] : []));
  const speaking = s1 - s0 - inner.reduce((s, x) => s + x.end - x.start, 0);
  const rate = W / Math.max(1, speaking);

  // Düğüm: başlangıç, (noktalama k, sessizlik j) eşleşmesi, bitiş. Maliyet: parça uzunluğu × ln(hız / ortalama)²
  // + atlanan noktalama ve sessizlik cezası.
  interface Node {
    k: number;
    j: number;
    at: number;
    /** Konuşmanın bu düğümde bittiği ve yeniden başladığı an. */
    stop: number;
    resume: number;
  }
  const start: Node = { k: -1, j: -1, at: 0, stop: s0, resume: s0 };
  const end: Node = { k: slots.length, j: inner.length, at: W, stop: s1, resume: s1 };
  const nodes: Node[] = [start];
  slots.forEach((sl, k) => inner.forEach((si, j) => nodes.push({ k, j, at: sl.at, stop: si.start, resume: si.end })));
  nodes.push(end);
  const skipSlots = (a: number, b: number) => slots.slice(a + 1, b).reduce((s, sl) => s + (sl.pause === "sentence" ? ALIGN.skipSentence : ALIGN.skipComma), 0);
  const skipSilences = (a: number, b: number) =>
    inner.slice(a + 1, b).reduce((s, si) => s + (si.end - si.start >= ALIGN.longSilence ? ALIGN.skipLongSilence : ALIGN.skipShortSilence), 0);
  const cost = new Array<number>(nodes.length).fill(Infinity);
  const prev = new Array<number>(nodes.length).fill(-1);
  cost[0] = 0;
  for (let b = 1; b < nodes.length; b++) {
    const B = nodes[b]!;
    for (let a = 0; a < b; a++) {
      const A = nodes[a]!;
      if (A.k >= B.k || A.j >= B.j || cost[a] === Infinity) continue;
      // Sessizlikler sıralı, ayrık ve aralarında en az ALIGN.join var: dt hep artıdır (olmasa maliyet sonsuz/NaN
      // çıkar, o yol seçilmez).
      const dt = B.stop - A.resume;
      const dev = Math.log((B.at - A.at) / dt / rate);
      const c = cost[a]! + ((B.at - A.at) / W) * 10 * dev * dev + skipSlots(A.k, B.k) + skipSilences(A.j, B.j);
      if (c < cost[b]!) {
        cost[b] = c;
        prev[b] = a;
      }
    }
  }
  // Bitiş her zaman başlangıçtan doğrudan ulaşılabilir (s1 > s0): yol vardır.
  const path: Node[] = [];
  for (let n = nodes.length - 1; n >= 0; n = prev[n]!) path.unshift(nodes[n]!);
  const out: WordTiming[] = [];
  for (let i = 1; i < path.length; i++) {
    const A = path[i - 1]!;
    const B = path[i]!;
    const from = A.k < 0 ? 0 : slots[A.k]!.word + 1;
    const to = B.k >= slots.length ? toks.length : slots[B.k]!.word + 1;
    spread(out, toks, from, to, A.resume, B.stop);
  }
  return out;
}

/** ffmpeg silencedetect çıktısından sessizlikler (ms); kapanmamış son sessizlik klibin sonuna kadar sürer. */
export function parseSilences(stderr: string, durationMs: number): Silence[] {
  const out: Silence[] = [];
  let open: number | undefined;
  for (const m of stderr.matchAll(/silence_(start|end):\s*(-?[\d.]+)/g)) {
    const ms = Math.max(0, Math.round(Number(m[2]) * 1000));
    if (m[1] === "start") open = ms;
    else if (open !== undefined) {
      out.push({ start: open, end: ms });
      open = undefined;
    }
  }
  if (open !== undefined && open < durationMs) out.push({ start: open, end: durationMs });
  return out;
}

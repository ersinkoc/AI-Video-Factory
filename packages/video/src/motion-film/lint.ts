import { MOTION_FILM, PACE_BEATS, sceneFrames, type MotionFilm, type MotionScene } from "@ys/core";
import { diagramOrder } from "./order.ts";
import { beatFrames, enterFrames, FILM, unitsOf, wordsOf } from "./timing.ts";

/**
 * Film denetimi (huashu-motion'un ölçtüğü eşikler; rhythm.md, director.md): kanca ilk 3 sn'de, filmin %25–60'ında
 * 5 sn'de en az 5 kesmelik patlama (montaj/hibrit, 20 sn'den uzun film), planlı duruş dışında iki ölçüden uzun olaysız
 * boşluk yok, dakikada en az 3 kesme, yazılar okunacak kadar ekranda (kelime başına 0,25 sn + 0,5 sn) ve öğeler sahneye
 * sığıyor (vuruştan kaymıyor). Okunma ve sığma kodla düzeltilir (fitScene); ötekiler yönetmene not olarak gider.
 */
export const FILM_LINT = { hookSec: 3, burst: { windowSec: 5, cuts: 5, from: 0.25, to: 0.6, minSec: 20 }, gapBars: 2, cutsPerMin: 3, flatMinSec: 20 } as const;

export type FilmIssueKind = "hook" | "burst" | "gap" | "flat" | "hold" | "crowded";
export interface FilmIssue {
  kind: FilmIssueKind;
  sceneId?: string;
  atSec: number;
  /** İnsan okunur ayrıntı (İngilizce; yönetmene not olarak da gider). */
  detail: string;
}

/** Sahne içinde yazının okunma süresi (sn) ve gösterildiği an (öğe sırası): her yazılı öğe için. */
export interface TextUnit {
  /** Öğe sırası (enterFrames dizini). */
  unit: number;
  words: number;
  /** Montaj kartı: bir sonraki kartın girişine kadar görünür. */
  until?: number;
  /** Okunma girişten bu kadar sonra başlar (sn): sayaç önce sayar, son değeri sonra okunur. */
  after?: number;
}

export function textUnits(scene: MotionScene): TextUnit[] {
  const count = (s?: string) => (s ? wordsOf(s).length : 0);
  switch (scene.language) {
    case "kinetic": {
      const k = scene.kinetic!;
      if (k.mode === "words") {
        // Satır son kelimesi geldiğinde tamamlanır; okunma o andan sayılır.
        let n = -1;
        return k.lines.map((l) => ({ unit: (n += wordsOf(l).length), words: count(l) }));
      }
      return k.lines.map((l, i) => ({ unit: k.mode === "chapter" ? i + 1 : i, words: count(l) }));
    }
    case "data": {
      const d = scene.data!;
      const units = unitsOf(scene);
      // Sayacın son değeri sayış bittikten sonra okunacak kadar kalır: 2 vuruşluk sayaç sahnesi kesmede yarım kalıyordu
      // (23 Kas, 9:16 film m8/m9: 122 BPM'de ~1 sn, sayış 0,9 sn girişten yarım vuruş sonra başlıyordu; "1.187", "3.088").
      const counter = d.chart === "count" ? [{ unit: 1, words: 1, after: FILM.countSec }] : [];
      return [{ unit: 0, words: count(d.title) }, ...counter, ...(d.callout ? [{ unit: units - 1, words: count(d.callout) }] : [])];
    }
    case "diagram": {
      const g = scene.diagram!;
      const order = diagramOrder(g);
      return g.nodes.map((n) => ({ unit: order.indexOf(n.id), words: count(n.label) }));
    }
    case "grid": {
      const g = scene.grid!;
      const lead = g.title && g.mode === "grid" ? 1 : 0;
      // Montajda kart bir sonrakine kadar görünür: başlığı üç kelimeye kadar bir bakışta okunur (rhythm.md §5).
      if (g.mode === "montage") return g.cards.flatMap((c, i) => (c.body || count(c.title) > 3 ? [{ unit: i, words: count(c.title) + count(c.body), until: i + 1 }] : []));
      return [...(g.title ? [{ unit: 0, words: count(g.title) }] : []), ...g.cards.map((c, i) => ({ unit: lead + i, words: count(c.title) + count(c.body) }))];
    }
    case "field": {
      const f = scene.field!;
      return [f.title, f.subtitle].filter(Boolean).map((s, i) => ({ unit: i, words: count(s) }));
    }
    case "object": {
      // Başlık yoksa görsel (logo) ilk öğedir: not ikinci sırada girer.
      const o = scene.object!;
      const caption = o.title || o.image !== undefined ? 1 : 0;
      return [...(o.title ? [{ unit: 0, words: count(o.title) }] : []), ...(o.caption ? [{ unit: caption, words: count(o.caption) }] : [])];
    }
  }
}

/** Yazının ekranda kalması gereken süre (sn). */
export const holdSec = (words: number) => words * FILM.holdPerWord + FILM.holdBase;

/** Sahnenin yetmesi gereken kare sayısı: son yazı okunacak kadar kalır, öğeler temposunda sığar. */
export function neededFrames(scene: MotionScene, bpm: number, fps: number): number {
  const units = unitsOf(scene);
  const step = PACE_BEATS[scene.pace] * beatFrames(bpm, fps);
  // Öğeler kendi temposunda girerse son öğenin karesi; FILM.fill'e sığmalı.
  const fit = units > 1 ? Math.ceil(((units - 1) * step) / FILM.fill) : 1;
  const frames = Math.max(1, fit);
  const enters = enterFrames(scene, frames, bpm, fps, units);
  let need = frames;
  for (const t of textUnits(scene)) {
    // Montaj kartı bir sonrakine kadar görünür, onu tempo belirler; son kart ise sahnenin sonuna kadar kalır, sahne onun
    // okunacağı kadar uzar (24 Kas, 9:16 film m9: tek kartlı montaj "Installed in One Day" 2 vuruşta 1 sn kaldı, denetim
    // 1,5 sn istedi ama sahne uzamıyordu).
    if (t.until !== undefined && t.until < units) continue;
    need = Math.max(need, Math.ceil(enters[t.unit]! + ((t.after ?? 0) + holdSec(t.words)) * fps));
  }
  return need;
}

/** Sahne uzunluğunu (vuruş) yazıların okunacağı ve öğelerin sığacağı kadar uzatır (en çok MOTION_FILM.sceneBeats.max). */
export function fitScene(scene: MotionScene, bpm: number, fps: number): MotionScene {
  const beat = beatFrames(bpm, fps);
  const need = Math.ceil(neededFrames(scene, bpm, fps) / beat - 1e-6);
  const beats = Math.min(MOTION_FILM.sceneBeats.max, Math.max(scene.beats, need));
  return beats === scene.beats ? scene : { ...scene, beats };
}

/** Filmdeki olaylar (sn): sahne başları (kesme), öğe girişleri, montaj kesmeleri. */
export function filmEvents(film: MotionFilm, fps: number): { at: number; cut: boolean; sceneId: string }[] {
  const out: { at: number; cut: boolean; sceneId: string }[] = [];
  sceneFrames(film.scenes, film.bpm, fps).forEach(({ fromFrame, frames }, i) => {
    const s = film.scenes[i]!;
    const montage = s.language === "grid" && s.grid!.mode === "montage";
    enterFrames(s, frames, film.bpm, fps).forEach((f, j) => out.push({ at: (fromFrame + f) / fps, cut: j === 0 || montage, sceneId: s.id }));
    if (!unitsOf(s)) out.push({ at: fromFrame / fps, cut: true, sceneId: s.id });
  });
  return out.sort((a, b) => a.at - b.at);
}

/** Filmin denetimi; boş liste temiz demektir. */
export function lintFilm(film: MotionFilm, fps: number): FilmIssue[] {
  const issues: FilmIssue[] = [];
  const spans = sceneFrames(film.scenes, film.bpm, fps);
  const total = spans.reduce((a, s) => Math.max(a, s.fromFrame + s.frames), 0) / fps;
  const events = filmEvents(film, fps);
  const bar = (MOTION_FILM.beatsPerBar * 60) / film.bpm;

  if (!events.some((e) => e.at > 0 && e.at <= FILM_LINT.hookSec)) issues.push({ kind: "hook", atSec: 0, detail: `nothing new happens in the first ${FILM_LINT.hookSec} s` });

  // Planlı duruş bölümleri (ritim çizelgesi) boşluk sayılmaz.
  const stops: [number, number][] = [];
  let at = 0;
  for (const s of film.sections) {
    if (s.name === "stop") stops.push([at, at + s.bars * bar]);
    at += s.bars * bar;
  }
  const inStop = (a: number, b: number) => stops.some(([x, y]) => a >= x - 0.05 && b <= y + 0.05);
  const marks = [...events.map((e) => e.at), total];
  for (let i = 1; i < marks.length; i++) {
    const [a, b] = [marks[i - 1]!, marks[i]!];
    if (b - a > FILM_LINT.gapBars * bar + 0.05 && !inStop(a, b)) {
      const scene = events.filter((e) => e.at <= a).at(-1)!;
      issues.push({ kind: "gap", sceneId: scene.sceneId, atSec: round(a), detail: `${(b - a).toFixed(1)} s with nothing new (more than ${FILM_LINT.gapBars} bars)` });
    }
  }

  const cuts = events.filter((e) => e.cut).map((e) => e.at);
  const b = FILM_LINT.burst;
  if (total >= b.minSec && film.route !== "continuous") {
    const dense = cuts.some((c) => c >= total * b.from && c <= total * b.to && cuts.filter((x) => x >= c && x < c + b.windowSec).length >= b.cuts);
    if (!dense) issues.push({ kind: "burst", atSec: round(total * b.from), detail: `no burst of ${b.cuts}+ cuts within ${b.windowSec} s between ${b.from * 100}% and ${b.to * 100}% of the film` });
  }
  if (total >= FILM_LINT.flatMinSec && film.route !== "continuous" && (cuts.length / total) * 60 < FILM_LINT.cutsPerMin) {
    issues.push({ kind: "flat", atSec: 0, detail: `${((cuts.length / total) * 60).toFixed(1)} cuts per minute (at least ${FILM_LINT.cutsPerMin})` });
  }

  film.scenes.forEach((s, i) => {
    const { fromFrame, frames } = spans[i]!;
    const units = unitsOf(s);
    const step = PACE_BEATS[s.pace] * beatFrames(film.bpm, fps);
    const enters = enterFrames(s, frames, film.bpm, fps, units);
    if (units > 1 && enters[1]! < step - 1) issues.push({ kind: "crowded", sceneId: s.id, atSec: round(fromFrame / fps), detail: `${units} elements do not fit ${s.beats} beats at ${s.pace} pace; they fall off the beat` });
    for (const t of textUnits(s)) {
      const end = t.until !== undefined ? (enters[t.until] ?? frames) : frames;
      const shown = (end - enters[t.unit]!) / fps - (t.after ?? 0);
      if (shown + 1e-6 < holdSec(t.words)) {
        issues.push({ kind: "hold", sceneId: s.id, atSec: round((fromFrame + enters[t.unit]!) / fps), detail: `text of ${t.words} words is on screen ${shown.toFixed(2)} s (needs ${holdSec(t.words).toFixed(2)} s)` });
      }
    }
  });
  return issues;
}

const round = (x: number) => Math.round(x * 100) / 100;

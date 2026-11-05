import { ARM_GESTURES, type Timeline, type VectorAnim, type VectorAnimType } from "@ys/core";
import { bubbleSize, sayWindow } from "./bubble.ts";
import { visualVector } from "./entrance.ts";
import { revealWindow } from "./kinetic-timing.ts";
import { shotModel } from "./Vector.tsx";

type Visual = Timeline["visuals"][number];
type Assets = Timeline["vectorAssets"];

/**
 * İnceleme karesinin anı (çekimin kesri): varsayılan at; aday anlar from–to arasında step adımla. Jest başlangıcından
 * settle sn sonra (kol yerine oturur) ve bitişinden release sn önceye kadar görünür sayılır.
 */
export const STILL = { at: 0.8, from: 0.3, to: 0.92, step: 0.02, settle: 0.6, release: 0.3 } as const;

/** Katmanı ortaya çıkaran animasyonlar: bitmeden kare alınmaz (yarım çizim, yarım kayma kusur sanılır). */
const ENTRANCE = new Set<VectorAnimType>(["fade_in", "slide_in", "pop", "draw_on"]);
/** İncelemenin "anlatılan eylem" diye baktığı karakter jestleri (konuşma sürekli, oturma duruş: sayılmaz). */
const ACTION = new Set<VectorAnimType>([...ARM_GESTURES, "walk", "nod", "shake_head"]);
const TEXT = new Set<VectorAnimType>(["typewriter", "count_up", "kinetic"]);

/**
 * İnceleme (ve taslak incelemesi) karesinin anı (4 Kas: kare çekimin %80'inden alınıyordu; "anlatılan eylemi yapmıyor"
 * notlarının 75'inin 10'unda jest o anda bitmişti: 3,5 sn'ye kısalan sevinç, çekimin ilk yarısındaki işaret, yürüyüş,
 * baş sallama. Denetçi hareketsiz kişiyi görüp sahneyi yeniden planlatıyordu). Yazılar açılmış, girişler bitmiş, çıkış
 * başlamamışken kişilerin en çok jestinin göründüğü an; eşitlikte at'e en yakını. Jestler sahnelenmiş plandan
 * (staging: kısalan, sıraya giren jest render'daki gibi).
 */
export function stillMoment(visual: Visual, assets: Assets, fps: number): number {
  if (!visual.vector) return STILL.at;
  const dur = visual.durationInFrames / fps;
  const { spec, safe } = shotModel(visualVector(visual, assets, fps)!, assets, "outline", 1920, 1080, Boolean(visual.overlay), dur, visual.dressing);
  const layerAnims = spec.layers.flatMap((l) => l.anims);
  const texts = spec.texts.flatMap((t) => t.anims.filter((a) => TEXT.has(a.type)).map((a) => revealWindow(a, t.text, dur)));
  const ready = Math.max(STILL.from, ...layerAnims.filter((a) => ENTRANCE.has(a.type)).map((a) => a.end), ...texts.map((a) => a.end));
  const exit = Math.min(STILL.to, ...layerAnims.filter((a) => a.type === "fade_out").map((a) => a.start));
  const people = spec.layers.filter((l) => safe[l.asset]?.kind === "character");
  const gestures = people.flatMap((l) => l.anims.filter((a) => ACTION.has(a.type)));
  const shown = (a: Pick<VectorAnim, "start" | "end">) => {
    const half = (a.end - a.start) / 2;
    return [a.start + Math.min(STILL.settle / dur, half), a.end - Math.min(STILL.release / dur, half)] as const;
  };
  // Konuşma balonu da anlatılanın parçası: açılıp yerine oturduktan sonra, kapanmadan önce görünür.
  const bubbles = people.flatMap((l) => {
    const win = l.say && bubbleSize(l.say) ? sayWindow(l, dur) : undefined;
    return win ? [win] : [];
  });
  const windows = [...gestures.map(shown), ...bubbles.map(shown)];
  if (!windows.length || ready > exit) return STILL.at;
  const score = (p: number) => windows.filter(([lo, hi]) => p >= lo - 1e-9 && p <= hi + 1e-9).length;
  // Adaylar: ızgara ve her jestin görünür penceresinin uçları (kısa baş sallama ızgara adımının arasına düşmesin).
  const grid = Array.from({ length: Math.floor((exit - ready) / STILL.step + 1e-9) + 1 }, (_, i) => ready + i * STILL.step);
  const candidates = [...grid, ...windows.flat()].filter((p) => p >= ready - 1e-9 && p <= exit + 1e-9);
  return candidates.reduce((best, p) => {
    const [s, b] = [score(p), score(best)];
    return s > b || (s === b && Math.abs(p - STILL.at) < Math.abs(best - STILL.at)) ? p : best;
  }, Math.min(Math.max(STILL.at, ready), exit));
}

import type { Timeline } from "@ys/core";
import { dressVisuals } from "@ys/video/sets";
import type { EpisodeState } from "./state.ts";

/** Mekân → kullanılabilir set eşyaları: çizilmiş (anahtarı var) ve reddedilmemiş olanlar, state.sets sırasıyla. */
export function setsOf(state: EpisodeState): Record<string, string[]> {
  const props = state.vectorProps ?? {};
  return Object.fromEntries(Object.entries(state.sets ?? {}).map(([room, ids]) => [room, ids.filter((id) => props[id]?.key && !props[id].rejected)]));
}

/**
 * Zaman çizelgesine set eşyaları (input.setDressing, verilmezse açık): yerleşim kaydedilmez, her kurulumda planın
 * kendisinden yeniden türetilir (@ys/video/sets dressVisuals), böylece yeniden plan, Stüdyo'da reddedilen eşya ya da
 * değişen kod eski bir yerleşimi taşımaz. Önizleme, taslak denetimi, animasyon denetimi ve render aynı sonucu görür.
 */
export function withSets(timeline: Timeline, state: EpisodeState): Timeline {
  if (state.input.setDressing === false || !state.sets) return timeline;
  return { ...timeline, visuals: dressVisuals(timeline.visuals, timeline.vectorAssets, setsOf(state), timeline.fps) };
}

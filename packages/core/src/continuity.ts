import type { VectorShot } from "./vector.ts";

/**
 * Aynı sabit düzen içindeki nesne devamlılığı. Kamera, yer, ruh hali ve katman geometrisi aynı olmalı;
 * yürüyüş, taşıma, dönüş veya çıkış varsa güvenli eşleşme yoktur. Konuşan kişilerin pozu taşınmaz.
 */
export function carriedObjects(previous: VectorShot | undefined, next: VectorShot): string[] {
  if (!previous || previous.key !== undefined || next.key !== undefined || previous.callout !== undefined || next.callout !== undefined || !previous.background || previous.background !== next.background || previous.mood !== next.mood || previous.camera.panX !== 0 || next.camera.panX !== 0 || previous.camera.zoomFrom !== previous.camera.zoomTo || next.camera.zoomFrom !== next.camera.zoomTo || JSON.stringify(previous.camera) !== JSON.stringify(next.camera)) return [];
  const geometry = (s: VectorShot) => s.layers.map(({ anims: _a, screen: _s, say: _q, expression: _e, ...l }) => l);
  if (JSON.stringify(geometry(previous)) !== JSON.stringify(geometry(next))) return [];
  const settled = (s: VectorShot) => s.layers.every((l) => l.heldBy === undefined && l.anims.every((a) => a.type === "fade_in" || a.type === "draw_on"));
  if (!settled(previous) || next.layers.some((l) => l.heldBy !== undefined || l.anims.length > 0)) return [];
  return next.layers.map((l) => l.asset);
}

import type { VectorShot } from "@ys/core";

/** Çekim boyu: geniş (zoom < 1,25), orta (< 1,6), yakın. Sınırlar yönetmen talimatındaki örneklerle aynı. */
export type ShotSize = "wide" | "medium" | "close";

export const SHOT_SIZE = { medium: 1.25, close: 1.6 } as const;

export function shotSize(camera: VectorShot["camera"]): ShotSize {
  const z = Math.max(camera.zoomFrom, camera.zoomTo);
  return z < SHOT_SIZE.medium ? "wide" : z < SHOT_SIZE.close ? "medium" : "close";
}

/**
 * Bir adım değişen çekimin yeni kamerası: geniş → orta (kişilerin ortasına), orta → yakın (öndeki kişiye; render kişiyi
 * belden yukarı çerçeveler), yakın → orta. Odağın yüksekliği render'da kadraj kurallarıyla düzelir.
 */
const STEP: Record<ShotSize, { size: ShotSize; zoomFrom: number; zoomTo: number }> = {
  wide: { size: "medium", zoomFrom: 1.3, zoomTo: 1.4 },
  medium: { size: "close", zoomFrom: 1.7, zoomTo: 1.85 },
  close: { size: "medium", zoomFrom: 1.25, zoomTo: 1.35 },
};

/** Konuşan/anlatan, yoksa ilk kişi: yakın çekimin öznesi. */
const LEAD = new Set(["talk", "explain", "point", "show", "think", "surprised", "cheer"]);

/**
 * Atlama kesmesi (jump cut) önleme (3 Kas, C# taslağı: 31 karenin 13'ünde "aynı oda ve aynı poz önceki çekimin
 * tekrarı"). Sahneler paralel planlandığı için yönetmen bir önceki sahnenin son çekimini görmüyor; sahne sınırında
 * aynı oda, aynı kişiler, aynı çekim boyu art arda geliyordu. Kurgu kuralı: aynı özneye kesme en az bir çekim boyu
 * değiştirir. Ardışık iki vektör çekim aynı arka planda, aynı kişilerle ve aynı boydaysa ikinci çekimin boyu bir adım
 * değişir. Kayan kamera, Manim tahtası ve kişisiz çekim dokunulmaz. Değişen çekim sayısını döner (yerinde değiştirir).
 */
export function varyShotSizes(shots: { vector?: VectorShot }[], isCharacter: (asset: string) => boolean): number {
  let changed = 0;
  const people = (v: VectorShot) => [...new Set(v.layers.filter((l) => isCharacter(l.asset)).map((l) => l.asset))].sort().join(",");
  for (let i = 1; i < shots.length; i++) {
    const prev = shots[i - 1]!.vector;
    const cur = shots[i]!.vector;
    if (!prev || !cur || !cur.background || prev.background !== cur.background || cur.math || cur.camera.panX !== 0) continue;
    const cast = people(cur);
    if (!cast || cast !== people(prev)) continue;
    const size = shotSize(cur.camera);
    if (size !== shotSize(prev.camera)) continue;
    const step = STEP[size];
    const chars = cur.layers.filter((l) => isCharacter(l.asset));
    const lead = chars.find((l) => l.anims.some((a) => LEAD.has(a.type))) ?? chars[0]!;
    const focusX = step.size === "close" ? lead.x : chars.reduce((s, l) => s + l.x, 0) / chars.length;
    cur.camera = { ...cur.camera, zoomFrom: step.zoomFrom, zoomTo: step.zoomTo, focusX: Math.round(focusX) };
    changed++;
  }
  return changed;
}

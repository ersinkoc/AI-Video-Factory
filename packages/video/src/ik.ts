/**
 * İki kemikli analitik ters kinematik (3 Kas): kol açılarını elle ayarlamak her çizimde tutmuyordu (düşünürken el omuzda
 * kalıyordu; uzun boyunlu çizimde çeneye hiç ulaşmıyordu). El bir hedef noktaya gider; açılar kosinüs kuralından gelir.
 * Kural: R. Juckett, "Analytic Two-Bone IK in 2D". Ekran koordinatı (y aşağı), dönüş saat yönü artı, kemik dinlenmede
 * aşağı bakar; iskeletteki gibi ön kolun dönüşü üst kola göredir.
 */

const DEG = 180 / Math.PI;

/** Mutlak dönüşü (derece) verilen kemiğin yön vektörü: dinlenmede (0, 1). */
const along = (deg: number): [number, number] => [-Math.sin(deg / DEG), Math.cos(deg / DEG)];

/** Açıyı (-180, 180] aralığına indirir: aynı yön, en kısa dönüş. */
export const wrap = (deg: number) => {
  const a = ((((deg + 180) % 360) + 360) % 360) - 180;
  return a === -180 ? 180 : a;
};

export interface Reach {
  /** Üst kolun dönüşü (derece). */
  arm: number;
  /** Ön kolun üst kola göre dönüşü (derece). */
  forearm: number;
  /** Dirseğin yeri. */
  elbow: [number, number];
  /** Hedefe yetişildi mi (uzaksa kol uzanır, el hedefe en yakın yerde kalır). */
  reached: boolean;
}

/**
 * Omuzdan hedefe iki kemikle uzanma. İki çözümden dirseği aşağıda olan (yerçekimi; dirsek havada asılı durmaz) seçilir.
 * Hedef erişilemeyecek kadar uzak ya da yakınsa kemik boylarının izin verdiği en yakın yere uzanılır.
 */
export function reach(shoulder: readonly [number, number], target: readonly [number, number], upper: number, lower: number): Reach {
  const dx = target[0] - shoulder[0];
  const dy = target[1] - shoulder[1];
  const dist = Math.hypot(dx, dy);
  const lo = Math.abs(upper - lower) + 1e-6;
  const hi = upper + lower - 1e-6;
  const d = Math.min(hi, Math.max(lo, dist));
  // Hedef omzun tam üstündeyse yön tanımsız: aşağı kabul edilir.
  const [ux, uy] = dist > 1e-9 ? [dx / dist, dy / dist] : [0, 1];
  const goal: [number, number] = [shoulder[0] + ux * d, shoulder[1] + uy * d];
  const toward = Math.atan2(-ux, uy) * DEG;
  const bend = Math.acos(Math.min(1, Math.max(-1, (upper * upper + d * d - lower * lower) / (2 * upper * d)))) * DEG;
  const options = [toward + bend, toward - bend].map((arm) => {
    const [ex, ey] = along(arm);
    const elbow: [number, number] = [shoulder[0] + ex * upper, shoulder[1] + ey * upper];
    const fore = Math.atan2(-(goal[0] - elbow[0]), goal[1] - elbow[1]) * DEG;
    return { arm: wrap(arm), forearm: wrap(fore - arm), elbow };
  });
  const best = options[0]!.elbow[1] >= options[1]!.elbow[1] ? options[0]! : options[1]!;
  return { ...best, reached: Math.abs(d - dist) < 1e-3 };
}

/** İleri kinematik: omuz, iki kemik ve dönüşlerden elin (ikinci kemiğin ucunun) yeri. Testler ve el konumu için. */
export function tip(shoulder: readonly [number, number], upper: number, lower: number, arm: number, forearm: number): [number, number] {
  const [ex, ey] = along(arm);
  const [hx, hy] = along(arm + forearm);
  return [shoulder[0] + ex * upper + hx * lower, shoulder[1] + ey * upper + hy * lower];
}

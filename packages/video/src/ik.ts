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
 * Omuzdan hedefe iki kemikle uzanma. İki çözümden dirseği aşağıda olan (yerçekimi; dirsek havada asılı durmaz) seçilir;
 * out verilirse dirseği o yana (−1 sol, 1 sağ) açılan: başa uzanan elde aşağıdaki dirsek yüzün önünden geçebilir.
 * Hedef erişilemeyecek kadar uzak ya da yakınsa kemik boylarının izin verdiği en yakın yere uzanılır.
 */
export function reach(shoulder: readonly [number, number], target: readonly [number, number], upper: number, lower: number, out?: -1 | 1): Reach {
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
  const [a, b] = options as [(typeof options)[number], (typeof options)[number]];
  const best = (out ? a.elbow[0] * out >= b.elbow[0] * out : a.elbow[1] >= b.elbow[1]) ? a : b;
  return { ...best, reached: Math.abs(d - dist) < 1e-3 };
}

export interface Bend extends Reach {
  /** Üst kolun önden görünen boyu (1 tam; kameraya doğru uzanan kolda kısa: CSS'te üst kolun dikey ölçeği). */
  scale: number;
}

/**
 * Dirseği verilen noktaya koyarak elin hedefe gitmesi: üst kol omuzdan dirseğe döner ve oraya kısalarak (kameraya
 * doğru uzanarak) ulaşır, ön kol dirsekten ele gider. Önden bakışta öne uzanan üst kol kısa görünür; tam boy kolla
 * çeneye giden el dirseği omuz hizasında göğsün karşı yanına atıyordu (3 Kas, React bölümü: her sahnede kötü görünüyordu).
 * Dirsek üst kol boyundan uzaksa kısalarak ulaşılamaz: düz IK (reach). min: en kısa görünüş (dirsek omza çok yakınsa
 * aynı yönde o kadar uzağa konur, el hedefin yakınında kalır).
 */
export function bend(
  shoulder: readonly [number, number],
  elbow: readonly [number, number],
  hand: readonly [number, number],
  upper: number,
  lower: number,
  min: number,
): Bend {
  const ux = elbow[0] - shoulder[0];
  const uy = elbow[1] - shoulder[1];
  const len = Math.hypot(ux, uy);
  if (len > upper) return { ...reach(shoulder, hand, upper, lower), scale: 1 };
  const scale = Math.max(min, len / upper);
  const arm = Math.atan2(-ux, uy) * DEG;
  const [ex, ey] = along(arm);
  const at: [number, number] = [shoulder[0] + ex * upper * scale, shoulder[1] + ey * upper * scale];
  const fore = Math.atan2(-(hand[0] - at[0]), hand[1] - at[1]) * DEG;
  return { arm: wrap(arm), forearm: wrap(fore - arm), elbow: at, scale, reached: Math.abs(Math.hypot(hand[0] - at[0], hand[1] - at[1]) - lower) < 1e-6 };
}

/** İleri kinematik: omuz, iki kemik ve dönüşlerden elin (ikinci kemiğin ucunun) yeri. Testler ve el konumu için. */
export function tip(shoulder: readonly [number, number], upper: number, lower: number, arm: number, forearm: number): [number, number] {
  const [ex, ey] = along(arm);
  const [hx, hy] = along(arm + forearm);
  return [shoulder[0] + ex * upper + hx * lower, shoulder[1] + ey * upper + hy * lower];
}

/**
 * İnsan eklemlerinin hareket sınırları (3 Kas, kullanıcı: "insan anatomisine ters işler olmamalı"). Pozlar kodla
 * kurulur (jest açıları, IK, jestlerin karışımı); render'a giden her poz bu sınırlara kırpılır, kırpılan denetimde
 * (lint.ts `anatomy`) görünür, testler hiçbir jestin ve jest karışımının kırpılmaya ihtiyaç duymadığını sınar.
 *
 * Değerler normal eklem hareket açıklığından (AAOS tablosu, ABD Ortopedi Cerrahları Akademisi): dirsek bükülmesi 150°;
 * bilek bükülmesi 80°, geriye 70°; omuz öne kalkma ve yana açılma 180°, geriye 60°; kalça öne 120°, geriye 30°, yana
 * 45°, içe 30°; diz bükülmesi 135° (yalnız geriye); boyun yana 45°; gövde yana ~30°.
 *
 * İskeletin açısı gerçek açının izdüşümüdür. Kameraya uzanan parça kısa çizilir (dikey ölçek < 1): düşünen kişinin
 * üst kolu öne uzanır, ön kol çeneye dikilir; izdüşümde dirsek 160° katlanmış görünür, gerçekte ~125° bükülüdür. Bu
 * yüzden önden dirsek, iki parçanın kısalmasından derinlikleri geri kurularak 3B açısıyla ölçülür (izleyicinin
 * görebileceği en olağan derinlik: ikisi de kameraya doğru). Diz önden yana bükülemez: dizde büyük izdüşüm açısı kırık
 * bacaktır, sınır küçük kalır. Bir parça ancak kameraya uzanarak kısalabilir, gerçek boyundan uzun görünemez.
 *
 * İşaret: artı saat yönü (ekranda). Önden: sol kol (ekranda sol) artıyla dışa açılır, sağ kol eksiyle; sol bacak artıyla
 * dışa. Profilde (çizim sağa bakar) eksi öne: kol ve bacak eksiyle öne kalkar, dirsek eksiyle bükülür, diz artıyla.
 */

export interface Range {
  min: number;
  max: number;
}

const both = (n: number): Range => ({ min: -n, max: n });

/** Dirsek bükülmesinin üst sınırı (derece; 3B açı). */
export const ELBOW_FLEX = 150;

/**
 * Omzun önden sınırları: yana ve yukarı 180°, gövde ve boyun eğilerek baş üstünden öbür yana 15° daha; tam boy kol
 * gövdenin önünden çaprazına inward derece. Kameraya uzanan (kısa görünen) kol gövdenin önünden daha çok çaprazlar
 * (yatay yaklaştırma): kolun derinliğiyle (0–1) reach derece daha.
 */
export const SHOULDER = { over: 195, inward: 50, reach: 130 } as const;

/** Önden görünüşte eklem sınırları (derece, üst parçaya göre; dirsek 3B açıyla, `ELBOW_FLEX`; omuz `SHOULDER`). */
export const ANATOMY_FRONT: Record<string, Range> = {
  // Omuz: sol kol artıyla dışa ve yukarı, eksiyle gövdenin önüne; sağ kol tersi.
  "arm-l": { min: -SHOULDER.inward, max: SHOULDER.over },
  "arm-r": { min: -SHOULDER.over, max: SHOULDER.inward },
  // Dirsek: insan kolu, omzun kendi ekseninde dönmesiyle bükülme düzlemini her yana çevirebilir; sınır 3B açıda.
  "forearm-l": both(180),
  "forearm-r": both(180),
  // Bilek: 80° (bükülme) – 70° (geriye); izdüşümde iki yönde 80°.
  "hand-l": both(80),
  "hand-r": both(80),
  // Kalça: yana 45°, içe (öbür bacağın önüne) 30°.
  "leg-l": { min: -30, max: 45 },
  "leg-r": { min: -45, max: 30 },
  // Diz yana bükülmez: önden yalnız bükülü dizin kalça dönüşüyle görünen küçük açısı.
  "shin-l": both(30),
  "shin-r": both(30),
  // Boyun yana 45°, gövde yana ~30°.
  head: both(40),
  torso: both(30),
  body: both(30),
};

/** Profilde (yürüyen yan çizim, 3D figürün yan dönüşü) eklem sınırları; bükülme düzlemi görüntü düzlemidir. */
export const ANATOMY_SIDE: Record<string, Range> = {
  // Omuz: öne 180°, geriye 60°.
  "arm-l": { min: -180, max: 60 },
  "arm-r": { min: -180, max: 60 },
  // Dirsek yalnız öne bükülür (hafif aşırı açılma 5°).
  "forearm-l": { min: -ELBOW_FLEX, max: 5 },
  "forearm-r": { min: -ELBOW_FLEX, max: 5 },
  "hand-l": { min: -80, max: 70 },
  "hand-r": { min: -80, max: 70 },
  // Kalça: öne 120°, geriye 30°.
  "leg-l": { min: -120, max: 30 },
  "leg-r": { min: -120, max: 30 },
  // Diz yalnız geriye bükülür, 135°.
  "shin-l": { min: -5, max: 135 },
  "shin-r": { min: -5, max: 135 },
  // Boyun öne/geriye 45°.
  head: both(45),
  torso: both(30),
  body: both(30),
};

/**
 * Bir parçanın görünen boyu (gerçek boyuna oranı): kameraya uzanarak kısalabilir, uzayamaz (nefes ve gerinme için
 * küçük pay). Alt sınır okunabilirlik: dümdüz kameraya bakan uzuv kaybolur, ters ölçek parçayı içinden çevirir.
 */
export const STRETCH: Range = { min: 0.35, max: 1.06 };

export interface Strain {
  part: string;
  /** Kırpılan değer: dönüş ya da ölçek (ölçekte görünen boy, üst parçalarınkiyle çarpılmış). */
  what: "rotate" | "sx" | "sy";
  value: number;
  limit: number;
}

type PartPose = { rotate: number; sx: number; sy: number; tx: number; ty: number };

/**
 * Parçanın ölçeğini taşıyan üst parça. Ön kol yok: CSS üst kolun ölçeğini dirsekte geri alır (Vector.tsx `rigCss`),
 * ön kolun boyu yalnız kendi ölçeğidir. Baldır uyluğun ölçeğini taşır (oturuşta uyluk kısalır, baldır geri alır).
 */
const CARRIER: Record<string, string> = { "hand-l": "forearm-l", "hand-r": "forearm-r", "shin-l": "leg-l", "shin-r": "leg-r" };

const RAD = Math.PI / 180;
const depth = (s: number) => Math.sqrt(Math.max(0, 1 - s * s));

/**
 * Dirseğin 3B bükülmesi (derece): iki parçanın görünen boyundan (s1 üst kol, s2 ön kol) derinlikleri geri kurulur,
 * aradaki izdüşüm açısı phi. İkisi de kameraya doğru uzanır sayılır (en olağan okuma; en küçük bükülme).
 */
export function flexion(s1: number, s2: number, phi: number): number {
  const c = s1 * s2 * Math.cos(phi * RAD) + depth(s1) * depth(s2);
  return Math.acos(Math.min(1, Math.max(-1, c))) / RAD;
}

/** Bükülmeyi `limit`te tutan en büyük izdüşüm açısı (derece; 180 = her açı olur). */
export function maxPhi(s1: number, s2: number, limit: number): number {
  const c = (Math.cos(limit * RAD) - depth(s1) * depth(s2)) / (s1 * s2);
  return c <= -1 ? 180 : Math.acos(Math.min(1, c)) / RAD;
}

/**
 * Açıyı aralığa kırpar. Dönüş 360° sarar (rotate(172) ile rotate(−188) aynı çizim): aralığın ortasına en yakın eşdeğeri
 * denenir, sonuç girdinin kendi penceresinde döner (komşu karelerle sayıca sürekli kalır).
 */
export function fitAngle(v: number, r: Range): number {
  const k = Math.round(((r.min + r.max) / 2 - v) / 360);
  const w = v + 360 * k;
  const c = Math.min(r.max, Math.max(r.min, w));
  return c === w ? v : c - 360 * k;
}

/**
 * Pozu anatomiye kırpar: eklemlerin dönüşü sınırına (önden dirsek 3B açısıyla, omuz kolun derinliğiyle), parçaların
 * görünen boyu STRETCH aralığına. Kırpılanlar strains'te; poz yerinde değiştirilir (aynı nesne döner). profile: yan
 * görünüş sınırları.
 */
export function anatomical<P extends Partial<Record<string, PartPose>>>(pose: P, profile: boolean): { pose: P; strains: Strain[] } {
  const limits = profile ? ANATOMY_SIDE : ANATOMY_FRONT;
  const strains: Strain[] = [];
  const parts = pose as Partial<Record<string, PartPose>>;
  // Önce boy (dirsek açısı boydan hesaplanır); üst parça alt parçadan önce kırpılır.
  for (const part of Object.keys(limits).sort((a, b) => Number(a in CARRIER) - Number(b in CARRIER))) {
    const p = parts[part];
    if (!p) continue;
    const carrier = parts[CARRIER[part] ?? ""];
    for (const what of ["sx", "sy"] as const) {
      const up = carrier ? carrier[what] : 1;
      const seen = up * p[what];
      if (seen >= STRETCH.min && seen <= STRETCH.max) continue;
      const limit = seen < STRETCH.min ? STRETCH.min : STRETCH.max;
      strains.push({ part, what, value: seen, limit });
      p[what] = limit / up;
    }
  }
  for (const [part, r] of Object.entries(limits)) {
    const p = parts[part];
    if (!p) continue;
    let range = r;
    if (!profile && part.startsWith("forearm-")) {
      // Önden dirsek: izdüşüm açısı, 3B bükülme ELBOW_FLEX'i aşmayacak kadar.
      const m = maxPhi(parts[`arm-${part.slice(-1)}`]?.sy ?? 1, p.sy, ELBOW_FLEX);
      range = { min: -m, max: m };
    }
    if (!profile && part.startsWith("arm-")) {
      const inward = SHOULDER.inward + SHOULDER.reach * depth(p.sy);
      range = part === "arm-l" ? { min: -inward, max: SHOULDER.over } : { min: -SHOULDER.over, max: inward };
    }
    const limit = fitAngle(p.rotate, range);
    if (limit === p.rotate) continue;
    strains.push({ part, what: "rotate", value: p.rotate, limit });
    p.rotate = limit;
  }
  return { pose, strains };
}

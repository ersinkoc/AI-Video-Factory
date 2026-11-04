import type { VectorCrowd } from "@ys/core";

/**
 * Figüranların ölçüleri ve ritmi: crowd.tsx çizer, sfx.ts duyurur, ikisi aynı saati kullanır (gesture-timing.ts gibi).
 * Protesto eden kalabalık sloganı hep birlikte atar, ordu adımını hep birlikte atar: yumruklar ve ayaklar ortak bir
 * vuruşta, kişiye özgü küçük bir kaymayla (sync) iner kalkar; sesi de o vuruşta. Saf modül: render'a ve ses izine
 * React getirmez.
 */
export const CROWD = {
  /** Sıraların derinliği (arkadan öne) ve sıra başına kişi. */
  rows: { group: [0.93, 0.86], crowd: [0.98, 0.92, 0.86] },
  perRow: { group: 5, crowd: 11 },
  /** Kişi boyu aralığı (m). */
  height: [1.55, 1.9],
  /** İleri yürüyen kalabalık çekim boyunca bu kadar öne gelir (derinlik). */
  advance: 0.16,
  /** Kalabalığın arkasında kalan katmanın çevresindeki boşluk (px): figüran anlatılan şeyi örtmez. */
  margin: 24,
  /** Arka plan düzlemi: kadrodan biraz soluk ve koyu. */
  filter: "saturate(0.8) brightness(0.93)",
  /** Protestoda yumruk (ve slogan) vuruşu, Hz. */
  chantHz: 1.6,
  /** Yürüyüşte bacak salınımı, Hz (her salınımda iki adım). */
  marchHz: 1,
  /** Ortak vuruştan kişiye özgü kayma: kişinin evresinin bu kesri (±0,25 rad, ~±25 ms). */
  sync: 0.08,
} as const;

/** Kalabalıktaki kişi sayısı (örtülen figüranlar düşülmeden): sesin gürlüğü buna bağlı. */
export function crowdVoices(size: VectorCrowd["size"]): number {
  return CROWD.rows[size].reduce((n, _, row) => n + CROWD.perRow[size] + (row % 2), 0);
}

/** Ortak vuruşta salınım (−1..1); phase: kişinin evresi (0–2π), ortadaki kişi tam vuruşta. */
export const crowdBeat = (hz: number, t: number, phase: number) => Math.sin(2 * Math.PI * hz * t + (phase - Math.PI) * CROWD.sync);

/** Ortak vuruşun belli bir evreye (çevrimin kesri) geldiği anlar, çekim içinde (sn). */
const beats = (hz: number, at: number, dur: number, every = 1) => {
  const out: number[] = [];
  for (let n = 0; (at + n * every) / hz < dur; n++) out.push((at + n * every) / hz);
  return out;
};

/** Slogan anları (sn): yumruklar en yukarıdayken (vuruş −1, çevrimin ¾'ü). */
export const chantTimes = (dur: number) => beats(CROWD.chantHz, 0.75, dur);

/** Adım anları (sn): bacaklar salınımın iki ucundayken (vuruş ±1). */
export const stepTimes = (dur: number) => beats(CROWD.marchHz, 0.25, dur, 0.5);

/**
 * İş jestlerinin ritmi (3 Kas): poz (Vector.tsx) ve efekt sesleri (sfx.ts) aynı saati kullanır, alkış eller
 * birleştiği karede, tuş parmak indiği karede, kalem çizdiği sürece duyulur. Zaman çekim başından saniyedir.
 */
export const GESTURE_RHYTHM = {
  /** Alkış: saniyede bu kadar; eller her tam turda birleşir. */
  clapHz: 2.6,
  /** Klavye: her elin saniyedeki vuruşu; iki el sırayla, yani iki katı tuş. */
  typingHz: 4.5,
  /** Yazı: kalem bu süre yazar, sonra kısa bir duraklama (satır başı). */
  strokeSec: 0.8,
  pauseSec: 0.3,
} as const;

/** Elin birleşme oranı (0 açık, 1 birleşik): kosinüs tepesinde eller değer. */
export const clapClosed = (t: number) => 0.5 + 0.5 * Math.cos(2 * Math.PI * GESTURE_RHYTHM.clapHz * t);

/** Klavyede o anki vuruş derinliği (sol, sağ): sırayla iner kalkar. */
export function typingTaps(t: number): [number, number] {
  const s = Math.sin(2 * Math.PI * GESTURE_RHYTHM.typingHz * t);
  return [Math.max(0, s), Math.max(0, -s)];
}

/** Kalemin yazıp yazmadığı (0–1): yazma süresinde 1, duraklamada 0, sınırlarda yumuşak. */
export function penDown(t: number): number {
  const { strokeSec, pauseSec } = GESTURE_RHYTHM;
  const u = t % (strokeSec + pauseSec);
  return Math.max(0, Math.min(1, u / 0.06, (strokeSec - u) / 0.06));
}

import { Easing } from "remotion";

const DEG = Math.PI / 180;

/** Küre çekimin bu oranında yerine oturur; rotalar, işaretler ve etiketler ondan sonra belirir. */
export const GLOBE_SETTLE = 0.25;

/**
 * Kürenin dönüşü (three.js Euler, XYZ sırası): (lon, lat) noktası kameraya bakar, kuzey yukarıda; d3'ün
 * `geoOrthographic().rotate([-lon, -lat])` görünümüyle aynı. Küre dokusunda boylam -180 -X yönünde, -90 kameraya
 * (+Z) bakar; önce Y ekseninde boylam, sonra X ekseninde enlem çevrilir.
 */
export function globeRotation(lon: number, lat: number): { x: number; y: number } {
  return { x: lat * DEG, y: -(lon + 90) * DEG };
}

/**
 * Çekimin p anındaki bakış noktası: küre hedefin 40° doğusundan ve 12° güneyinden dönerek gelir (yüzey Dünya'nın
 * dönüş yönünde, soldan sağa akar) ve `GLOBE_SETTLE`'da durur; sonra SVG'deki izdüşümle birebir aynıdır.
 */
export function globeView(lon: number, lat: number, p: number): { lon: number; lat: number } {
  const k = Easing.out(Easing.cubic)(Math.min(1, Math.max(0, p / GLOBE_SETTLE)));
  return { lon: lon + 40 * (1 - k), lat: Math.max(-80, lat - 12 * (1 - k)) };
}

/** Küre durduktan sonraki ilerleme (0–1): harita katmanı (rota çizimi, etiket sırası) bu zamanla oynar. */
export const overlayProgress = (p: number) => Math.min(1, Math.max(0, (p - GLOBE_SETTLE) / (1 - GLOBE_SETTLE)));

/** Atmosfer kabuğu küreden bu kadar büyük; kabuğun iç kenarında yüzey normalinin bakışa göre z'si. */
export const HALO = 1.08;
export const HALO_EDGE = Math.sqrt(1 - 1 / (HALO * HALO));

import type { PlacedLayer, VectorAsset, VectorShot } from "@ys/core";

/*
 * Sinematografi (5 Kas; kullanıcı: "sıfır hata, videoya çok yakın görüntü"). Çizilmiş sahneyi çekilmiş gibi gösteren,
 * yönetmen kararı istemeyen ve her çekime kendiliğinden uygulanan kamera gerçekçiliği:
 *
 * - Alan derinliği: geniş çekimde her yer nettir; kamera yaklaştıkça (ölçek LENS.from → LENS.full) netlik düzleminin
 *   önü ve arkası derinlik farkıyla bulanıklaşır. Netlik yakın çekimin öznesinde, yoksa anlatılan nesnede, yoksa konuşan
 *   (ya da odağa en yakın) kişide. Netlikle birlikte kalanlar: öznenin tutanı ve tuttuğu, altındaki ve üstündeki,
 *   anlatılan nesne, büyütme balonunun nesnesi ve ekranında içerik olan her şey (okunması gereken yazı bulanıklaşmaz).
 *   Kişiler yalnız gerçek yakın çekimde bulanıklaşır (ölçek LENS.people'dan sonra, en çok LENS.person: yüz tanınır kalır;
 *   COBOL s3-sh3: orta planda masanın önündeki Grace Hopper bulanıklaşıyordu, gerçek kamera ikili çekimde ikisini de net
 *   tutar); konuşan herkes nettir. Haritada, Manim tahtasında, makro ek çekimde yok.
 * - Kameranın nefesi: sehpadaki kamera bile kusursuz durmaz. Çok yavaş, iki frekanslı, tohumlu bir salınım (en çok
 *   LENS.drift.amp px); kenarda boşluk açılmasın diye sahne overscan kadar büyütülür. Haritada yok (veri sabit durur).
 *
 * Değerler ekran pikseli; kamera ölçeğinin içindeki öğeye yazılırken ölçeğe bölünür.
 */
export const LENS = {
  /** Kamera ölçeği from'da alan derinliği başlar, full'da tamdır. */
  from: 1.15,
  full: 1.9,
  /** Netlik düzleminin iki yanında net kalan derinlik (z birimi; 100 = bir derinlik birimi). */
  band: 12,
  /** Düzlemden uzaklaştıkça bulanıklık (ekran px / z) ve tavanları: katman, kişi, arka plan duvarı. */
  perDepth: 0.08,
  max: 5,
  person: 2.5,
  /** Kişiler bu ölçekten sonra bulanıklaşmaya başlar, peopleFull'da LENS.person tavanına ulaşır. */
  people: 1.7,
  peopleFull: 2.1,
  bg: 4,
  /** Bundan az bulanıklık çizilmez (görünmez, filtre maliyeti boşa). */
  min: 0.4,
  drift: { amp: 2.4, fx: 0.11, fy: 0.17, second: 0.5, overscan: 0.003 },
} as const;

const W = 1920;
const H = 1080;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Alan derinliğinin baktığı model alanları (Vector.tsx ShotModel'in parçası). */
export interface LensModel {
  spec: VectorShot;
  safe: Record<string, VectorAsset>;
  placed: PlacedLayer[];
  cam: VectorShot["camera"];
  bg?: VectorAsset;
  subject?: number;
  macro?: number;
  crowd?: { z: number };
}

/** Netliğin bulunduğu katman: yakın çekimin öznesi, anlatılan nesne, yoksa konuşan (ya da odağa en yakın) kişi. */
export function focusLayer(model: LensModel): number | undefined {
  const { spec, safe, placed, cam, subject } = model;
  const has = (i: number | undefined): i is number => i !== undefined && placed.some((p) => p.index === i);
  if (has(subject)) return subject;
  if (has(spec.key)) return spec.key;
  const people = placed.filter((p) => safe[spec.layers[p.index]!.asset]?.kind === "character");
  const talkers = people.filter((p) => spec.layers[p.index]!.anims.some((a) => a.type === "talk"));
  const pool = talkers.length ? talkers : people;
  const [fx, fy] = [cam.focusX ?? W / 2, cam.focusY ?? H / 2];
  let best: number | undefined;
  let near = Infinity;
  for (const p of pool) {
    const d = Math.hypot(p.x - fx, p.y - p.height * 0.88 - fy);
    if (d < near) [best, near] = [p.index, d];
  }
  return best;
}

/** Bu karedeki alan derinliği (ekran px): arka plan duvarı, katmanlar (yalnız bulanık olanlar) ve figüranlar. */
export interface DepthOfField {
  bg: number;
  layers: Map<number, number>;
  crowd: number;
}

/** Kameranın bu karedeki ölçeği (k: kamera hareketinin yumuşatılmış ilerlemesi). */
export const lensScale = (cam: VectorShot["camera"], k: number) => cam.zoomFrom + (cam.zoomTo - cam.zoomFrom) * k;

export function depthOfField(model: LensModel, k: number): DepthOfField | undefined {
  const { spec, safe, placed, cam, bg } = model;
  if (model.macro !== undefined || bg?.meta.exact || spec.math) return undefined;
  const scale = lensScale(cam, k);
  const s = clamp01((scale - LENS.from) / (LENS.full - LENS.from));
  const personRamp = clamp01((scale - LENS.people) / (LENS.peopleFull - LENS.people));
  const f = s > 0 ? focusLayer(model) : undefined;
  if (f === undefined) return undefined;
  // Havada duran nesne (tutulmayan, yüzeyde ya da yerde olmayan: sunulan bir kart, beliren bir logo) sahnenin bir
  // yerinde değil, en yakın kişinin önünde gösterilir: netlik o kişinin düzlemindedir (NVIDIA s5-sh7: duvar derinliğindeki
  // GeForce kartına netlenince kartı sunan kurucular bulanıklaşıyordu).
  const at = placed.find((p) => p.index === f)!;
  const people = placed.filter((p) => safe[spec.layers[p.index]!.asset]?.kind === "character");
  const free = !at.grounded && at.heldBy === undefined && at.on === undefined && safe[spec.layers[f]!.asset]?.kind !== "character";
  const host = free ? people.reduce<PlacedLayer | undefined>((a, p) => (!a || Math.abs(p.x - at.x) < Math.abs(a.x - at.x) ? p : a), undefined) : undefined;
  const zf = (host ?? at).z;
  const blur = (z: number, cap: number) => {
    const b = s * Math.min(cap, Math.max(0, Math.abs(z - zf) - LENS.band) * LENS.perDepth);
    return b >= LENS.min ? b : 0;
  };
  // Netlikle birlikte kalanlar.
  const focus = spec.layers[f]!;
  const sharp = new Set<number>([f]);
  for (const i of [focus.heldBy, focus.on, spec.key, spec.callout]) if (i !== undefined) sharp.add(i);
  spec.layers.forEach((l, i) => {
    if (l.heldBy === f || l.on === f || l.screen || l.anims.some((a) => a.type === "talk")) sharp.add(i);
  });
  const layers = new Map<number, number>();
  for (const p of placed) {
    if (sharp.has(p.index)) continue;
    const b = blur(p.z, safe[spec.layers[p.index]!.asset]?.kind === "character" ? LENS.person * personRamp : LENS.max);
    if (b) layers.set(p.index, b);
  }
  return { bg: blur(0, LENS.bg), layers, crowd: model.crowd ? blur(model.crowd.z, LENS.person) : 0 };
}

function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** Kameranın nefesi: sahneye (kamera dönüşümünden önce) uygulanacak CSS dönüşümü; t saniye. */
export function cameraDrift(seed: string, t: number): string {
  const { amp, fx, fy, second, overscan } = LENS.drift;
  const a = seedOf(seed) * Math.PI * 2;
  const b = seedOf(`${seed}~y`) * Math.PI * 2;
  const wave = (f: number, ph: number) => (Math.sin(2 * Math.PI * f * t + ph) + second * Math.sin(2 * Math.PI * f * 2.1 * t + ph * 1.7)) / (1 + second);
  const dx = amp * wave(fx, a);
  const dy = amp * 0.6 * wave(fy, b);
  return `translate(${W / 2}px, ${H / 2}px) scale(${1 + overscan}) translate(${(dx - W / 2).toFixed(2)}px, ${(dy - H / 2).toFixed(2)}px)`;
}

/** Işık saçan ekranlar (monitör, televizyon, telefon...): içerikleri çevresine hafif parlar; kara tahta parlamaz. */
const EMISSIVE = /screen|monitor|display|tv|televis|laptop|computer|phone|tablet|terminal|kiosk|projector|imac|crt|\bpc\b|workstation/i;

/** Ekran içeriğinin parıltısı (CSS box-shadow); ışık saçmayan yüzeyde undefined. */
export function screenGlow(asset: VectorAsset, kind: string | undefined, w: number, h: number): string | undefined {
  if (!EMISSIVE.test(asset.id)) return undefined;
  const r = Math.max(4, Math.min(w, h) * 0.14);
  const light = kind === "code" || kind === "terminal" ? "rgba(120,190,255,0.32)" : "rgba(235,245,255,0.38)";
  return `0 0 ${r.toFixed(1)}px ${light}, 0 0 ${(r * 2.4).toFixed(1)}px rgba(160,205,255,0.16)`;
}

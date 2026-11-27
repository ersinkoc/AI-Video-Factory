import { TEXT_RULES, type SceneThree } from "@ys/core";

/** Sahne koordinatında kutu (1920 × 1080). */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 3D illüstrasyonun yeri (27 Kas; kullanıcı: "kurulan skill'lerle daha tutarlı videolar"). Yönetmen x/y/size'ı sahnenin
 * geri kalanını görmeden verir; 3D katmanların arkasında çizilir. 64 bölümde 3D'li 52 çekimin 46'sında 3D'ye değinen
 * inceleme notu vardı: halkalar firavunun boynundan ve gövdesinden geçiyor, Stallman'ın başının arkasında hale gibi;
 * ağ, binanın ve ağacın arkasında kalıp "zor seçiliyor"; kadraj kenarında kesik; küçük. Yönetmenin yeri iyiyse dokunulmaz;
 * değilse 3D kadrajın içindeki en yakın uygun yere kayar, gerekirse shrink'e kadar küçülür, uygun yer yoksa yerinde kalır.
 *
 * content: çizimin kutudaki payı (kalıpların en dış halkası kamera uzaklığında kutunun yarı genişliğinin ~%75'i);
 * pad: yüz kutusunun her yandan genişlediği pay (yüz yüksekliği cinsinden: başın arkasındaki hale de yüzü çevreler);
 * body: içeriğin üst gövdelerin (kişilerin önünde çizildiği yer) altında kalabileceği en çok pay;
 * cover: önde çizilen nesnelerin dolu hücrelerinin örtebileceği en çok pay; frame: kamera hareketinin iki ucunda kadrajda
 * kalması gereken en az pay; minSide: ekranda en küçük kenarı (kare yüksekliği cinsinden; daha küçüğü büyütülür, en çok
 * maxSize); shrink: kaydırırken inebileceği boy; step: aday merkezlerin aralığı (px); perPx: bir px küçülmenin kaç px
 * uzaklığa denk sayıldığı (adaylar yönetmenin yerine uzaklık + küçülme cezasıyla sıralanır; önce en büyük boy aranınca
 * aynı yerdeki dört çekimin 3D'si dört ayrı köşeye savruluyordu, Three.js s5); bottom: içeriğin altının inebileceği en
 * alt yer, kadraj yüksekliği cinsinden (altyazı çizgisi TEXT_RULES.bottom: ilk ölçümde aday yerler altyazının ve zeminin
 * üstüne, ayakların hizasına iniyordu).
 */
export const THREE_SPOT = { content: 0.75, pad: 0.35, body: 0.15, cover: 0.2, frame: 0.97, minSide: 0.3, maxSize: 900, shrink: 0.7, sizes: 4, step: 40, perPx: 1.5, bottom: TEXT_RULES.bottom / 1080 } as const;

/** 3D'yi çevreleyen sahne: kişilerin yüzleri ve üst gövdeleri, önde çizilen nesnelerin örtme payı, kamera uçlarının görüşü. */
export interface SpotScene {
  faces: Box[];
  bodies: Box[];
  /** Her biri, bir nesnenin çiziminin verilen bölgeyi örttüğü pay (0–1). */
  covers: ((r: Box) => number)[];
  /** Kameranın iki ucunda sahnenin görünen kısmı. */
  views: Box[];
  /** Kameranın en küçük ölçeği (sahne px → ekran px). */
  scale: number;
  height: number;
}

/** İllüstrasyonun çizildiği bölge: kutunun ortasındaki content payı. */
export function contentBox(t: Pick<SceneThree, "x" | "y" | "size">): Box {
  const side = t.size * THREE_SPOT.content;
  return { x: t.x - side / 2, y: t.y - side / 2, w: side, h: side };
}

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const padded = (f: Box): Box => ({ x: f.x - f.h * THREE_SPOT.pad, y: f.y - f.h * THREE_SPOT.pad, w: f.w + 2 * f.h * THREE_SPOT.pad, h: f.h * (1 + 2 * THREE_SPOT.pad) });

/**
 * Bölge bu sahnede uygun mu: yüze değmez, gövdelerin ve nesnelerin altında az kalır, kamera uçlarında kadrajdadır;
 * caption ile altyazı çizgisinin de üstündedir.
 */
export function spotFits(box: Box, scene: SpotScene, taken: Box[] = [], caption = true): boolean {
  const area = box.w * box.h;
  if ([...scene.faces.map(padded), ...taken].some((f) => overlap(box, f) > 0)) return false;
  if (scene.bodies.reduce((s, b) => s + overlap(box, b), 0) / area > THREE_SPOT.body) return false;
  if (scene.covers.some((c) => c(box) > THREE_SPOT.cover)) return false;
  return scene.views.every((v) => overlap(box, v) / area >= THREE_SPOT.frame && (!caption || box.y + box.h <= v.y + v.h * THREE_SPOT.bottom));
}

/** Ekranda okunur en küçük boy (sahne px), maxSize ile sınırlı. */
const minSizeOf = (scene: SpotScene) => Math.min(THREE_SPOT.maxSize, (THREE_SPOT.minSide * scene.height) / (scene.scale * THREE_SPOT.content));

/**
 * Her illüstrasyonun yeri (sırayla; öncekiler sonrakilere engeldir). Yeri iyi olan yerinde kalır (küçükse yerinde
 * büyütülür, büyüyünce sığmıyorsa eski boyunda kalır); değilse adaylar boyu (önce okunur boy, sonra shrink'e kadar) ve
 * yönetmenin yerine uzaklığı sırasıyla denenir. Hiçbiri altyazı çizgisinin üstünde sığmıyorsa aynı sıra altyazı şartı
 * olmadan denenir (ilk ölçümde 8 çekimde başka yer kalmıyordu; yüz, gövde, örtme ve kadraj şartı gevşemez).
 * moved: yeri ya da boyu değişenlerin indeksleri.
 */
export function placeThree(items: readonly SceneThree[], scene: SpotScene): { items: SceneThree[]; moved: number[] } {
  const taken: Box[] = [];
  const moved: number[] = [];
  const out = items.map((t, i) => {
    const grown = { ...t, size: Math.max(t.size, Math.min(minSizeOf(scene), THREE_SPOT.maxSize)) };
    const tryAt = (caption: boolean) => [grown, t].find((c) => spotFits(contentBox(c), scene, taken, caption)) ?? search(t, grown.size, scene, taken, caption);
    const pick = tryAt(true) ?? tryAt(false);
    if (!pick) {
      taken.push(contentBox(t));
      return t;
    }
    if (pick.x !== t.x || pick.y !== t.y || pick.size !== t.size) moved.push(i);
    taken.push(contentBox(pick));
    return pick;
  });
  return { items: out, moved };
}

function search(t: SceneThree, from: number, scene: SpotScene, taken: Box[], caption: boolean): SceneThree | undefined {
  const lo = Math.max(Math.min(minSizeOf(scene), t.size), t.size * THREE_SPOT.shrink);
  const sizes = Array.from({ length: THREE_SPOT.sizes }, (_, n) => Math.round(from - ((from - lo) * n) / (THREE_SPOT.sizes - 1)));
  // Adaylar: kamera uçlarının ikisinde de görünen bölgenin içi (yoksa sahne).
  const x0 = Math.max(0, ...scene.views.map((v) => v.x));
  const y0 = Math.max(0, ...scene.views.map((v) => v.y));
  const x1 = Math.min(1920, ...scene.views.map((v) => v.x + v.w));
  const y1 = Math.min(1080, ...scene.views.map((v) => v.y + v.h));
  const tries: { x: number; y: number; size: number; cost: number }[] = [];
  for (let x = x0; x <= x1; x += THREE_SPOT.step)
    for (let y = y0; y <= y1; y += THREE_SPOT.step)
      for (const size of sizes) tries.push({ x: Math.round(x), y: Math.round(y), size, cost: Math.hypot(x - t.x, y - t.y) + (from - size) * THREE_SPOT.perPx });
  tries.sort((a, b) => a.cost - b.cost);
  const hit = tries.find((c) => spotFits(contentBox(c), scene, taken, caption));
  return hit && { ...t, x: hit.x, y: hit.y, size: hit.size };
}

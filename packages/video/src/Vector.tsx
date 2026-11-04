import {
  applyLineStyle,
  prefixSvgIds,
  resolveLayout,
  RIG,
  RIG_SIDE,
  sideAssetId,
  sanitizeSvg,
  uniqueCharacters,
  type LineStyle,
  type PlacedLayer,
  type RigPart,
  type Timeline,
  type VectorAnim,
  type VectorAnimType,
  type VectorExpression,
  type VectorAsset,
  type VectorLayer,
  type VectorMood,
  type VectorShot,
  type VectorText,
  type Texture,
  type WordTiming,
  STAGE,
  TEXT_RULES,
  textureLayer,
  VERTICAL_SAFE,
} from "@ys/core";
import { useMemo, type CSSProperties } from "react";
import { AbsoluteFill, Easing, Img, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { drawCss, drawPlan } from "./drawOn.ts";
import { Ambience } from "./Ambience.tsx";
import { armBeats, BEAT, pulseAt, speechBeats, strokeAt } from "./beats.ts";
import { CALLOUT, calloutScale, calloutSpot, calloutTarget, overlap, type Box } from "./callout.ts";
import { Figure3D } from "./Figure3D.tsx";
import { clapClosed, GESTURE_RHYTHM, penDown, typingTaps } from "./gesture-timing.ts";
import { Globe3D } from "./Globe3D.tsx";
import { anatomical, flexion, type Strain } from "./anatomy.ts";
import { splitBrows, type BrowPart, type SplitBrows } from "./browShape.ts";
import { bend, reach } from "./ik.ts";
import { revealWindow } from "./kinetic-timing.ts";
import { lipLine, mouthIds, withMouths, type SpeakingMouth } from "./mouthShape.ts";
import { faceOf, type Bounds, type Face } from "./rigGeometry.ts";
import { visemeAt, visemeCues, type Viseme } from "./visemes.ts";
import { splitWords, useKinetic, wordCount } from "./kinetic.tsx";
import { GLOBE_SETTLE, overlayProgress } from "./globe.ts";
import { ARM_GESTURES, FOREARM_LAG, gaitOf, gestureWeight, hop, paceWalks, physicalAnims, type Gait } from "./motion.ts";
import { stageAfter, stageBefore, type StagingProblem } from "./staging.ts";

/**
 * Vektör sahne: Claude'un JSON tarifini deterministik olarak çizer. Bütün hareket burada hesaplanır;
 * karakter iskeleti, yazı efektleri ve kamera için model çağrısı yapılmaz.
 */

type Visual = Timeline["visuals"][number];
type Assets = Timeline["vectorAssets"];

const W = 1920;
const H = 1080;
const ease = Easing.inOut(Easing.cubic);

/** Animasyonun kendi penceresindeki ilerleme (0–1); pencere dışında sınırda kalır. */
function local(p: number, a: VectorAnim): number {
  const span = Math.max(0.0001, a.end - a.start);
  return Math.min(1, Math.max(0, (p - a.start) / span));
}

const active = (p: number, a: VectorAnim) => p >= a.start && p <= a.end;

/** Pencerenin başında ve sonunda yumuşak giriş/çıkış ağırlığı (0–1): jestler aniden başlayıp bitmesin. */
function envelope(p: number, a: VectorAnim, fade = 0.15): number {
  if (!active(p, a)) return 0;
  const q = local(p, a);
  const span = Math.max(0.0001, a.end - a.start);
  const f = Math.min(0.5, fade / span);
  return ease(Math.min(1, q / f, (1 - q) / f));
}

/** Kök <svg>'yi kutuyu dolduracak şekilde ayarlar. */
function fitSvg(svg: string, mode: "meet" | "slice"): string {
  return svg.replace(/<svg\b([^>]*)>/, (_m, attrs: string) => {
    const clean = attrs.replace(/\s(width|height|preserveAspectRatio)="[^"]*"/g, "");
    return `<svg${clean} width="100%" height="100%" preserveAspectRatio="xMidYMid ${mode}" style="overflow:visible">`;
  });
}

interface Transform {
  x: number;
  y: number;
  scale: number;
  rotate: number;
  opacity: number;
}

/**
 * Sevinç (cheer): yumruklar baş hizasında ritimle inip kalkar, gövde aynı saatle seker. Eskiden kollar ±150°'de neredeyse
 * düz (ön kol 15°) iki çubuk gibi "Y" çiziyordu, bilek dışa kırılıyordu ve aynı çekimde sevinen herkes aynı sin(t·6) ile
 * eş zamanlı sallanıyordu (3 Kas, PHP s4-sh6: "bu kolları neden böyle"). Eller hedefe IK ile uzanır (dirsek dışta
 * bükülü); sol el hedefleri (iskelet tuvali; sağ el aynası): pump (yumruk kulak hizasında, dirsek omuz hizasında) ile
 * high (ön kol dik, yumruk başın üstünde) arası pompa. Uzun sevinç sahnelemede kısalır (staging.ts BURST).
 * tempo: rad/sn aralığı (kişiye özgü, tohumdan); lag: sağ elin sol eli geriden izlemesi (rad).
 */
export const CHEER = { high: [70, 114], pump: [100, 178], tempo: [5.2, 6.6], lag: 0.2 } as const;

/** Kişinin sevinç saati (rad): tempo ve evre tohumdan, gövde sekmesi ile yumruk pompası aynısını kullanır. */
export function cheerPhase(seed: string, t: number): number {
  const [lo, hi] = CHEER.tempo;
  return t * (lo + (hi - lo) * random(`${seed}-cheer-tempo`)) + 2 * Math.PI * random(`${seed}-cheer-phase`);
}

/**
 * Alkış: avuçlar göğsün ortasında buluşur (meet: sol avucun değdiği yer; eller birbirini geçmez), açılınca her el open px
 * dışa ve lift px yukarı yay çizer. Ön kollar kameraya uzanır, önden fore kesri boyunda görünür: dirsekler gövdenin
 * yanında kalır, alkışta yalnız ~30 px oynar. Eskiden ön kol açısı sabit, ön kol tam boydu: "kapalı"da eller 18 px
 * birbirini geçip göğüste çapraz duruyordu, "açık"ta aralarında 28 px kalıyordu (3 Kas, PHP s4-sh6).
 */
export const CLAP = { meet: [192, 368], open: 36, lift: 23, fore: 0.6 } as const;

/**
 * Masa başı işler (3 Kas, kullanıcı: "klavye başında ellerini ovuşturuyor gibi"): eski sabit açılarla iki bilek de
 * göğsün önünde aynı noktaya (200, 431) düşüyor, eller üst üste binip her tuşta ters yöne dönüyordu; yazıda kalemli el
 * öbür yana geçip kolları çaprazlıyordu. Bilekler hedefe IK ile, ön kollar kameraya uzanıp kısalmış (fore) gider.
 * Klavye: sol bilek key (sağ ayna, aradaki ~22 cm), tuşta dip px iner, drift px tuşlar arasında kayar; parmaklar aşağı,
 * içe tilt derece (mutlak açı), bilek yana dönmez. Yazı: kalemli el (sağ) pen'den başlayıp satır boyunca line px
 * ilerler, duraklamada satır başına döner; öbür el hold'da kâğıdı tutar.
 */
export const DESK_WORK = {
  key: [167, 428],
  dip: 3,
  drift: 4,
  tilt: 10,
  fore: 0.5,
  pen: [206, 438],
  line: 16,
  hold: [168, 444],
} as const;

/** Katman/yazı düzeyindeki animasyonlar: hepsi zaman ve tohumdan türetilir. dur: çekim süresi (sn), height: katman boyu (px). */
function layerTransform(
  anims: VectorAnim[],
  p: number,
  t: number,
  seed: string,
  base: { x: number; y: number },
  size: { dur: number; height: number } = { dur: 0, height: 0 },
): Transform {
  const tr: Transform = { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 };
  for (const a of anims) {
    const q = local(p, a);
    switch (a.type) {
      case "fade_in":
        tr.opacity *= p < a.start ? 0 : ease(q);
        break;
      case "fade_out":
        tr.opacity *= p > a.end ? 0 : 1 - ease(q);
        break;
      case "slide_in": {
        const k = 1 - Easing.out(Easing.cubic)(q);
        const d = a.from ?? "left";
        if (d === "left") tr.x -= k * (base.x + 400);
        if (d === "right") tr.x += k * (W - base.x + 400);
        if (d === "top") tr.y -= k * (base.y + 400);
        if (d === "bottom") tr.y += k * (H - base.y + 600);
        break;
      }
      case "pop":
        tr.scale *= p < a.start ? 0 : Easing.out(Easing.back(1.8))(q);
        break;
      case "float":
        if (active(p, a)) tr.y += Math.sin(t * 1.6 + random(seed) * 6) * 12;
        break;
      case "sway":
        if (active(p, a)) tr.rotate += Math.sin(t * 1.3 + random(seed) * 6) * 3;
        break;
      case "pulse":
        if (active(p, a)) tr.scale *= 1 + Math.sin(t * 4) * 0.04;
        break;
      case "spin":
        tr.rotate += 360 * q;
        break;
      case "shake":
        if (active(p, a)) {
          tr.x += Math.sin(t * 47) * 8;
          tr.rotate += Math.sin(t * 31) * 1.5;
        }
        break;
      case "cheer":
        // Yumruk pompasıyla aynı saatte seker.
        tr.y -= Math.abs(Math.sin(cheerPhase(seed, t))) * 18 * envelope(p, a);
        break;
      case "surprised":
        // İrkilme: pencere başında bir kez boyunun ~%3,5'i kadar sıçrar ve yerçekimiyle iner (havada asılı kalmaz).
        tr.y -= hop(((p - a.start) * size.dur) / 0.45) * 0.035 * size.height;
        break;
      case "move":
      case "walk": {
        const k = ease(q);
        if (a.toX !== undefined) tr.x += (a.toX - base.x) * k;
        if (a.toY !== undefined) tr.y += (a.toY - base.y) * k;
        break;
      }
      default:
        break;
    }
  }
  return tr;
}

/** İskelet parçası ya da üst gövde (gövde + kollar + baş; kalçadan, `wrapTorso`). */
type PosePart = RigPart | "torso" | BrowPart;

interface PartPose {
  rotate: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}


const STILL: Gait = { steps: 0, amount: 0, dir: 0 };

/** Karakterin dikkati: işaret edeceği nokta ve gözlerinin yönü (iskelet koordinatı; aynalama hesaba katılmış). */
interface Attention {
  /** point hedefi (iskelet tuvali, 400×800). */
  aim?: readonly [number, number];
  /** Hedef bir katmansa onun bu kişiye bakan dikey kenarı (iskelet x): parmak ucu bunun önünde durur. */
  edge?: number;
  /** Sahnedeki en yakın diğer karakterin yönü: −1 sol, 1 sağ. */
  lookDir?: number;
  /** give alıcısının göğsü (iskelet tuvali); yoksa undefined. */
  receiver?: readonly [number, number];
  /** Sağ elinde nesne var: yüze giden jest sol elle yapılır. */
  holding?: boolean;
  /** Anlatımın bu anı (ağız şekli ve vurgular); kelime zamanı yoksa undefined. */
  voice?: Voice;
  /** Çizimin ölçülmüş yüzü (rigGeometry, fitFace): el çeneye, ağız şekli ağzın yerine. */
  face?: FaceFit;
}

/**
 * Anlatımın bu karesi: ağız şekli (vizem) ve konuşma vurguları (beats.ts). Yalnız konuşan karakter kullanır: baş
 * vurguda iner kalkar, öbek başında kaşlar kalkar, el vurgusu vurgulu kelimeye denk gelir.
 */
export interface Voice {
  viseme: Viseme;
  /** Baş vurgusu (0–1). */
  nod: number;
  /** Öbek başında kaş kalkışı (0–1). */
  brow: number;
  /** El vurgusunun genliği (0–1) ve kaçıncı vurgu olduğu (hangi el). */
  stroke: number;
  strokeIndex: number;
}

/** Kol boyları (iskelet): omuzdan dirseğe; dirsekten elin tuttuğu/değdiği noktaya (bilek + elin ortası). */
export const ARM = { upper: RIG.pivots["forearm-r"][1] - RIG.pivots["arm-r"][1], reach: 112 } as const;
/** Yüzü ölçülemeyen çizimde (ve 3D figürde) çene. */
const CHIN: [number, number] = [200, 242];

/** Ölçülen çenenin makul bölgesi (iskelet tuvali): dışındaysa çizim kurala uymuyor, varsayılan çene kullanılır. */
const CHIN_ZONE = { x: [140, 260], y: [180, 330] } as const;

/** Jestlerin kullandığı yüz: çene (doğrulanmış), çene hattının yana uzaklığı (yüz genişliğinden), konuşan ağız. */
export interface FaceFit {
  chin: [number, number];
  jaw: number;
  mouth?: SpeakingMouth;
  /** Ağzın alt kenarı (ölçülen ağız makul çenenin üstündeyse): yüze giden el bunun altında kalır. */
  lips?: number;
  /** Parmak uçlarının elin değme noktasının (ARM.reach) ötesine uzanması, kol başına (çizimden; sınırlı). */
  fingers: { l: number; r: number };
  /** Başın kutusu (saç dahil): ölçülen makulse o, değilse varsayılan (başı kaşıyan el bunun yanına gider). */
  head: Bounds;
}

/** Yüzü ölçülemeyen çizimde (ve 3D figürde) baş kutusu: figürün kafası x 124–276, y 96–256. */
const HEAD_BOX: Bounds = { x: 122, y: 96, w: 156, h: 160 };

/** Ölçülen başın makul boyu (iskelet px): dışındaysa (başa gövde ya da sahne konmuş) varsayılan kutu. */
const HEAD_FIT = { min: 60, maxW: 280, maxH: 300 } as const;

/** Parmakların değme noktasının ötesine uzanması (iskelet px): ölçülemezse rest, ölçüleni [min, max] içinde. */
const FINGERS = { rest: 22, min: 8, max: 60 } as const;

/**
 * Ölçülen ağız makul mü: başın içinde ve ondan çok küçük (başsız çizimde mutlak sınır). Ağız grubuna bıyık, sakal ya da
 * yüzün yarısı konmuşsa konuşurken gizlemek onları da silerdi; o çizimde ağız eski yöntemle ölçeklenir.
 */
const MOUTH_FIT = { width: 0.6, height: 0.4, maxW: 110, maxH: 70 } as const;

/** Ölçülen yüzden jest yüzü: çene makul bölgede değilse ya da yoksa varsayılan; çene hattı yüz genişliğinin ~%28'i. */
export function fitFace(face: Face): FaceFit {
  const [x, y] = face.chin ?? CHIN;
  const inside = x >= CHIN_ZONE.x[0] && x <= CHIN_ZONE.x[1] && y >= CHIN_ZONE.y[0] && y <= CHIN_ZONE.y[1];
  const jaw = Math.min(42, Math.max(26, (face.head?.w ?? 120) * 0.28));
  const chin: [number, number] = inside ? [x, y] : CHIN;
  const m = face.mouth;
  const head = face.head;
  const cx = m && m.x + m.w / 2;
  const cy = m && m.y + m.h / 2;
  const fits =
    m &&
    face.mouthFrame &&
    (head
      ? cx! >= head.x && cx! <= head.x + head.w && cy! >= head.y && cy! <= head.y + head.h && m.w <= head.w * MOUTH_FIT.width && m.h <= head.h * MOUTH_FIT.height
      : m.w <= MOUTH_FIT.maxW && m.h <= MOUTH_FIT.maxH);
  const mouth = fits ? { box: m, frame: face.mouthFrame!, ink: face.mouthInk ?? "#2b1d1d", drop: Math.max(6, chin[1] - lipLine(m!) - 3) } : undefined;
  const lips = inside && m && m.y + m.h < y ? m.y + m.h : undefined;
  const elbowY = RIG.pivots["forearm-r"][1];
  const finger = (low: number | undefined) => (low === undefined ? FINGERS.rest : Math.min(FINGERS.max, Math.max(FINGERS.min, low - elbowY - ARM.reach)));
  // Baş makul çeneyi yatayda kapsamalı ve onun üstünde başlamalı.
  const box =
    inside && head && head.w >= HEAD_FIT.min && head.h >= HEAD_FIT.min && head.w <= HEAD_FIT.maxW && head.h <= HEAD_FIT.maxH && head.x < x && head.x + head.w > x && head.y < y ? head : HEAD_BOX;
  return { chin, jaw, ...(mouth ? { mouth } : {}), ...(lips !== undefined ? { lips } : {}), fingers: { l: finger(face.hands?.l), r: finger(face.hands?.r) }, head: box };
}

/** Yüzü ölçülemeyen kukla (yan görünüş, test). */
const NO_FACE: FaceFit = fitFace({});

/** Çizimin yüz ölçüsü bir kez alınır (aynı varlık her karede aynı nesne); 3D figürün yüzü sabit. */
const faces = new WeakMap<VectorAsset, FaceFit>();
export function faceFor(asset: VectorAsset): FaceFit {
  let f = faces.get(asset);
  if (!f) faces.set(asset, (f = asset.meta.figure ? NO_FACE : fitFace(faceOf(asset.svg))));
  return f;
}

const brows = new WeakMap<VectorAsset, SplitBrows | null>();

/** Çizimin sol ve sağa ayrılmış kaşları (browShape; varlık başına bir kez); ayrılamıyorsa undefined. */
export function browsFor(asset: VectorAsset): SplitBrows | undefined {
  let b = brows.get(asset);
  if (b === undefined) brows.set(asset, (b = splitBrows(asset.svg) ?? null));
  return b ?? undefined;
}

/** İskelet parçalarının bu karedeki pozu: sürekli canlılık + Claude'un istediği jestler. */
/**
 * Yüz ifadeleri: kaş yüksekliği, göz açıklığı ve ağız eğrisi. Ağız gülümseme olarak çizilir; dikey ölçeği eksi olunca
 * ters döner ve somurtmaya dönüşür. head: başın öne düşmesi (px), droop: omuzların düşmesi (derece).
 */
/**
 * Şaşkınlıkta ağız küçük, dar bir "o" olur (mouthW: yatay ölçek). Eskiden gülümseme eğrisi 1,6 kat büyüyordu; kalkan
 * ellerle birlikte izleyici bunu sevinç diye okuyordu (3 Kas, C# incelemesi: "endişeli değil, kollarını kaldırmış neşeli";
 * 21 bölümün 9'unda benzer not).
 */
/** mood: koddan çizilen konuşan ağzın köşeleri (−1 somurtkan … 1 gülen; mouthShape). */
/**
 * Kaş eğimi (browShape; 3 Kas, kare denetçisi: "yüz endişeli görünmüyor" 40 çekimde, "kızgın değil, sakin", "nötr,
 * hafif gülümsüyor"): inner, iç uçların kalkışı (derece; artı endişe ve üzüntünün eğik kaşı, eksi öfkenin indiği ve
 * çatıldığı kaş), knit kaşların birbirine yaklaşması (px). quizzical: düşünürken tek kaş kalkar, öbürü hafif iner (hangisi
 * tohumdan). Kaşlar eskiden yalnız bütün olarak aşağı yukarı kayıyordu; duygu kaşın eğiminden okunur.
 */
const EXPRESSIONS: Record<
  VectorExpression,
  { brows: number; inner: number; knit: number; quizzical?: boolean; eyes: number; mouth: number; mouthW?: number; mood: number; head: number; droop: number; lookX?: number }
> = {
  neutral: { brows: 0, inner: 0, knit: 0, eyes: 1, mouth: 1, mood: 0.3, head: 0, droop: 0 },
  happy: { brows: -4, inner: 3, knit: 0, eyes: 0.9, mouth: 1.35, mood: 0.8, head: -1, droop: 0 },
  sad: { brows: 3, inner: 15, knit: 1, eyes: 0.75, mouth: -0.8, mood: -0.7, head: 6, droop: 6 },
  angry: { brows: 5, inner: -18, knit: 2.5, eyes: 0.8, mouth: -0.45, mood: -0.5, head: 2, droop: -3 },
  worried: { brows: -3, inner: 20, knit: 1.5, eyes: 1.1, mouth: -0.5, mood: -0.4, head: 3, droop: 3 },
  surprised: { brows: -10, inner: 4, knit: 0, eyes: 1.25, mouth: 0.3, mouthW: 0.6, mood: 0, head: -2, droop: 0 },
  thinking: { brows: -2, inner: 0, knit: 0, quizzical: true, eyes: 0.9, mouth: 0.45, mood: 0.15, head: 0, droop: 0, lookX: 6 },
};

/**
 * Düşünürken kalkan tek kaş (iskelet px, derece): kalkan kaş lift px yukarı, dış ucu arch derece daha yukarı (sorgulayan
 * kemer); öbür kaş drop px aşağı, iç ucu frown derece aşağı (yoğunlaşma).
 */
export const QUIZZICAL = { lift: 5, arch: 7, drop: 1, frown: 4 } as const;

/** Kaşın iç ucunu deg derece kaldırır (eksi: indirir). brow-l ekranın solunda: iç ucu sağ ucu, saat yönünün tersiyle kalkar. */
function innerUp(pose: (k: PosePart) => PartPose, side: "l" | "r", deg: number): void {
  pose(`brow-${side}`).rotate += side === "l" ? -deg : deg;
}

/** Düşünen yüzün tek kaşı (k: ağırlık); hangi kaşın kalktığı karakterin tohumundan. */
function quizzical(pose: (k: PosePart) => PartPose, seed: string, k: number): void {
  const up = random(`${seed}-brow`) < 0.5 ? "l" : "r";
  const down = up === "l" ? "r" : "l";
  pose(`brow-${up}`).ty -= QUIZZICAL.lift * k;
  innerUp(pose, up, -QUIZZICAL.arch * k);
  pose(`brow-${down}`).ty += QUIZZICAL.drop * k;
  innerUp(pose, down, -QUIZZICAL.frown * k);
}

/**
 * Ağzı koddan çizilemeyen yüzde (3D figür, ağzı ölçülemeyen çizim) vizemin ağız ölçeği: [genişlik, açıklık]. Sessizlik
 * (X) kapalı ağızdır; D en açık, F en dar.
 */
const VISEME_SCALE: Record<Viseme, [number, number]> = {
  X: [1, 0.35],
  A: [0.95, 0.15],
  B: [0.95, 0.45],
  C: [1, 0.85],
  D: [1.05, 1.25],
  E: [0.72, 1.05],
  F: [0.55, 0.75],
  G: [0.92, 0.35],
  H: [0.95, 0.8],
};

function rigPose(
  anims: VectorAnim[],
  p: number,
  t: number,
  seed: string,
  sitting = false,
  expression: VectorExpression = "neutral",
  gait: Gait = STILL,
  flip = false,
  attention: Attention = {},
  dur = 1,
  /** Yan görünüş çizimi yürüyor (RIG_SIDE). */
  side = false,
): Partial<Record<PosePart, PartPose>> {
  const pose: Partial<Record<PosePart, PartPose>> = {};
  const part = (k: PosePart) => (pose[k] ??= { rotate: 0, sx: 1, sy: 1, tx: 0, ty: 0 });
  const r = (k: string) => random(`${seed}-${k}`);
  const face = EXPRESSIONS[expression];

  // --- her zaman: nefes, baş salınımı, kolların doğal duruşu, göz kırpma ve göz gezdirme
  part("body").sy = 1 + Math.sin(t * 2.2 + r("br") * 6) * 0.01;
  part("head").rotate = Math.sin(t * 0.9 + r("h") * 6) * 2;
  part("head").ty = Math.sin(t * 2.2 + r("br") * 6) * 1.5;
  part("arm-l").rotate = 4 + Math.sin(t * 1.1 + r("al") * 6) * 2;
  part("arm-r").rotate = -4 - Math.sin(t * 1.0 + r("ar") * 6) * 2;
  part("forearm-l").rotate = -10 - Math.sin(t * 1.3 + r("fl") * 6) * 3;
  part("forearm-r").rotate = 10 + Math.sin(t * 1.2 + r("fr") * 6) * 3;
  // Bilek ön kolu geriden izler (gevşek el): ön kolun salınımıyla aynı ritim, biraz gecikmeli.
  part("hand-l").rotate = 6 + Math.sin(t * 1.3 + r("fl") * 6 - 0.8) * 4;
  part("hand-r").rotate = -6 - Math.sin(t * 1.2 + r("fr") * 6 - 0.8) * 4;
  // Üst gövde kalçadan yavaşça bir yandan öbürüne ağırlık aktarır: kollar ve baş gövdeyle birlikte gider. Eskiden
  // gövde hiç oynamıyor, yalnız kollar dönüyordu; karakter kâğıt kukla gibi duruyordu (1 Kas).
  part("torso").rotate = Math.sin(t * 0.55 + r("sw") * 6) * 1.6;
  if (attention.holding && !side) {
    // Elde nesne: ön kol kalkar, nesne göğüs hizasında yana doğru gösterilir (sarkan elde kalça hizasında küçük kalıyor,
    // izleyici fark etmiyordu; Apple bölümü incelemesi, 1 Kas). Jestler bu duruşun üstüne karışır.
    part("arm-r").rotate = -HOLD_POSE.arm - Math.sin(t * 1.0 + r("ar") * 6) * 1.5;
    part("forearm-r").rotate = -HOLD_POSE.forearm - Math.sin(t * 1.2 + r("fr") * 6) * 3;
    part("hand-r").rotate = 0;
  }
  // İfade taban pozdur; jestler bunun üstüne karışır.
  part("brows").ty = face.brows;
  innerUp(part, "l", face.inner);
  innerUp(part, "r", face.inner);
  part("brow-l").tx = face.knit;
  part("brow-r").tx = -face.knit;
  if (face.quizzical) quizzical(part, seed, 1);
  part("eyes").sy = face.eyes;
  part("mouth").sy = face.mouth;
  part("mouth").sx = face.mouthW ?? 1;
  part("head").ty += face.head;
  part("arm-l").rotate -= face.droop;
  part("arm-r").rotate += face.droop;
  const blinkEvery = 3 + r("b") * 2.5;
  if ((t + r("bp") * blinkEvery) % blinkEvery < 0.12) part("eyes").sy = 0.1;
  // Bakış her ~2,5 sn'de bir yön değiştirir; düşünürken bir yana sabitlenir. Sahnede başka biri varsa çoğunlukla ona
  // bakar (ara ara kameraya döner): rastgele gezinen gözler karakterleri birbirinden kopuk gösteriyordu.
  const look = Math.floor(t / 2.5 + r("lk") * 3);
  const glance = random(`${seed}-look-${look}`);
  part("eyes").tx = face.lookX ?? (attention.lookDir && glance < 0.75 ? attention.lookDir * 5 + (glance - 0.375) * 3 : (glance - 0.5) * 8);

  // --- kendiliğinden jest: kolu meşgul eden bir animasyon yoksa ara ara anlatır gibi el hareketi
  // Dinleyenin dinlenme pozu (çekim boyunca): serbest, bir eli belde ya da elleri önde kavuşmuş. Bir sıra insanın hepsi
  // kollar yanda aynı pozda duruyordu (inceleme: "stiff lineup"). Jest yapan, konuşan, bir şey tutan, oturan, yürüyen
  // ya da yandan görünen için yok; pozdaki kişi kendiliğinden el hareketi yapmaz.
  const rest: RestPose =
    sitting || side || attention.holding || anims.some((a) => ARM_GESTURES.includes(a.type) || a.type === "talk" || a.type === "walk") ? "relaxed" : restPoseOf(seed);
  // Kolların serbestliği (0–1): yürüyüş ve kol jesti girdikçe azalır, bitince yavaşça geri gelir. Eskiden açık/kapalı bir
  // koşuldu: yürüyüş durunca ya da jestin penceresi kapanınca yarıdaki kendiliğinden el hareketi tek karede tam güçle
  // beliriyordu (3 Kas denetimi: çekimlerin %30'unda ön kol bir karede 25–70° sıçrıyordu).
  const armWeight = Math.max(0, ...anims.filter((a) => ARM_GESTURES.includes(a.type)).map((a) => Math.min(1, Math.max(0, gestureWeight(p, a, dur)))));
  // Yürüyüş de: başlamadan 1 sn önce susar, bitince 0,6 sn'de geri gelir (adım genliği hızdan gelir; yürüyüş yavaş
  // başladığı için ilk karelerde sıfırdı, kalkık el 3 karede iniyordu).
  const walking = Math.max(0, ...anims.filter((a) => a.type === "walk").map((a) => nearness(p, a, dur, 1, 0.6)));
  const free = rest === "relaxed" ? Math.max(0, 1 - Math.max(gait.amount, walking)) * (1 - armWeight) : 0;
  // Konuşuyor (talk penceresinde) ve kelime zamanı var: jestler sesin vurgularına bağlanır.
  const talking = Math.max(0, ...anims.filter((a) => a.type === "talk").map((a) => Math.min(1, gestureWeight(p, a, dur))));
  const voice = talking > 0 ? attention.voice : undefined;
  if (free > 0) {
    // Konuşurken el, öbek başındaki vurgulu kelimede en uçta olacak şekilde kalkar; yoksa ara ara (rastgele zamanlı).
    const every = 4 + r("g") * 2.5;
    const phase = (t + r("gp") * every) % every;
    const k = (voice ? voice.stroke * talking : phase < 1.4 ? Math.sin((phase / 1.4) * Math.PI) : 0) * free;
    const which = voice ? voice.strokeIndex : Math.floor((t + r("gp") * every) / every);
    if (k > 0) {
      // Sağ el nesne tutuyorsa kendiliğinden jest sol elle yapılır.
      const right = !attention.holding && random(`${seed}-gs-${which}`) < 0.6;
      // El dışa, avuç yukarı açılır. (Eski işaretler ters: el karna gidiyordu.) Dönüş ekranda saat yönü artıdır; sarkan
      // kol artıda ekranın soluna döner, yani sağdaki kol (arm-r) eksiyle, soldaki artıyla dışa açılır.
      if (right) {
        part("arm-r").rotate -= 14 * k;
        part("forearm-r").rotate -= 62 * k + Math.sin(t * 5) * 6 * k;
        part("hand-r").rotate -= 22 * k;
      } else {
        part("arm-l").rotate += 14 * k;
        part("forearm-l").rotate += 62 * k + Math.sin(t * 5) * 6 * k;
        part("hand-l").rotate += 22 * k;
      }
      part("brows").ty = face.brows - 3 * k;
    }
  }

  if (sitting) {
    // Ön görünüşte oturuş: uyluk kısalır, baldır dik kalır (iç içe grup; ebeveynin ölçeği geri alınır).
    for (const leg of ["l", "r"] as const) {
      part(`leg-${leg}`).sy = SIT_THIGH;
      part(`shin-${leg}`).sy = 1 / SIT_THIGH;
    }
  }

  if (side) {
    // Yan görünüşte yürüyüş (sağa bakan çizim; öne = eksi dönüş): bacaklar kalçadan öne-arkaya salınır, arkada kalan
    // bacağın dizi bükülür, kollar karşı bacakla salınır. Profilde göz kaymaz.
    const s = Math.sin(Math.PI * gait.steps);
    const k = gait.amount;
    part("leg-r").rotate = -24 * s * k;
    part("leg-l").rotate = 24 * s * k;
    part("shin-r").rotate = 30 * Math.max(0, -s) * k;
    part("shin-l").rotate = 30 * Math.max(0, s) * k;
    part("arm-r").rotate = 20 * s * k;
    part("arm-l").rotate = -20 * s * k;
    part("forearm-r").rotate = -14 * k;
    part("forearm-l").rotate = -14 * k;
    if (attention.holding) {
      // Elde nesne: yakın kol öne bükülü kalır, nesne göğüs önünde taşınır (öne = eksi; ön görünüşteki tutuşla aynı
      // açılar, 3D figür dönerken kol sıçramaz). Eskiden yan pozda tutuş yoktu: profile geçen karede ön kol 60° düşüyor,
      // nesne elle birlikte aşağı iniyordu (3 Kas denetimi).
      part("arm-r").rotate = -HOLD_POSE.arm + 2 * s * k;
      part("forearm-r").rotate = -HOLD_POSE.forearm;
      part("hand-r").rotate = 0;
    }
    part("eyes").tx = 0;
    // Yürürken gövde öne (sağa bakan çizimde saat yönü) eğilir.
    part("torso").rotate += 4 * k;
  } else if (gait.amount > 0) {
    // Ön görünüşte adım: diz öne gelir, uyluk kısalır ve ayak yerden kalkar (baldır boyunu korur); bacak gidiş yönüne
    // hafifçe açılır. Eski makas salınımı (±22°) bacakları çaprazlıyor ve hızdan bağımsız olduğu için ayak kayıyordu.
    const s = Math.sin(Math.PI * gait.steps);
    const toward = gait.dir * (flip ? -1 : 1);
    for (const [leg, lift] of [
      ["l", Math.max(0, s)],
      ["r", Math.max(0, -s)],
    ] as const) {
      const k = lift * gait.amount;
      part(`leg-${leg}`).sy = 1 - 0.3 * k;
      part(`shin-${leg}`).sy = 1 / (1 - 0.3 * k);
      part(`leg-${leg}`).rotate = toward * 7 * k;
    }
    // Kollar karşı bacakla birlikte salınır; gövde gidiş yönüne eğilir ve adımla yana yaslanır.
    part("arm-l").rotate -= 6 * s * gait.amount;
    part("arm-r").rotate -= 6 * s * gait.amount;
    part("torso").rotate += (toward * 2.5 + s * 1.5) * gait.amount;
  }

  // --- duruş (kontrapost): ağırlık bir bacakta, öbür diz gevşek; üst gövde ağırlığın üstüne gelir, baş dengeler, gevşek
  // taraftaki dirsek biraz daha bükülür. Ağırlık arada öbür bacağa geçer. Simetrik dimdik duruş durağan karede kaskatı
  // okunuyordu (kare denetçisi, 3 Kas: incelenen sekiz bölümün hepsinde "stands stiffly").
  if (!sitting && !side) {
    const k = stanceAt(t, seed) * (1 - gait.amount);
    const onL = Math.max(0, k);
    const onR = Math.max(0, -k);
    // Dönüş saat yönü artı: soldaki bacak artıyla dışa, sağdaki eksiyle dışa açılır. Gevşek bacakta diz dışa, ayak içe.
    part("leg-l").rotate += -STANCE.inward * onL + STANCE.out * onR;
    part("leg-r").rotate += STANCE.inward * onR - STANCE.out * onL;
    part("shin-l").rotate -= STANCE.knee * onR;
    part("shin-r").rotate += STANCE.knee * onL;
    part("torso").rotate -= STANCE.torso * k;
    part("head").rotate += STANCE.head * k;
    if (!attention.holding) part("forearm-r").rotate += STANCE.elbow * onL;
    part("forearm-l").rotate -= STANCE.elbow * onR;
  }
  if (rest === "hip") {
    // Bir el belde (hands_on_hips'in tek kolu); öbür kol serbest.
    const hand = random(`${seed}-rh`) < 0.5 ? "l" : "r";
    const out = hand === "r" ? -1 : 1;
    part(`arm-${hand}`).rotate = out * 30;
    part(`forearm-${hand}`).rotate = -out * 65;
    part(`hand-${hand}`).rotate = 0;
  } else if (rest === "clasped") {
    // Eller karnın önünde kavuşur (IK: iki el de göbeğin önüne, birbirine değecek kadar yakın).
    for (const hand of ["l", "r"] as const) {
      const ik = reach(RIG.pivots[`arm-${hand}`], [RIG.width / 2 + (hand === "r" ? 6 : -6), REST.clasp], ARM.upper, ARM.reach);
      part(`arm-${hand}`).rotate = ik.arm;
      part(`forearm-${hand}`).rotate = ik.forearm;
      part(`hand-${hand}`).rotate = 0;
    }
  }

  // --- Claude'un istediği jestler: hazırlık + taşmayla girer (gestureWeight), ön kol üst kolu geriden izler.
  for (const a of anims) {
    const arm = gestureWeight(p, a, dur);
    const fore = gestureWeight(p, a, dur, FOREARM_LAG);
    if (arm === 0 && fore === 0) continue;
    // Baş sallama ve konuşma genliği taşmaz.
    const w = Math.min(1, Math.max(0, arm));
    const mix = (k: PosePart, field: keyof PartPose, target: number) => {
      // Yan görünüşte kollar yürür; ön görünüş için tasarlanmış kol jestleri uygulanmaz (yüz ve baş jestleri sürer).
      if (side && /arm-/.test(k)) return;
      const pp = part(k);
      const wk = k.startsWith("forearm-") ? fore : arm;
      pp[field] = pp[field] * (1 - wk) + target * wk;
    };
    switch (a.type) {
      case "wave":
        mix("arm-r", "rotate", -150);
        mix("forearm-r", "rotate", Math.sin(t * 9) * 28);
        // Bilek sallamayı geriden izler (kamçı gibi).
        mix("hand-r", "rotate", Math.sin(t * 9 - 0.9) * 30);
        mix("brows", "ty", -4);
        // El sallarken gövde öbür yana yaslanır, sallamayla hafifçe sallanır.
        mix("torso", "rotate", -4 + Math.sin(t * 9) * 1);
        break;
      case "point": {
        // Hedefe doğru: hedef hangi yandaysa o yandaki kol, omuzdan hedefe uzanır; baş ve gözler de hedefe döner.
        // Hedefsiz işaret buraya gelmez (sahneleme anlatmaya çevirir); savunma olarak öne-yana yatay.
        /* v8 ignore next -- hedefsiz point stageAfter (staging.ts) ile explain olur */
        const [ax, ay] = attention.aim ?? [RIG.width * 3, RIG.pivots["arm-r"][1]];
        const hand = ax >= RIG.width / 2 ? "r" : "l";
        const [sx, sy] = RIG.pivots[`arm-${hand}`];
        const toward = hand === "r" ? 1 : -1;
        // Hedef kol boyundan yakınsa dirsek bükülür, parmak ucu nesnenin yakın kenarının önünde durur: düz kol eli
        // nesnenin üstüne bindiriyordu (konuşma mesafesiyle kişiler eşyaya yaklaşınca ekranı elle kapatıyordu, 3 Kas).
        // Kenar omzun gerisindeyse (kişi nesnenin önünde) düz kol nesnenin üstünden gösterir.
        const dx = ax - sx;
        const dy = ay - sy;
        const len = Math.hypot(dx, dy);
        const edge = attention.edge;
        const fingers = (attention.face ?? NO_FACE).fingers[hand];
        const along = edge !== undefined && dx * toward > 0 ? ((edge - toward * (fingers + POINT.gap) - sx) / dx) * len : Infinity;
        const full = ARM.upper + ARM.reach;
        const near = along > 0 && along < full ? reach([sx, sy], [sx + (dx / len) * Math.max(along, full * POINT.min), sy + (dy / len) * Math.max(along, full * POINT.min)], ARM.upper, ARM.reach) : undefined;
        mix(`arm-${hand}`, "rotate", near ? near.arm : (Math.atan2(-dx, dy) * 180) / Math.PI);
        mix(`forearm-${hand}`, "rotate", near ? near.forearm : -6 * toward);
        mix(`hand-${hand}`, "rotate", 0);
        mix("head", "rotate", -4 * toward);
        mix("eyes", "tx", 5 * toward);
        // Gövde hedefe doğru uzanır.
        mix("torso", "rotate", 6 * toward);
        break;
      }
      case "explain": {
        // Anlatırken baskın el konuşulan kişiye (yoksa sağa) avuç yukarı açılır ve konuşma ritmiyle iner kalkar; öbür el
        // kalça hizasında küçük bir eşlik yapar. İki kolun birden omuz hizasında açılması "ta-da" gibi duruyordu.
        const dom = (attention.lookDir ?? 1) >= 0 ? "r" : "l";
        const other = dom === "r" ? "l" : "r";
        // Sağdaki kol (r) eksiyle, soldaki artıyla dışa açılır.
        const out = dom === "r" ? -1 : 1;
        // Konuşurken el vurgulu kelimede aşağı vurur (jest vurgusu), arada kalkık durur; yoksa sabit ritim.
        const beat = voice ? 0.5 - 1.5 * voice.nod : Math.sin(t * 3.4);
        mix(`arm-${dom}`, "rotate", out * (20 + (voice ? beat * 3 : Math.sin(t * 3) * 5)));
        mix(`forearm-${dom}`, "rotate", out * (60 + beat * 12));
        // Avuç yukarı-dışa döner, vurguyla bilek kıvrılır (bilek ön kolu geriden izler).
        mix(`hand-${dom}`, "rotate", out * (26 + (voice ? beat : Math.sin(t * 3.4 - 0.7)) * 12));
        mix(`arm-${other}`, "rotate", -out * (8 + Math.sin(t * 2.6 + 1) * 3));
        mix(`forearm-${other}`, "rotate", -out * (28 + Math.sin(t * 3 + 1) * 8));
        mix("brows", "ty", -3 + Math.sin(t * 3) * 2);
        // Dinleyene eğilir, vurgularla öne gelir; baş anlatırken yana eğilir.
        mix("torso", "rotate", -out * (5 + Math.sin(t * 3) * 1.5));
        mix("head", "rotate", -out * (3 + Math.sin(t * 2.2) * 2));
        break;
      }
      case "think": {
        // Sağ el nesne tutuyorsa sol el yüze/başa gider; yoksa tutulan defter yüzü kapatıyordu.
        const hand = attention.holding ? -1 : 1;
        const side = hand > 0 ? "r" : "l";
        // Çekim başına üç duruştan biri (thinkPoseOf): yönetmen bölüm başına 6–13 çekimde düşündürüyor, hep aynı duruş
        // tekrar ediyordu (3 Kas).
        const how = thinkPoseOf(seed, attention.holding);
        // Düşünen yüz: tek kaş kalkar (ifade zaten düşünceliyse ikinci kez değil).
        if (!face.quizzical) quizzical(part, seed, w);
        if (how === "scratch") {
          // Başını kaşır: el başın yanına, üst üçte birine gider (saçın içine), dirsek dışa ve yukarı açılır (IK, dış
          // çözüm; aşağıdaki çözüm ön kolu yüzün önünden geçirirdi). Kol başın arkasında kalır: el başın kenarından görünür.
          // Kaşıma aralıklıdır: kısa sürelerle bilek ve ön kol hızlıca gidip gelir. Bakış yukarı, öbür yana; kaşlar kalkık.
          const { head } = attention.face ?? NO_FACE;
          const at: [number, number] = [head.x + head.w * (0.5 + (SCRATCH.x / 2) * hand), head.y + head.h * SCRATCH.y];
          const ik = reach(RIG.pivots[`arm-${side}`], at, ARM.upper, ARM.reach, hand);
          const rub = Math.sin(t * SCRATCH.rate) * Math.max(0, Math.sin(t * SCRATCH.burst));
          mix(`arm-${side}`, "rotate", ik.arm);
          mix(`forearm-${side}`, "rotate", ik.forearm + rub * SCRATCH.fore * hand);
          mix(`hand-${side}`, "rotate", (rub * SCRATCH.rub - SCRATCH.curl) * hand);
          mix("head", "rotate", -3 * hand);
          mix("eyes", "tx", -4 * hand);
          mix("eyes", "ty", -3);
          mix("brows", "ty", -6);
          mix("mouth", "sx", 0.8);
          mix("torso", "rotate", -1.5 * hand);
          break;
        }
        if (how === "ponder") {
          // Kollar kavuşuk, baş hafif kalkık ve bir yana yatık, gözler yukarıda bir noktada; baş yavaşça salınır.
          const look = random(`${seed}-think-look`) < 0.5 ? -1 : 1;
          for (const [k, field, v] of CROSSED) mix(k, field, v);
          mix("head", "rotate", 7 * look + Math.sin(t * 0.9) * 1.5);
          mix("head", "ty", -2);
          mix("eyes", "tx", 5 * look);
          mix("eyes", "ty", -4);
          mix("brows", "ty", -5);
          mix("mouth", "sx", 0.85);
          mix("torso", "rotate", -look);
          break;
        }
        // "Düşünen adam" (ölçülen yüz): el çizimin kendi çenesinin altına gelir, ön kol göğsün önünde hafif yatık dikilir,
        // dirsek göğsün altında; üst kol oraya kameraya uzanarak kısalır (bend). Öbür el bu dirseği alttan tutar. Eskiden el
        // çenenin yanındaydı ve üst kol tam boydu: dirsek omuz hizasında göğsün karşı yanına gidiyor, iki kol göğsü yatay
        // çizgilerle kesiyordu (3 Kas, React incelemesi: her sahnede kötü). Kol bu çekimde başın önüne alınır (armInFront):
        // çizimde baş kollardan sonra geldiği için el çenenin arkasında kalıyordu.
        // Parmak uçları ağzın altında kalır: uzun elli çizimde el ağzı kapatıyor, şaşkınlık ("eliyle ağzını kapattı")
        // gibi okunuyordu.
        const { chin, jaw, lips, fingers } = attention.face ?? NO_FACE;
        const below = lips === undefined ? -Infinity : lips + THINK.gap + fingers[side];
        const at: [number, number] = [chin[0] + jaw * THINK.x * hand, Math.max(chin[1] + THINK.y, below)];
        const lean = (THINK.lean * Math.PI) / 180;
        // Dirsek 3B'de en çok THINK.flex bükülür (anatomy.ts): çenesi omza yakın çizimde tam boy ön kol dikilince üst kol
        // da tam boy kalıyor, dirsek 158° katlanıyordu (3 Kas ölçümü, 5 bölüm). Gerçekte dirsek öne, kameraya gelir: ön kol
        // da kameraya uzanıp kısalır, bükülme sınırın altına inene dek.
        const arm = (fore: number) => {
          const elbow: [number, number] = [at[0] + Math.sin(lean) * ARM.reach * fore * hand, at[1] + Math.cos(lean) * ARM.reach * fore];
          return bend(RIG.pivots[`arm-${side}`], elbow, at, ARM.upper, ARM.reach * fore, THINK.min);
        };
        let fore = 1;
        let main = arm(fore);
        while (fore > THINK.fore + 1e-9 && flexion(main.scale, fore, main.forearm) > THINK.flex) main = arm((fore -= 0.02));
        mix(`arm-${side}`, "rotate", main.arm);
        mix(`arm-${side}`, "sy", main.scale);
        mix(`forearm-${side}`, "rotate", main.forearm);
        mix(`forearm-${side}`, "sy", fore);
        // Parmaklar çeneye doğru.
        mix(`hand-${side}`, "rotate", -5 * hand);
        if (hand > 0) {
          const support = reach(RIG.pivots["arm-l"], [main.elbow[0], main.elbow[1] + THINK.support], ARM.upper, ARM.reach);
          mix("arm-l", "rotate", support.arm);
          mix("forearm-l", "rotate", support.forearm);
          // Avuç yukarı, dirseği taşır.
          mix("hand-l", "rotate", -25);
        }
        // Baş çeneyi tutan ele yaslanır.
        mix("head", "rotate", 7 * hand);
        mix("brows", "ty", -5);
        mix("eyes", "tx", 5);
        // Düşünürken çeneyi tutan elin tarafına yaslanır.
        mix("torso", "rotate", -2 * hand);
        break;
      }
      case "cheer": {
        const phase = cheerPhase(seed, t);
        (["l", "r"] as const).forEach((s, i) => {
          // Yumruk sekmenin tepesinde en yukarıda; sağ el biraz geriden.
          const u = Math.abs(Math.sin(phase - i * CHEER.lag));
          const x = CHEER.pump[0] + (CHEER.high[0] - CHEER.pump[0]) * u;
          const y = CHEER.pump[1] + (CHEER.high[1] - CHEER.pump[1]) * u;
          const k = reach(RIG.pivots[`arm-${s}`], [s === "l" ? x : RIG.width - x, y], ARM.upper, ARM.reach, s === "l" ? -1 : 1);
          mix(`arm-${s}`, "rotate", k.arm);
          mix(`forearm-${s}`, "rotate", k.forearm);
          // Bilek düz (yumruk ön kolun ucunda); eskiden dışa kırılıyordu.
          mix(`hand-${s}`, "rotate", 0);
        });
        mix("brows", "ty", -8);
        mix("mouth", "sy", 1.5);
        // Sevinçte gövde gerilir, pompayla hafifçe yana sallanır.
        mix("torso", "sy", 1.03);
        mix("torso", "rotate", Math.sin(phase) * 2.5);
        break;
      }
      case "surprised":
        // İrkilme: sağ el göğse gider (ön kol kameraya uzanır, kısalır), sol el aşağıda yana açılır. Eskiden iki el omuz
        // hizasında açılıyordu; izleyici bunu sevinç/zafer diye okuyordu (3 Kas, C# incelemesi: "endişeli değil, kollarını
        // kaldırmış neşeli").
        mix("arm-r", "rotate", 10);
        mix("forearm-r", "rotate", 134);
        mix("forearm-r", "sy", FORESHORTEN);
        mix("hand-r", "rotate", 10);
        mix("arm-l", "rotate", 22);
        mix("forearm-l", "rotate", 38);
        // Açık avuç dışa.
        mix("hand-l", "rotate", 24);
        mix("head", "ty", -3);
        mix("brows", "ty", -10);
        mix("eyes", "sy", 1.25);
        mix("mouth", "sy", 0.3);
        mix("mouth", "sx", 0.6);
        // Şaşkınlıkta geri çekilir (baktığı yönün tersine) ve dikleşir.
        mix("torso", "rotate", -6 * (attention.lookDir ?? 1));
        mix("torso", "sy", 1.02);
        break;
      case "shrug":
        // Omuzlar kalkar, ön kollar dışa yatay açılır (avuç yukarı), baş yana eğilir.
        mix("arm-l", "rotate", 16);
        mix("arm-r", "rotate", -16);
        mix("arm-l", "ty", -7);
        mix("arm-r", "ty", -7);
        mix("forearm-l", "rotate", 62);
        mix("forearm-r", "rotate", -62);
        mix("hand-l", "rotate", 18);
        mix("hand-r", "rotate", -18);
        mix("head", "rotate", -6);
        mix("brows", "ty", -6);
        // Omuzlar kalkınca baş omuzların arasına iner.
        mix("head", "ty", 6);
        break;
      // --- iş jestleri. Kol açıları ekranda saat yönü artı: sağ kol (r) artıda içe, sol kol (l) artıda dışa döner. Açılar
      // iskeletten hesaplı (omuz x 140/260, dirsek +100, bilek +90 px): eller gövdenin önünde buluşur, çaprazlanmaz (ilk
      // denemede ön kollar X çiziyordu). Masada ön kol kameraya doğru uzanır: önden bakışta kısalır (sy).
      case "typing": {
        // Bilekler dirsek hizasının biraz altında klavyenin iki yarısında (masanın üstünde görünür); tuşa basan el biraz
        // iner, eller tuşlar arasında kayar; parmaklar klavyeye iner, bilek yana dönmez. Baş ve gözler klavyeye eğik.
        const taps = typingTaps(t);
        (["l", "r"] as const).forEach((s, i) => {
          const out = s === "l" ? -1 : 1;
          const x = DESK_WORK.key[0] + Math.sin(t * (1.3 + 0.4 * i) + i * 2) * DESK_WORK.drift;
          const k = reach(RIG.pivots[`arm-${s}`], [s === "l" ? x : RIG.width - x, DESK_WORK.key[1] + DESK_WORK.dip * taps[i]!], ARM.upper, ARM.reach * DESK_WORK.fore);
          mix(`arm-${s}`, "rotate", k.arm);
          mix(`forearm-${s}`, "rotate", k.forearm);
          mix(`forearm-${s}`, "sy", DESK_WORK.fore);
          // Mutlak açı: parmaklar aşağı, biraz içe (sol el sağa, sağ el sola).
          mix(`hand-${s}`, "rotate", out * DESK_WORK.tilt - k.arm - k.forearm);
        });
        mix("head", "ty", 4);
        mix("brows", "ty", 2);
        mix("torso", "rotate", Math.sin(t * 1.7) * 0.8);
        break;
      }
      case "writing": {
        // Kalemli el gövdenin önünde masada, satır boyunca küçük hızlı kıvrımlar; öbür el kâğıdı tutar; baş eğik.
        const pen = penDown(t);
        // Satırda ilerleme: yazarken soldan sağa, duraklamada (satır başı) geri.
        const { strokeSec, pauseSec } = GESTURE_RHYTHM;
        const u = (t % (strokeSec + pauseSec)) / strokeSec;
        const along = u <= 1 ? u : 1 - (u - 1) * (strokeSec / pauseSec);
        const pr = reach(
          RIG.pivots["arm-r"],
          [DESK_WORK.pen[0] + DESK_WORK.line * along, DESK_WORK.pen[1] + Math.sin(t * 17) * 1.5 * pen],
          ARM.upper,
          ARM.reach * FORESHORTEN,
        );
        mix("arm-r", "rotate", pr.arm);
        mix("forearm-r", "rotate", pr.forearm);
        mix("forearm-r", "sy", FORESHORTEN);
        // Kalem ucu kâğıda: parmaklar aşağı-içe; harf kıvrımları bilekte.
        mix("hand-r", "rotate", 15 + Math.sin(t * 23) * 6 * pen - pr.arm - pr.forearm);
        const hl = reach(RIG.pivots["arm-l"], [DESK_WORK.hold[0], DESK_WORK.hold[1]], ARM.upper, ARM.reach * FORESHORTEN);
        mix("arm-l", "rotate", hl.arm);
        mix("forearm-l", "rotate", hl.forearm);
        mix("forearm-l", "sy", FORESHORTEN);
        mix("hand-l", "rotate", -20 - hl.arm - hl.forearm);
        mix("head", "ty", 5);
        mix("head", "rotate", 4);
        mix("eyes", "tx", -3);
        break;
      }
      case "reading": {
        // Kitap/sayfa iki elle göğüs önünde (dirsekler hafif açık, ön kollar öne uzanır); baş eğik, gözler satırları izler.
        mix("arm-l", "rotate", 10);
        mix("arm-r", "rotate", -10);
        mix("forearm-l", "rotate", -104);
        mix("forearm-r", "rotate", 104);
        mix("forearm-l", "sy", FORESHORTEN);
        mix("forearm-r", "sy", FORESHORTEN);
        mix("hand-l", "rotate", -10);
        mix("hand-r", "rotate", 10);
        mix("head", "ty", 4);
        mix("eyes", "tx", Math.sin(t * 2.4) * 4);
        mix("eyes", "sy", 0.85);
        break;
      }
      case "show":
        // Elindeki nesneyi herkes görsün diye sağ elle yukarı kaldırır; gövde öbür yana yaslanır, yüz açılır.
        mix("arm-r", "rotate", -132 + Math.sin(t * 2) * 3);
        mix("forearm-r", "rotate", -12);
        mix("hand-r", "rotate", 0);
        mix("arm-l", "rotate", 6);
        mix("brows", "ty", -6);
        mix("mouth", "sy", 1.3);
        mix("torso", "rotate", -4);
        break;
      case "clap": {
        // Dirsekler dışa, eller göğüs önünde ritimle birleşir (efekt sesiyle aynı saat); açılırken eller yukarı yay çizer.
        const open = 1 - clapClosed(t);
        (["l", "r"] as const).forEach((s) => {
          const x = CLAP.meet[0] - CLAP.open * open;
          const k = reach(RIG.pivots[`arm-${s}`], [s === "l" ? x : RIG.width - x, CLAP.meet[1] - CLAP.lift * open], ARM.upper, ARM.reach * CLAP.fore);
          mix(`arm-${s}`, "rotate", k.arm);
          mix(`forearm-${s}`, "rotate", k.forearm);
          mix(`forearm-${s}`, "sy", CLAP.fore);
          // Parmaklar yukarı, avuçlar karşı karşıya.
          mix(`hand-${s}`, "rotate", s === "l" ? -12 : 12);
        });
        mix("brows", "ty", -5);
        mix("mouth", "sy", 1.35);
        mix("torso", "sy", 1.01 - 0.01 * open);
        break;
      }
      case "hands_on_hips":
        // Dirsekler dışa, eller kalçada: kendinden emin, kafa tutan duruş.
        mix("arm-l", "rotate", 30);
        mix("arm-r", "rotate", -30);
        mix("forearm-l", "rotate", -65);
        mix("forearm-r", "rotate", 65);
        mix("hand-l", "rotate", -12);
        mix("hand-r", "rotate", 12);
        mix("torso", "sy", 1.02);
        mix("head", "rotate", Math.sin(t * 0.8) * 2);
        break;
      case "arms_crossed":
        // Ön kollar göğsün altında yatay, üst üste; eller karşı kolun altına kıvrılır. Şüpheci, bekleyen; kaş çatık.
        for (const [k, field, v] of CROSSED) mix(k, field, v);
        mix("brows", "ty", 3);
        mix("head", "rotate", -5);
        break;
      case "nod": {
        // Evet: baş öne iner kalkar; gözler ve kaşlar başın içinde biraz daha iner (öne eğilme). Eskiden baş yana
        // sallanıyordu (yan eğilme), onay gibi okunmuyordu.
        const down = Math.max(0, Math.sin(t * 7)) * w;
        part("head").ty += 4 * down;
        part("eyes").ty += 2 * down;
        part("brows").ty += 2 * down;
        break;
      }
      case "shake_head": {
        // Hayır: baş iki yana döner (yüz özellikleri başın içinde yana kayar), gözler aynı yöne.
        const turn = Math.sin(t * 13) * w;
        part("head").tx += 3 * turn;
        part("head").rotate += 1.5 * turn;
        part("eyes").tx += 4 * turn;
        part("brows").tx += 3 * turn;
        part("mouth").tx += 3 * turn;
        mix("brows", "ty", face.brows + 2);
        // Kaşlar çatılır: iç uçlar iner.
        innerUp(part, "l", -8 * w);
        innerUp(part, "r", -8 * w);
        break;
      }
      case "give": {
        // Nesneyi karşıdakine uzatır: tutan el (sağ; boşsa alıcı tarafındaki el) bel-göğüs hizasında alıcıya doğru uzanır,
        // dirsek hafif bükük (IK), avuç yukarı; baş, gözler ve gövde alıcıya döner. Elde tutulan nesne eli izler.
        const [rx] = attention.receiver ?? [RIG.width * 2, 0];
        const toward = rx >= RIG.width / 2 ? 1 : -1;
        const hand = attention.holding || toward > 0 ? "r" : "l";
        const shoulder = RIG.pivots[`arm-${hand}`];
        const span = (ARM.upper + ARM.reach) * GIVE.reach;
        const len = Math.hypot(1, GIVE.drop);
        const ik = reach(shoulder, [shoulder[0] + (toward * span) / len, shoulder[1] + (GIVE.drop * span) / len], ARM.upper, ARM.reach);
        mix(`arm-${hand}`, "rotate", ik.arm);
        mix(`forearm-${hand}`, "rotate", ik.forearm);
        mix(`hand-${hand}`, "rotate", -toward * 15);
        mix("eyes", "tx", 5 * toward);
        mix("torso", "rotate", 4 * toward);
        mix("head", "rotate", -2 * toward);
        break;
      }
      case "talk":
        // Konuşurken ağız anlatımın seslerine göre şekil alır (vizem). Ölçülen ağızda şekil koddan çizilir (Layer), çizimin
        // ağzına dokunulmaz; 3D figürde ve ölçülemeyen ağızda ağız şekle göre ölçeklenir (somurtan yüzde eğri ters
        // kalır). Kelime zamanı yoksa sabit ritimle açılıp kapanır.
        if (attention.voice) {
          if (!attention.face?.mouth) {
            const [sx, sy] = VISEME_SCALE[attention.voice.viseme];
            part("mouth").sx = (face.mouthW ?? 1) * (1 - w) + sx * w;
            part("mouth").sy = Math.sign(face.mouth) * (Math.abs(face.mouth) * (1 - w) + sy * w);
          }
        } else part("mouth").sy = Math.sign(face.mouth) * (0.35 + Math.abs(Math.sin(t * 13)) * 0.9 * w + (1 - w) * 0.65);
        if (voice) {
          // Vurguda baş iner kalkar, öbek başında kaşlar kalkar; baş ve gövde arada yalnız hafifçe salınır.
          part("head").ty += voice.nod * 3.5 * w;
          part("brows").ty -= voice.brow * 3.5 * w;
          part("head").rotate += Math.sin(t * 1.7) * 1.2 * w;
          part("torso").rotate += (Math.sin(t * 1.3) * 0.8 + voice.nod * 0.8) * w;
        } else {
          // Kelime zamanı yok: baş, kaş ve gövde sabit ritimle oynar.
          part("brows").ty += Math.sin(t * 4) * 2 * w;
          part("head").rotate += Math.sin(t * 3.1) * 2.5 * w;
          part("torso").rotate += Math.sin(t * 2.3) * 1.5 * w;
        }
        break;
      default:
        break;
    }
  }
  return pose;
}

/**
 * Animasyon penceresine yakınlık (0–1): pencerenin içinde 1; öncesinde lead sn, sonrasında tail sn boyunca yumuşakça
 * 0'a iner. Çekim başında başlayan ve sonuna kadar süren pencere kesmeyle sürüyordur: o yanda rampa yok.
 */
export function nearness(p: number, a: VectorAnim, dur: number, lead: number, tail: number): number {
  const fade = (x: number) => (x >= 1 ? 0 : 1 - x * x * (3 - 2 * x));
  const before = (a.start - p) * dur;
  const after = (p - a.end) * dur;
  if (before > 0) return fade(before / lead);
  if (after > 0) return fade(after / tail);
  return 1;
}

/** Kameraya doğru uzanan ön kolun önden görünen boyu (klavye, yazı, okuma). */
const FORESHORTEN = 0.55;

/** Nesne tutan sağ kolun duruşu (derece, dışa): üst kol hafif açık, ön kol yataya yakın. */
export const HOLD_POSE = { arm: 12, forearm: 72 };

/** Oturan karakter: uyluk kameraya doğru kısalır (ön görünüş), baldır dik kalır. */
const SIT_THIGH = 0.35;

/**
 * Ayakta duruş (kontrapost): taşıyan bacak içe (°), gevşek bacak dışa, gevşek dizin bükülmesi, üst gövdenin taşıyan
 * bacağa eğilmesi, başın dengelemesi, gevşek taraftaki dirseğin fazladan bükülmesi; ağırlık every + 0…spread sn'de bir,
 * shift sn'de öbür bacağa geçer.
 */
export const STANCE = { inward: 1.5, out: 4, knee: 8, torso: 2.2, head: 3, elbow: 15, every: 9, spread: 5, shift: 0.9 } as const;

/** Dinleyenin çekim boyunca dinlenme pozu. */
export type RestPose = "relaxed" | "hip" | "clasped";

/** Dinlenme pozu oranları (serbest, bel, kavuşmuş) ve kavuşan ellerin yüksekliği (iskelet y: göbek). */
const REST = { hip: 0.25, clasped: 0.3, clasp: 470 } as const;

/** Karakterin (çekim + katman tohumu) dinlenme pozu. */
export function restPoseOf(seed: string): RestPose {
  const x = random(`${seed}-rest`);
  return x < REST.hip ? "hip" : x < REST.hip + REST.clasped ? "clasped" : "relaxed";
}

/** Ağırlığın hangi bacakta olduğu: 1 soldaki (leg-l), −1 sağdaki; geçişte arası (yumuşak). Karakter başına tohumlu. */
export function stanceAt(t: number, seed: string): number {
  const period = STANCE.every + random(`${seed}-st`) * STANCE.spread;
  const x = t / period + random(`${seed}-sp`);
  const n = Math.floor(x);
  const first = random(`${seed}-sb`) < 0.5 ? 0 : 1;
  const side = (i: number) => ((i + first) % 2 ? 1 : -1);
  const q = Math.min(1, ((x - n) * period) / STANCE.shift);
  const e = q * q * (3 - 2 * q);
  return side(n - 1) * (1 - e) + side(n) * e;
}

/**
 * İşaret: parmak ucu hedefin kenarından gap px önde durur; el omuzdan en az min × kol boyu uzakta (çok yakındaki nesneye
 * kol katlanmaz). Hedefin kenarı çizim kutusunun yarı genişliğinin edge'i kadar ortadan (kutunun kenarında boşluk olur).
 */
export const POINT = { gap: 6, min: 0.6, edge: 0.4 } as const;

/** Uzatma: elin omuzdan uzaklığı (kol boyunun kesri) ve öne uzanırken aşağı eğimi (yatay 1'e karşı). */
const GIVE = { reach: 0.85, drop: 0.5 } as const;

/**
 * Düşünme pozu (iskelet px): el çenenin altına gelir (x: çene hattının kesri kadar el tarafına, y: çeneden aşağı; parmak
 * uçları çeneye değer), ön kol dikeyden lean derece dışa yatık durur, dirsek onun ucunda; üst kol dirseğe kameraya
 * uzanarak (en az min boyla) ulaşır. Öbür elin avucu dirseğin support px altını tutar. Parmak uçları ağzın alt
 * kenarının en az gap px altında kalır. Dirsek 3B'de en çok flex derece bükülür: gerekirse ön kol da kameraya uzanıp
 * en az fore boyuna kısalır.
 */
export const THINK = { x: 0.4, y: 14, lean: 8, min: 0.62, support: 16, gap: 6, flex: 140, fore: 0.6 } as const;

/** Düşünme duruşları: çene elde ("düşünen adam"), başını kaşıma, kollar kavuşuk yukarı bakma. */
export type ThinkPose = "chin" | "scratch" | "ponder";

/** Duruş oranları (çene, kaşıma; kalanı kavuşuk kollar). Elde nesne varken kollar kavuşmaz: çene ya da kaşıma. */
const THINK_MIX = { chin: 0.4, scratch: 0.3, heldChin: 0.55 } as const;

/** Karakterin (çekim + katman tohumu) bu çekimdeki düşünme duruşu. */
export function thinkPoseOf(seed: string, holding = false): ThinkPose {
  const x = random(`${seed}-think`);
  if (holding) return x < THINK_MIX.heldChin ? "chin" : "scratch";
  return x < THINK_MIX.chin ? "chin" : x < THINK_MIX.chin + THINK_MIX.scratch ? "scratch" : "ponder";
}

/**
 * Başını kaşıma (iskelet px, derece): el başın kutusunda yatay olarak kenara x kadar (yarı genişliğin kesri), dikeyde
 * y kadar (boyun kesri) gider; parmaklar başa doğru curl derece kıvrılır. Kaşıma burst rad/sn'lik dalganın artı yarısında
 * sürer; bilek rub, ön kol fore derece, rate rad/sn hızla (~5 Hz: 30 kare/sn'de kırpışmadan) gider gelir.
 */
export const SCRATCH = { x: 0.92, y: 0.32, curl: 10, rub: 9, fore: 2.5, rate: 30, burst: 2.1 } as const;

/** Kavuşuk kollar (arms_crossed ve düşünürken): ön kollar göğsün altında yatay, eller karşı kolun altında. */
const CROSSED: [PosePart, keyof PartPose, number][] = [
  ["arm-l", "rotate", -6],
  ["arm-r", "rotate", 6],
  ["forearm-l", "rotate", -90],
  ["forearm-r", "rotate", 84],
  ["forearm-l", "sy", 0.9],
  ["forearm-r", "sy", 0.9],
  ["hand-l", "rotate", -50],
  ["hand-r", "rotate", 50],
];
/** Kısalan uyluk kadar karakter aşağı iner ki ayaklar yerde kalsın (iskelet pikseli). */
const SIT_DROP = (RIG.pivots["shin-l"][1] - RIG.pivots["leg-l"][1]) * (1 - SIT_THIGH);

const rot = ([x, y]: readonly [number, number], deg: number): [number, number] => {
  const r = (deg * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};

/** Karakterin sahnedeki ilgi noktaları (tuval koordinatı): işaret hedefi ve bakacağı diğer karakterin x'i. */
export interface Focus {
  aim?: readonly [number, number];
  /** Hedef katmanın kişiye bakan dikey kenarı (tuval x); hedef yazıysa yok. */
  aimEdge?: number;
  lookX?: number;
  /** Elinde bir şey tutuyor (nesne sağ eli izler). */
  holding?: boolean;
  /** give alıcısının göğsü (tuval). */
  receiver?: readonly [number, number];
}

/**
 * point hedefi: animasyonda "target" verilmişse o katman; yoksa yanında (gövdesinin dışında) duran en yakın nesne ya da
 * karakter; o da yoksa ekrandaki yazı. Kendi tuttuğu nesne ve arka plan hedef olmaz.
 */
export function focusOf(spec: VectorShot, placed: PlacedLayer[], index: number, kinds: (i: number) => string | undefined): Focus {
  const self = placed.find((pl) => pl.index === index)!;
  const center = (pl: PlacedLayer): [number, number] => [pl.x, pl.y - pl.height / 2];
  const others = placed.filter((pl) => pl.index !== index && pl.heldBy !== index);
  const near = (list: PlacedLayer[]) =>
    list.sort((a, b) => Math.abs(a.x - self.x) - Math.abs(b.x - self.x))[0];
  const people = others.filter((pl) => kinds(pl.index) === "character");
  const target = spec.layers[index]!.anims.find((a) => a.type === "point" && a.target !== undefined)?.target;
  // give alıcısı: verilmişse o katman, yoksa en yakın kişi; göğüs hizası.
  const giveTo = spec.layers[index]!.anims.find((a) => a.type === "give" && a.target !== undefined)?.target;
  const receiver = others.find((pl) => pl.index === giveTo) ?? near(people);
  const explicit = others.find((pl) => pl.index === target);
  const beside = near(others.filter((pl) => Math.abs(pl.x - self.x) > self.width * 0.4));
  // Bilgi kartının yeri sabit (sol üst); işaret yalnız yerinde duran kişi etiketine gider.
  const text = spec.texts.find((tx) => tx.style === "label");
  const aim = explicit ? center(explicit) : beside ? center(beside) : text ? ([text.x, text.y] as const) : undefined;
  const at = explicit ?? beside;
  return {
    aim,
    // Çizim kutusunun kenarında genelde boşluk var: yarı genişliğin POINT.edge'i.
    ...(at ? { aimEdge: at.x - Math.sign(at.x - self.x || 1) * at.width * POINT.edge } : {}),
    lookX: near(people)?.x,
    holding: placed.some((pl) => pl.heldBy === index),
    ...(receiver ? { receiver: [receiver.x, receiver.y - receiver.height * 0.6] as const } : {}),
  };
}

/** Yakın çekim çerçevesi: bu zoom'dan itibaren yakın çekim sayılır; özne kare yüksekliğinin en az min'i kadar görünmeli. */
const CLOSE_UP = { zoom: 1.5, min: 0.2, target: 0.4, maxZoom: 3.2, groupWidth: 0.8 };

/**
 * Yakın çekimde odağa en yakın şey kadrajda çok küçük kalıyorsa (31 Eki: 12 cm'lik reçine kabı yerde, 1,9 zoom'da
 * 57 px'ti; yakın çekimlerin ~%10'u) zoom büyütülür ve odak öznenin merkezine taşınır. Kamera odak noktasını sabit
 * tutarak yaklaşır, boş bir noktaya odaklanmak özneyi kenara itiyordu. Harita/bayrak (gerçek veri) çekimlerine dokunulmaz.
 */
export function closeUpCamera(
  cam: VectorShot["camera"],
  placed: PlacedLayer[],
  exactBackground: boolean,
  whole: (pl: PlacedLayer) => boolean = () => false,
  /** Yerinde duran kişi: yakın çekimin öznesiyse belden yukarı kadrajlanır (portrait). */
  person: (pl: PlacedLayer) => boolean = () => false,
): { cam: VectorShot["camera"]; centre: boolean; subject?: number } {
  const z = Math.max(cam.zoomFrom, cam.zoomTo);
  const keep = { cam, centre: false };
  if (z < CLOSE_UP.zoom || exactBackground || !placed.length) return keep;
  const fx = cam.focusX ?? W / 2;
  const fy = cam.focusY ?? H / 2;
  const centre = (pl: PlacedLayer) => [pl.x, pl.y - pl.height / 2] as const;
  const dist = (pl: PlacedLayer) => Math.hypot(centre(pl)[0] - fx, centre(pl)[1] - fy);
  // Yönetmenin kadrajında (çekim sonu) görünenler.
  const at = cameraAt(cam, 1, false);
  const x0 = -at.tx / at.scale - (at.panX / 100) * W;
  const y0 = -at.ty / at.scale;
  const seen = (pl: PlacedLayer) => {
    const [cx, cy] = centre(pl);
    return cx >= x0 && cx <= x0 + W / at.scale && cy >= y0 && cy <= y0 + H / at.scale;
  };
  // Duvardaki/havadaki öğe (ışın, ok, poster) yalnız başka aday yoksa özne olur. Üstünde bir şey duran yüzey (masa)
  // özne olmaz, üstündeki olur: odak masadaki iPod'dayken büyük masa seçiliyor, yakınlaşma hiç olmuyordu (Apple
  // incelemesi, 1 Kas: "iPod ve iPhone masada minik noktalar").
  const surfaces = new Set(placed.map((pl) => pl.on));
  const standing = placed.filter((pl) => (pl.grounded || pl.heldBy !== undefined) && !surfaces.has(pl.index));
  // Elde tutulan ya da masaya konan nesne (anlatılan şey) kişiden önce özne olur: kamera kişiyi seçince kâğıt bant,
  // iPad, disket gerçek boyunda göğüs hizasında küçük kalıyordu (Microsoft incelemesi, 1 Kas: "paper tape tiny in the
  // hand, not a close-up"; 25 ölçek notunun en büyük grubu).
  const props = standing.filter((pl) => whole(pl) && (pl.heldBy !== undefined || pl.on !== undefined) && seen(pl));
  const subject = (props.length ? props : standing.length ? standing : placed).reduce((a, b) => (dist(b) < dist(a) ? b : a));
  // Nesne öznesinde ölçü alanın karekökü (ince uzun bant en uzun kenarıyla "büyük" sayılıyordu) ve hedef okunur boy.
  const side = props.length ? Math.sqrt(subject.width * subject.height) : Math.max(subject.width, subject.height);
  // Özne nesneyse bildirilir: yakınlaşma onu okunur boya getiremezse büyütme balonu açılır (calloutTarget).
  const tag = props.length ? { subject: subject.index } : {};
  const small = props.length ? CLOSE_UP.target : CLOSE_UP.min;
  // Aynı yüzeydeki nesneler birlikte kadrajlanır (masada iPod ve iPhone: yalnız birine yaklaşınca öteki kenarda kesiliyordu).
  const group = subject.on === undefined ? [subject] : standing.filter((pl) => pl.on === subject.on);
  // Yönetmenin kadrajında görünen öteki nesneler de kadrajda kalır: küçük tokmağa yaklaşınca yanında beliren, anlatılan
  // logo kadraj dışında kalıyordu; duvardaki büyük dergi kapağı ise yakın çekimde dört yandan taşıyordu (Microsoft
  // incelemesi, 1 Kas: "Microsoft logosunun ikiye bölünmesi yok", "dergi kapağı görünmüyor").
  const extra = placed.filter((pl) => !group.includes(pl) && !surfaces.has(pl.index) && whole(pl) && seen(pl));
  // Nesneyi tutan kişinin başı da kadraja girer: kamera yalnız elindeki iPad'e ortalayınca yüz göz hizasından
  // kesiliyordu (Microsoft s9-sh3, 2 Kas). Nesnenin yanında (masasında) duran kişi de: masadaki makaleye ve havadaki
  // düşünce balonuna yaklaşan kamera düşünen kişiyi kenarda yarım bırakıyordu (Bilgisayarlar s4-sh5, 2 Kas). Baş, boyun
  // üst beşte biri.
  const gl = Math.min(...group.map((g) => g.x - g.width / 2));
  const gr = Math.max(...group.map((g) => g.x + g.width / 2));
  const beside = (h: PlacedLayer) => !whole(h) && !surfaces.has(h.index) && !group.includes(h) && h.x + h.width >= gl && h.x - h.width <= gr;
  const heads = placed
    .filter((h) => (group.some((g) => g.heldBy === h.index) || beside(h)) && seen(h))
    .map((h) => ({ ...h, width: h.width * 0.5, height: h.height * 0.2, y: h.y - h.height * 0.8 }));
  const framed = [...group, ...extra, ...heads];
  // Yönetmenin kadrajında görünmeyen kişiye (bilerek köşeye odaklanan kamera) portre yapılmaz.
  if (!props.length && person(subject) && seen(subject)) {
    const shot = portrait(cam, z, placed.filter((pl) => person(pl) && seen(pl)), extra);
    if (shot) return shot;
  }
  if (side * z >= small * H) {
    const fit = [...(whole(subject) ? group : []), ...extra];
    return { ...(fit.length ? fitWhole(cam, z, fit) : keep), ...tag };
  }
  const l = Math.min(...framed.map((pl) => pl.x - pl.width / 2));
  const r = Math.max(...framed.map((pl) => pl.x + pl.width / 2));
  const top = Math.min(...framed.map((pl) => pl.y - pl.height));
  const bottom = Math.max(...framed.map((pl) => pl.y));
  const k = Math.min(CLOSE_UP.maxZoom, (CLOSE_UP.target * H) / side, (CLOSE_UP.groupWidth * W) / (r - l), (CLOSE_UP.groupWidth * H) / (bottom - top)) / z;
  const x = (l + r) / 2;
  const y = extra.length || heads.length ? (top + bottom) / 2 : centre(subject)[1];
  // Zoom zaten tavandaysa yalnız odak düzelir.
  return { cam: { ...cam, zoomFrom: cam.zoomFrom * Math.max(1, k), zoomTo: cam.zoomTo * Math.max(1, k), focusX: x, focusY: y }, centre: true, ...tag };
}

/**
 * Kişi yakın çekimi: kafanın üstünde kare boyunun %7'si pay, kesim belde (boyunun alttan %44'ü: dirsekle bilek arası,
 * eklem değil); omuz genişliği kutunun ortadaki %70'i.
 */
const PORTRAIT = { headroom: 0.07, waist: 0.44, shoulders: 0.35, width: 0.8, gain: 1.1 } as const;

/**
 * Kişi yakın çekimi (3 Kas, C# taslağı: "geniş boş duvar, altta küçük tek karakter", "yüzün yakın çekimi değil"; boş ve
 * küçük ölçek notları 31 karenin 30'unda). Yönetmenin 1,5–2 zoom'u yerinde duran kişiyi hâlâ tam boy gösteriyor, odak
 * kafanın üstündeki duvarda kalınca kişi kadrajın dibine iniyordu. Özne kişiyse (elde ya da masada anlatılan nesne yoksa)
 * kamera kadrajdaki kişileri belden yukarı çerçeveler: kafa üstte küçük payla, kesim belde; yanlarındaki bütün görünen
 * öğeler de kadrajda kalır. Yaklaşma kazancı küçükse (iki kişi uzak, büyük pano) yönetmenin kadrajı kalır.
 */
function portrait(cam: VectorShot["camera"], z: number, people: PlacedLayer[], extra: PlacedLayer[]): { cam: VectorShot["camera"]; centre: boolean } | undefined {
  // Oturan render'da biraz aşağı iner (SIT_DROP).
  const drop = (pl: PlacedLayer) => (pl.sitting ? SIT_DROP * (pl.height / RIG.height) : 0);
  const top = Math.min(...people.map((pl) => pl.y + drop(pl) - pl.height * (1 - HEAD_TOP)), ...extra.map((pl) => pl.y - pl.height));
  const bottom = Math.max(...people.map((pl) => pl.y + drop(pl) - pl.height * PORTRAIT.waist), ...extra.map((pl) => pl.y));
  const left = Math.min(...people.map((pl) => pl.x - pl.width * PORTRAIT.shoulders), ...extra.map((pl) => pl.x - pl.width / 2));
  const right = Math.max(...people.map((pl) => pl.x + pl.width * PORTRAIT.shoulders), ...extra.map((pl) => pl.x + pl.width / 2));
  const zoom = Math.min(CLOSE_UP.maxZoom, (H * (1 - PORTRAIT.headroom)) / (bottom - top), (PORTRAIT.width * W) / (right - left));
  if (zoom < z * PORTRAIT.gain) return undefined;
  const k = zoom / z;
  const view = H / zoom;
  return {
    cam: { ...cam, panX: 0, zoomFrom: cam.zoomFrom * k, zoomTo: cam.zoomTo * k, focusX: (left + right) / 2, focusY: top - PORTRAIT.headroom * view + view / 2 },
    centre: true,
  };
}

/**
 * Yakın çekimin öznesi olan nesne (ve yönetmenin kadrajındaki öteki nesneler) yeterince büyük ama kadraja sığmıyorsa (Microsoft incelemesi, 1 Kas: yerdeki DOS
 * ekranı alt kenarda kesik, dergi kapağı dört yandan taşıyor; denetçi "anlatılan şey görünmüyor" diyordu) odak nesneye
 * taşınır, sığmıyorsa zoom sığacak kadar azalır. Karakterde yakın çekim bilerek keser (yüz), bu yalnız nesneler için.
 */
function fitWhole(cam: VectorShot["camera"], z: number, group: PlacedLayer[]): { cam: VectorShot["camera"]; centre: boolean } {
  const left = Math.max(0, Math.min(...group.map((pl) => pl.x - pl.width / 2)));
  const right = Math.min(W, Math.max(...group.map((pl) => pl.x + pl.width / 2)));
  const top = Math.max(0, Math.min(...group.map((pl) => pl.y - pl.height)));
  const bottom = Math.min(H, Math.max(...group.map((pl) => pl.y)));
  const shows = (k: number) => {
    const at = cameraAt(cam, k, false);
    const x0 = -at.tx / at.scale - (at.panX / 100) * W;
    const y0 = -at.ty / at.scale;
    return x0 <= left + 1 && x0 + W / at.scale >= right - 1 && y0 <= top + 1 && y0 + H / at.scale >= bottom - 1;
  };
  if (shows(0) && shows(1)) return { cam, centre: false };
  const f = Math.min(1, (0.9 * W) / ((right - left) * z), (0.9 * H) / ((bottom - top) * z));
  const zoom = (v: number) => Math.max(1, v * f);
  return { cam: { ...cam, panX: 0, zoomFrom: zoom(cam.zoomFrom), zoomTo: zoom(cam.zoomTo), focusX: (left + right) / 2, focusY: (top + bottom) / 2 }, centre: true };
}

/**
 * Geniş çekimde (zoom 1 ile yakın çekim arası) yönetmenin hafif yaklaşması kenardaki kişiyi/nesneyi kesiyordu
 * (incelemeler, 1 Kas: "en sağdaki asker kadrajın kenarında kesik", "atların başı görünmüyor"; 98 not). Kadraj
 * çekimin başında ve sonunda bunların hepsini (ve kafalarını) göstermiyorsa: kaydırma bırakılır, odak hepsini içine
 * alacak kadar kaydırılır; yine sığmıyorsa zoom sığacak kadar azalır. Yakın çekim bilerek keser, ona dokunulmaz.
 */
export function frameWide(cam: VectorShot["camera"], keep: PlacedLayer[]): VectorShot["camera"] {
  const z = Math.max(cam.zoomFrom, cam.zoomTo);
  if (z <= 1 || z >= CLOSE_UP.zoom || !keep.length) return cam;
  const left = Math.max(0, Math.min(...keep.map((pl) => pl.x - pl.width / 2)));
  const right = Math.min(W, Math.max(...keep.map((pl) => pl.x + pl.width / 2)));
  const top = Math.max(0, Math.min(...keep.map((pl) => pl.y - pl.height)));
  const shows = (k: number) => {
    const at = cameraAt(cam, k, false);
    const pan = (at.panX / 100) * W;
    return -at.tx / at.scale - pan <= left + 1 && (W - at.tx) / at.scale - pan >= right - 1 && -at.ty / at.scale <= top + 1;
  };
  if (shows(0) && shows(1)) return cam;
  // Kaydırmasız, odağı sabit kamerada kadraj zoom küçüldükçe genişler: en büyük zoom'da sığan her karede sığar.
  const zoom = Math.min(z, W / (right - left));
  const shrink = 1 - 1 / zoom;
  const out = { ...cam, panX: 0, zoomFrom: Math.min(cam.zoomFrom, zoom), zoomTo: Math.min(cam.zoomTo, zoom) };
  // Grup tuvalin iki kenarına değiyorsa zoom 1'e iner; odak önemsizleşir.
  if (shrink <= 0) return out;
  const x0 = Math.min(Math.max((cam.focusX ?? W / 2) * shrink, right - W / zoom), left);
  const y0 = Math.min((cam.focusY ?? H / 2) * shrink, top);
  return { ...out, focusX: Math.round(x0 / shrink), focusY: Math.round(y0 / shrink) };
}

/**
 * Geniş çekimi doldurma: en çok zoom (yakın çekimin altında), yan pay, en az kazanç; ekranda kafaların üst sınırı,
 * nesnelerin alt sınırı (altyazı bandının üstü) ve kişinin kesilebileceği yer (diz, boyunun alttan %30'u).
 */
const FILL = { most: 1.8, margin: 1.2, gain: 1.1, top: 0.08, props: 0.8, knee: 0.3, offCentre: 0.15 } as const;

/**
 * Geniş çekimde içerik kadrajın küçük bir bölümündeyse kamera ona yaklaşır (yakın çekim sınırının altında): boş
 * duvar kareye hâkim oluyordu (incelemeler, 1 Kas: 123 "empty" notu; "geniş boş oda, köşede küçük iki figür, büyük
 * boş duvar"). Ayakta duran kişi tam boy kadrajda zaten yüksekliğin yarısını kapladığından orta plana geçilir: kişi
 * dizden kesilebilir, nesne bütün kalır ve altyazı bandına inmez, kafalar üst kenara yapışmaz. Sahneye yürüyen/kayan
 * biri varsa uygulanmaz (yolu kadrajın dışına düşerdi): çağıran onları ayıklar.
 */
export function fillWide(
  cam: VectorShot["camera"],
  content: PlacedLayer[],
  person: (pl: PlacedLayer) => boolean,
): { cam: VectorShot["camera"]; centre: boolean } | undefined {
  const z = Math.max(cam.zoomFrom, cam.zoomTo);
  if (z >= CLOSE_UP.zoom || !content.length) return undefined;
  const left = Math.max(0, Math.min(...content.map((pl) => pl.x - pl.width / 2)));
  const right = Math.min(W, Math.max(...content.map((pl) => pl.x + pl.width / 2)));
  const top = Math.max(0, Math.min(...content.map((pl) => pl.y - pl.height)));
  // Ekranda y = H/2 + (nokta - odak) × zoom. Her alt çizgi (nesnenin tabanı ya da kişinin dizi) kendi sınırının üstünde.
  // Üstünde bir şey duran ya da birinin oturduğu mobilya kişi gibi alttan kesilebilir (üst yarısı kalır): masa başındaki
  // kişinin orta planı böyledir; masanın ayağını altyazı bandının üstünde tutmak yaklaşmayı engelliyordu (Bilgisayarlar s4-sh4).
  const surfaces = new Set(content.map((pl) => pl.on));
  const lines = content.map((pl) =>
    person(pl) ? { y: pl.y - pl.height * FILL.knee, max: 1 } : surfaces.has(pl.index) ? { y: pl.y - pl.height * 0.5, max: 1 } : { y: Math.min(H, pl.y), max: FILL.props },
  );
  const most = Math.min(FILL.most, W / FILL.margin / (right - left), ...lines.map((l) => ((l.max - FILL.top) * H) / (l.y - top)));
  // Yaklaşmaya değmiyorsa yönetmenin zoom'u kalır; ama içerik kadrajın bir yanına yığılıp öbür yarısı boşsa (Microsoft
  // s8-sh5, 2 Kas: kişi solda, sağ yarı boş duvar) o zoom'la ortalanır. Kayan kamera bilerek kaydırır, ona dokunulmaz.
  let zoom = most;
  if (most < z * FILL.gain) {
    const s = Math.max(1, z);
    const view = ((cam.focusX ?? W / 2) * (s - 1)) / s + W / (2 * s);
    if (most < z || cam.panX !== 0 || Math.abs((left + right) / 2 - view) < (W / s) * FILL.offCentre) return undefined;
    zoom = z;
  }
  const low = Math.max(...lines.map((l) => l.y - ((l.max - 0.5) * H) / zoom));
  const high = top + ((0.5 - FILL.top) * H) / zoom;
  const y = Math.min(Math.max((top + Math.max(...lines.map((l) => l.y))) / 2, low), high);
  const f = zoom / z;
  return { cam: { ...cam, panX: 0, zoomFrom: cam.zoomFrom * f, zoomTo: cam.zoomTo * f, focusX: (left + right) / 2, focusY: y }, centre: true };
}

/**
 * Ayakta duranın alttan kesileceği yer: ya ayakları kadrajda (alt kenara kare boyunun %1'i pay) ya da kesim en az uyluk
 * ortasında (boyunun alttan %27'si); arası (bilek, baldır, diz) kesilmez. Odak bu adımla taranır (tuval pikseli).
 */
const CROP = { feet: 0.01, thigh: 0.27, step: 4 } as const;

/**
 * Geniş/orta planda kişiyi eklem yerinden kesmeme (3 Kas, C# bölümü taslağı: 31 karenin 15'inde "ayakkabılar alt
 * kenarda kesik", "bacaklar baldırdan kesik"). Hafif yaklaşan kamera ayakları birkaç piksel kesiyordu; fillWide de
 * dizin üstü bir çizgiyi kadrajda tutup kesimi bilek-baldır arasına bırakıyordu. Çekimin başında ve sonunda her
 * ayaktaki kişi için kural sağlanmıyorsa kamera dikeyde en az kaydırmayla buna uyan odağa geçer; kafalar ve önceden
 * bütün görünen nesneler kadrajda kalır. Uyan odak yoksa kamera olduğu gibi kalır.
 */
export function jointSafe(cam: VectorShot["camera"], centre: boolean, people: PlacedLayer[], whole: PlacedLayer[]): VectorShot["camera"] {
  const z = Math.max(cam.zoomFrom, cam.zoomTo);
  if (z <= 1 || !people.length) return cam;
  const frames = (c: VectorShot["camera"]) =>
    [0, 1].map((k) => {
      const at = cameraAt(c, k, centre);
      return { x0: -at.tx / at.scale - (at.panX / 100) * W, y0: -at.ty / at.scale, w: W / at.scale, h: H / at.scale };
    });
  type Frame = ReturnType<typeof frames>[number];
  const inX = (f: Frame, pl: PlacedLayer) => pl.x + pl.width / 2 > f.x0 && pl.x - pl.width / 2 < f.x0 + f.w;
  const fits = (f: Frame, pl: PlacedLayer) => pl.y - pl.height >= f.y0 - 1 && pl.y <= f.y0 + f.h + 1;
  const before = frames(cam);
  const kept = whole.filter((pl) => before.every((f) => !inX(f, pl) || fits(f, pl)));
  const safe = (c: VectorShot["camera"]) =>
    frames(c).every(
      (f) =>
        people.every((pl) => {
          if (!inX(f, pl)) return true;
          const bottom = f.y0 + f.h;
          // Kafa kadrajda; ayaklar içeride ya da kesim uyluk ortasının üstünde.
          return pl.y - pl.height >= f.y0 - 1 && (pl.y + CROP.feet * f.h <= bottom || pl.y - bottom >= CROP.thigh * pl.height);
        }) && kept.every((pl) => !inX(f, pl) || fits(f, pl)),
    );
  if (safe(cam)) return cam;
  const from = cam.focusY ?? H / 2;
  let best: number | undefined;
  for (let y = 0; y <= H; y += CROP.step) if (safe({ ...cam, focusY: y }) && (best === undefined || Math.abs(y - from) < Math.abs(best - from))) best = y;
  return best === undefined ? cam : { ...cam, focusY: best };
}

/**
 * Yüzün iskelet tuvalindeki bölgesi (köşeler): ölçülen başın ortadaki %70'i, gözlerin üstünden (baş kutusunun üst %30'u
 * saç, şapka) çeneye kadar. Kamera (faceSafe) ve denetim (lint.ts) aynı bölgeye bakar.
 */
export function faceCorners(asset: VectorAsset): [number, number][] {
  const { head, chin } = faceFor(asset);
  const x0 = head.x + head.w * 0.15;
  const x1 = head.x + head.w * 0.85;
  const y0 = head.y + head.h * 0.3;
  const y1 = Math.max(chin[1], y0 + 1);
  return [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ];
}

/** Noktaları çevreleyen kutu. */
export function boxOf(points: readonly (readonly [number, number])[]): Box {
  const xs = points.map((c) => c[0]);
  const ys = points.map((c) => c[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/**
 * Durağan kadrajda yarım yüz olmaz: çekimin başında ve sonunda her yüz (tuval kutusu) ya en az in kesriyle kadrajda ya en
 * çok out kesriyle; ara görünüm (kenarda yarım yüz) kusurdur. step: odak aramasının adımı (tuval px). pad: yüz kutusu her
 * yandan genişliğinin/yüksekliğinin bu kesri kadar büyütülür (jestte gövde eğilir, baş dinlenme pozundan kayar).
 */
export const FACE_SAFE = { in: 0.98, out: 0.02, step: 8, pad: [0.2, 0.1], arm: 0.2 } as const;

/**
 * Yarım yüzü kadrajın kenarından kurtarma (3 Kas denetimi: yakın çekim nesneye yaklaşırken kenardaki kişinin yüzü
 * çekimin başında %50–70 kadrajda kalıyordu, sonra kayıp çıkıyordu; 923 çekimin 13'ü). Kuralı sağlamayan kadrajda odak
 * en az kaydırmayla uyan yere geçer: yatayda, vertical ise dikeyde de (geniş planda dikey kayma eklem kesimini bozar).
 * Odak ekranın dörtte birinden fazla kaymaz (özne kadrajda kalır); uyan yer yoksa kamera aynı kalır. Kamera yaklaşırken
 * yüzün kenardan geçip çıkması olağandır: yalnız başı ve sonu.
 *
 * bodies (yüzlerle aynı sırada, kişinin kutusu): yüzü yandan kadraj dışında kalan kişinin gövdesi de kenardan sızmaz
 * (4 Kas ölçüm tezgâhı: yakın çekimlerin %13'ünde kenarda kişinin yalnız bir şeridi ya da kolu; denetçi "kopuk kol",
 * "yalnız bir şerit görünüyor" diyordu). Kutu yanlardan FACE_SAFE.arm kadar genişler (uzanan işaret kolu). Yüzü yukarıdan
 * dışarıda kalan kişiye dokunulmaz: masadaki eller gibi bilinçli ara çekim.
 */
export function faceSafe(cam: VectorShot["camera"], centre: boolean, faces: Box[], vertical: boolean, bodies: Box[] = []): VectorShot["camera"] {
  const ok = (c: VectorShot["camera"]) =>
    [0, 1].every((k) => {
      const at = cameraAt(c, k, centre);
      const f = { x: -at.tx / at.scale - (at.panX / 100) * W, y: -at.ty / at.scale, w: W / at.scale, h: H / at.scale };
      return faces.every((face, i) => {
        const [px, py] = FACE_SAFE.pad;
        const b = { x: face.x - face.w * px, y: face.y - face.h * py, w: face.w * (1 + 2 * px), h: face.h * (1 + 2 * py) };
        const v = overlap(b, f) / (b.w * b.h);
        if (v >= FACE_SAFE.in) return true;
        if (v > FACE_SAFE.out) return false;
        const body = bodies[i];
        const sideways = b.x + b.w <= f.x || b.x >= f.x + f.w;
        if (!body || !sideways) return true;
        const arm = body.w * FACE_SAFE.arm;
        const wide = { x: body.x - arm, y: body.y, w: body.w + 2 * arm, h: body.h };
        return overlap(wide, f) / (wide.w * wide.h) <= FACE_SAFE.out;
      });
    });
  if (ok(cam)) return cam;
  const fx = cam.focusX ?? W / 2;
  const fy = cam.focusY ?? H / 2;
  const z = Math.min(cam.zoomFrom, cam.zoomTo);
  const rx = Math.floor(W / 4 / z / FACE_SAFE.step) * FACE_SAFE.step;
  const ry = vertical ? Math.floor(H / 4 / z / FACE_SAFE.step) * FACE_SAFE.step : 0;
  let best = cam;
  let cost = Infinity;
  for (let dx = -rx; dx <= rx; dx += FACE_SAFE.step)
    for (let dy = -ry; dy <= ry; dy += FACE_SAFE.step) {
      const d = Math.hypot(dx, dy);
      if (d >= cost) continue;
      const c = { ...cam, focusX: fx + dx, focusY: fy + dy };
      if (!ok(c)) continue;
      best = c;
      cost = d;
    }
  return best;
}

/**
 * Kameranın bu karedeki dönüşümü (sol üst köşe kökenli). Odak noktası ekranda yerinde kalarak yaklaşılır (yönetmenin
 * kadrajı); centre ile (kod özneyi yeniden çerçevelediyse) odak kadrajın ortasına gelir, tuvalin dışı görünmez. Sabit
 * odak alttaki küçük nesneyi kadrajın dibinde bırakıyordu; her çekimi ortalamak ise iyi kadrajları bozuyordu.
 */
export function cameraTransform(cam: VectorShot["camera"], k: number, centre = false): string {
  const { tx, ty, scale, panX } = cameraAt(cam, k, centre);
  return `translate(${tx}px, ${ty}px) scale(${scale}) translateX(${panX}%)`;
}

function cameraAt(cam: VectorShot["camera"], k: number, centre: boolean) {
  const scale = cam.zoomFrom + (cam.zoomTo - cam.zoomFrom) * k;
  const panX = (cam.panX * (k - 0.5) * (scale - 1) * 100) / scale;
  const shift = (size: number, focus: number) => {
    const edge = size - size * scale;
    const px = centre ? Math.min(Math.max(size / 2 - focus * scale, Math.min(edge, 0)), Math.max(edge, 0)) : focus * (1 - scale);
    return Math.round(px * 100) / 100;
  };
  return { tx: shift(W, cam.focusX ?? W / 2), ty: shift(H, cam.focusY ?? H / 2), scale, panX };
}

/** Tuval noktasının bu karede ekrandaki yeri (cameraTransform ile aynı dönüşüm: önce kaydırma, sonra ölçek, sonra öteleme). */
export function cameraPoint(cam: VectorShot["camera"], k: number, centre: boolean, [x, y]: readonly [number, number]): [number, number] {
  const { tx, ty, scale, panX } = cameraAt(cam, k, centre);
  return [tx + scale * (x + (panX / 100) * W), ty + scale * y];
}

/** Katmanın bu karedeki hareketi: katman dönüşümü ve (karakterse) iskelet pozu. */
export interface Motion {
  tr: Transform;
  pose?: Partial<Record<PosePart, PartPose>>;
  /** Yürürken çizilen yan görünüş (varsa). */
  side?: VectorAsset;
  /** Yandan yürüyor: iskelet RIG_SIDE'a göre pozlanır (SVG yan çizimi ya da yana dönmüş 3D figür). */
  profile?: boolean;
  /** 3D figürün yana dönüşü (−1…1, 90°'nin kesri; artı: katmanın kendi sağına). */
  turn?: number;
  /** Çizim aynalı mı: yan görünüşte gidiş yönünden gelir (çizim sağa bakar). */
  flip: boolean;
  /** Önden yana dönüşte yatay daralma (1 = yok): karakter dönüyormuş gibi görünür. */
  squash: number;
  /** Konuşuyor: çizimin ağzı gizlenir, yerine bu vizemin koddan çizilmiş şekli görünür (ifadenin köşeleriyle). */
  speak?: Viseme;
  /** Bu çekimde yüze giden kol (düşünme): çizimde başın önüne alınır (armInFront). */
  front?: "arm-l" | "arm-r";
  /** Anatomi sınırına kırpılan eklemler (anatomy.ts): olmamalı, denetim (lint) bildirir. */
  strains?: Strain[];
}

/**
 * Katmanın hareketi fiziğe uydurulmuş animasyonlardan hesaplanır (motion.ts): yerdeki şey havalanmaz, elde tutulan
 * süzülmez. Yürüyen karakterin adımları alınan yoldan gelir; gövde adımla hafifçe yükselir ve gidiş yönüne eğilir.
 */
function motionOf(
  layer: VectorLayer,
  asset: VectorAsset,
  placed: PlacedLayer,
  p: number,
  t: number,
  prefix: string,
  dur: number,
  focus: Focus = {},
  sideAsset?: VectorAsset,
  voice?: Voice,
): Motion {
  const pxPerMeter = STAGE.pxPerMeter * placed.scale;
  const anims = paceWalks(
    physicalAnims(layer.anims, { kind: asset.kind, grounded: placed.grounded, held: placed.heldBy !== undefined, sitting: placed.sitting }),
    placed.x,
    pxPerMeter,
    dur,
    asset.kind === "character",
  );
  const tr = layerTransform(anims, p, t, prefix, { x: placed.x, y: placed.y }, { dur, height: placed.height });
  const walks = (asset.kind === "character" && !placed.sitting) || anims.some((a) => a.type === "walk");
  const gait = walks ? gaitOf(anims, p, t, placed.x, pxPerMeter, dur) : STILL;
  // Gövde, salınan bacak altından geçerken en yüksekte (adım başına bir kez).
  tr.y -= Math.abs(Math.sin(Math.PI * gait.steps)) * 0.012 * placed.height * gait.amount;
  if (asset.kind !== "character") return { tr, flip: layer.flip, squash: 1 };
  tr.rotate += gait.dir * 2.5 * gait.amount;
  // Yan görünüş: adım genliği yarıyı geçince yan çizime geçilir; geçişin çevresinde çizim yatayda daralıp açılır (dönüş).
  // 3D figür yan çizim istemez: gidiş yönüne gerçekten döner (yarıda tam profil), daralma yok.
  let squash = 1;
  let turn: number | undefined;
  const mirror = layer.flip ? -1 : 1;
  const figure = asset.meta.figure;
  if ((sideAsset || figure) && !placed.sitting && gait.amount > 0.2) {
    if (gait.amount >= 0.5) {
      const flip = gait.dir ? gait.dir < 0 : layer.flip;
      const { pose, strains } = anatomical(rigPose(anims, p, t, prefix, false, layer.expression, gait, flip, focus.holding ? { holding: true } : {}, dur, true), true);
      return {
        tr,
        flip,
        squash: figure ? 1 : 0.6 + 0.4 * Math.min(1, (gait.amount - 0.5) / 0.3),
        side: sideAsset,
        profile: true,
        turn: figure && 1,
        pose,
        ...(strains.length ? { strains } : {}),
      };
    }
    // Kısmi genlik yalnız hedefe yürürken olur (yerinde yürüyüş hemen tam genlikte): yön hep vardır.
    if (figure) turn = ((gait.amount - 0.2) / 0.3) * gait.dir * mirror;
    else squash = 0.6 + 0.4 * Math.min(1, (0.5 - gait.amount) / 0.3);
  }
  // Ayakta dururken ağırlık aktarma: tüm gövde ayak hizasından hafifçe salınır (yürürken adım bunun yerini alır).
  // Aynalanan karakterde salınım da aynalanır (iskelet pozu gibi).
  if (!placed.sitting) tr.rotate += Math.sin(t * 0.7 + random(prefix) * 6) * 0.9 * (1 - gait.amount) * mirror;
  else tr.y += SIT_DROP * (placed.height / RIG.height);
  // Tuval noktası → iskelet tuvali (katmanın o anki kayması dahil, aynalama geri alınır).
  const k = placed.height / RIG.height;
  const toRigX = (x: number) => {
    const rx = (x - tr.x - (placed.x - placed.width / 2)) / k;
    return layer.flip ? RIG.width - rx : rx;
  };
  const face = faceFor(asset);
  const attention: Attention = {
    aim: focus.aim ? [toRigX(focus.aim[0]), (focus.aim[1] - tr.y - (placed.y - placed.height)) / k] : undefined,
    ...(focus.aimEdge === undefined ? {} : { edge: toRigX(focus.aimEdge) }),
    lookDir: focus.lookX === undefined ? undefined : Math.sign(toRigX(focus.lookX) - RIG.width / 2),
    holding: focus.holding,
    receiver: focus.receiver ? [toRigX(focus.receiver[0]), (focus.receiver[1] - tr.y - (placed.y - placed.height)) / k] : undefined,
    voice,
    face,
  };
  // Son poz anatomiye kırpılır (anatomy.ts): jestler ve karışımları sınırı aşmamalı; aşan denetimde görünür.
  const { pose, strains } = anatomical(rigPose(anims, p, t, prefix, placed.sitting, layer.expression, gait, layer.flip, attention, dur), false);
  // Konuşma yarıdan fazla girmişken ses varsa şekil koddan çizilir; sessizlikte (X) çizimin kendi ağzı görünür.
  const viseme = voice?.viseme;
  const talking = face.mouth && viseme && viseme !== "X" && anims.some((a) => a.type === "talk" && gestureWeight(p, a, dur) >= 0.5);
  // Çeneyi tutan kol (sağ; sağ el nesne tutuyorsa sol) çekim boyunca başın önünde çizilir: kol yandayken başla
  // örtüşmez. Başını kaşıyan el başın arkasında kalır (saçın içinde), kavuşuk kollar başa değmez.
  const front = anims.some((a) => a.type === "think") && thinkPoseOf(prefix, focus.holding) === "chin" ? (focus.holding ? "arm-l" : "arm-r") : undefined;
  return { tr, flip: layer.flip, squash, turn, pose, ...(talking ? { speak: viseme } : {}), ...(front ? { front } : {}), ...(strains.length ? { strains } : {}) };
}

/**
 * İskelet pozundan sağ elin tuval üzerindeki yeri: elde tutulan nesne her karede bunu izler. Katmanın bütün dönüşümü
 * (yürüme, eğilme, ölçek, aynalama) uygulanır; yoksa nesne yürürken elden ayrılıyordu.
 */
/**
 * Kadraj hesabı için elde tutulan nesnenin yeri: yerleşim onu tutanın ortasına koyar, render ise tutuş duruşundaki
 * (HOLD_POSE) elin altına. Yakın çekimde bu fark nesneyi kadraj dışına itebiliyordu.
 */
export function heldFraming(placed: PlacedLayer[], layers: VectorLayer[]): PlacedLayer[] {
  return placed.map((pl) => {
    const holder = placed.find((h) => h.index === pl.heldBy);
    if (!holder) return pl;
    const layer = layers[holder.index]!;
    const arm = (rotate: number): PartPose => ({ rotate, sx: 1, sy: 1, tx: 0, ty: 0 });
    const m: Motion = { tr: { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }, pose: { "arm-r": arm(-HOLD_POSE.arm), "forearm-r": arm(-HOLD_POSE.forearm) }, flip: layer.flip, squash: 1 };
    const [hx, hy] = handPoint(holder, layer, m);
    return { ...pl, x: hx, y: hy + pl.height * 0.45 };
  });
}

/** Kalçadan birlikte eğilen parçalar (çizimde kardeş gruplar). */
const TORSO_PARTS = ["body", "arm-l", "arm-r", "head"] as const;

/** Kimlikli `<g>` gruplarının metindeki aralığı, derinliği ve ebeveyninin başlangıcı (kökte −1). */
function groupSpans(svg: string): Map<string, { start: number; end: number; depth: number; parent: number }> {
  const spans = new Map<string, { start: number; end: number; depth: number; parent: number }>();
  const open: { start: number; id?: string }[] = [];
  for (const m of svg.matchAll(/<(\/?)g\b[^>]*?(\/?)>/g)) {
    if (m[1]) {
      const g = open.pop();
      if (g?.id) spans.set(g.id, { start: g.start, end: m.index + m[0].length, depth: open.length, parent: open.at(-1)?.start ?? -1 });
    } else if (!m[2]) open.push({ start: m.index, id: /\sid="([^"]+)"/.exec(m[0])?.[1] });
  }
  return spans;
}

/**
 * Kolu (üst kol, ön kol, el) başın önüne alır: çizimde baş kollardan sonra gelir, düşünürken çeneye giden el başın
 * arkasında kalıyordu (3 Kas). Kol ve baş aynı ebeveynde kardeş değilse ya da kol zaten sonraysa çizime dokunulmaz.
 */
export function armInFront(svg: string, prefix: string, arm: "arm-l" | "arm-r"): string {
  const spans = groupSpans(svg);
  const a = spans.get(prefix + arm);
  const h = spans.get(prefix + "head");
  if (!a || !h || a.parent !== h.parent || a.start > h.start) return svg;
  return svg.slice(0, a.start) + svg.slice(a.end, h.end) + svg.slice(a.start, a.end) + svg.slice(h.end);
}

/**
 * Gövde, kollar ve başı tek grupta toplar ki kalçadan birlikte eğilsinler: çizimde bunlar kardeş gruplardır, gövdeyi
 * döndürmek kolları ve başı yerinde bırakırdı. Parçalardan biri yoksa, aynı düzeyde değillerse ya da aralarında
 * bacak varsa (bacak gövdeyle eğilmemeli) çizime dokunulmaz.
 */
export function wrapTorso(svg: string, prefix: string): string {
  const spans = groupSpans(svg);
  const parts = TORSO_PARTS.map((p) => spans.get(prefix + p));
  if (parts.some((p) => !p || p.depth !== parts[0]!.depth)) return svg;
  const start = Math.min(...parts.map((p) => p!.start));
  const end = Math.max(...parts.map((p) => p!.end));
  for (const leg of ["leg-l", "leg-r"]) {
    const l = spans.get(prefix + leg);
    if (l && l.start >= start && l.end <= end) return svg;
  }
  return `${svg.slice(0, start)}<g id="${prefix}torso">${svg.slice(start, end)}</g>${svg.slice(end)}`;
}

/** Elin (avucun ortasının) tuvaldeki yeri: sağ el (elde tutulan nesne onu izler) ya da sol el (denetim). */
export function handPoint(placed: PlacedLayer, layer: VectorLayer, m: Motion, side: "l" | "r" = "r"): [number, number] {
  // Karakter hareketinde poz her zaman vardır; "?? 0" yalnız tip için (Partial).
  /* v8 ignore next */
  const a = m.pose?.[`arm-${side}`]?.rotate ?? 0;
  /* v8 ignore next */
  const f = m.pose?.[`forearm-${side}`]?.rotate ?? 0;
  // Kameraya uzanan (kısalan) ön kolda el de dirseğe yakın.
  /* v8 ignore next */
  const fs = m.pose?.[`forearm-${side}`]?.sy ?? 1;
  // Kısalan üst kolda dirsek omza yakın (ön kol kendi boyunda kalır).
  /* v8 ignore next */
  const us = m.pose?.[`arm-${side}`]?.sy ?? 1;
  const [sx, sy] = (m.profile ? RIG_SIDE : RIG).pivots[`arm-${side}`];
  const [ex, ey] = (m.profile ? RIG_SIDE : RIG).pivots[`forearm-${side}`];
  const elbow = rot([ex - sx, (ey - sy) * us], a);
  const hand = rot([0, ARM.reach * fs], a + f);
  return rigToCanvas(placed, layer, m, [sx + elbow[0] + hand[0], sy + elbow[1] + hand[1]]);
}

/**
 * Üst gövdedeki bir iskelet noktasının (iskelet tuvali) sahne tuvalindeki yeri: gövde eğilmesi, aynalama ve katmanın
 * bütün dönüşümü (yürüme, ölçek, dönüş) uygulanır.
 */
export function rigToCanvas(placed: PlacedLayer, layer: VectorLayer, m: Motion, [x, y]: readonly [number, number]): [number, number] {
  let rx = x;
  let ry = y;
  // Üst gövde eğildiyse nokta da onunla gider (CSS: kalçadan çevir, ölçekle, kaydır).
  const tp = m.pose?.torso;
  if (tp) {
    const [hx, hy] = (m.profile ? RIG_SIDE : RIG).pivots.body;
    const [qx, qy] = rot([(rx - hx) * tp.sx, (ry - hy) * tp.sy], tp.rotate);
    rx = hx + tp.tx + qx;
    ry = hy + tp.ty + qy;
  }
  if (m.flip) rx = RIG.width - rx;
  // Katman dönüşümünün merkezi alt-orta noktadır (transformOrigin 50% 100%).
  const k = (placed.height / RIG.height) * m.tr.scale;
  const kx = k * m.squash;
  const [dx, dy] = rot([(rx - RIG.width / 2) * kx, (ry - RIG.height) * k], layer.rotate + m.tr.rotate);
  return [placed.x + m.tr.x + dx, placed.y + m.tr.y + dy];
}

/** draw_on penceresindeki ilerleme (kalem sabit hızda, yumuşatma yok); animasyon yoksa undefined. */
function drawOf(anims: VectorAnim[], p: number): number | undefined {
  const a = anims.find((x) => x.type === "draw_on");
  return a && local(p, a);
}

/** 3D figürün ayak altındaki yumuşak gölgesi (SVG karakterlerde gölge çizimin içinde). */
const CONTACT_SHADOW: CSSProperties = {
  position: "absolute",
  left: "12%",
  width: "76%",
  bottom: "-2.5%",
  height: "5%",
  borderRadius: "50%",
  background: "radial-gradient(closest-side, rgba(20,14,10,0.42), rgba(20,14,10,0))",
};

function Layer({
  layer,
  asset,
  placed,
  motion,
  prefix,
  sketch,
  draw,
  zoom = 1,
}: {
  layer: VectorLayer;
  asset: VectorAsset;
  placed: PlacedLayer;
  motion: Motion;
  prefix: string;
  sketch: boolean;
  /** draw_on ilerlemesi (0–1); yoksa katman olduğu gibi çizilir. */
  draw?: number;
  /** Kameranın en büyük zoom'u: 3D figür tuvali yakın çekimde buna göre keskin çizilir. */
  zoom?: number;
}) {
  const { width: w, height: h } = placed;
  const { tr, pose } = motion;
  // 3D figür: SVG yerine three.js kuklası (yürürken kendisi yana döner). WebGL açılamazsa SVG pozuyla birlikte yedek
  // olarak gösterilir.
  const figure = asset.meta.figure;
  // Kaşlar sol ve sağa ayrılır: ifadenin eğimi her kaşı kendi ortasında döndürür (3D figürün kaşları kendisinde).
  const look = motion.side ?? asset;
  const split = figure ? undefined : browsFor(look);
  const prefixed = prefixSvgIds(fitSvg(split?.svg ?? look.svg, "meet"), prefix);
  // Düşünen el yüzün önünde (yandan yürürken front yok: yan çizimde kol jesti uygulanmaz).
  const raw = motion.front ? armInFront(prefixed, prefix, motion.front) : prefixed;
  const shaped = pose?.torso ? wrapTorso(raw, prefix) : raw;
  // Elle çizim: öğeler bir kez işaretlenir (paper.js uzunlukları), her karede yalnız CSS değişir.
  const drawing = draw !== undefined && !figure;
  const plan = useMemo(() => (drawing ? drawPlan(shaped, `${prefix}d`) : undefined), [drawing, shaped, prefix]);
  const drawnSvg = plan?.svg ?? shaped;
  // Konuşan ağız: şekiller bir kez ağzın yanına gizli konur; konuşurken çizimin ağzı gizlenir, o anın şekli görünür.
  // Yan çizimin ve 3D figürün ağzı ölçülmez.
  const mouth = !figure && !motion.side && layer.anims.some((a) => a.type === "talk") ? faceFor(asset).mouth : undefined;
  const mood = EXPRESSIONS[layer.expression ?? "neutral"].mood;
  const mouths = useMemo(() => (mouth ? withMouths(drawnSvg, prefix, mouth, mood) : undefined), [drawnSvg, prefix, mouth, mood]);
  const svg = mouths ?? drawnSvg;
  const ids = mouthIds(prefix);
  const speakCss = mouths && motion.speak ? `#${ids.mouth}{visibility:hidden}#${ids.shape(motion.speak)}{display:inline}` : "";

  // İskeletli karakterde parça dönüşleri kimlik seçicisiyle uygulanır (dönme noktaları RIG'de sabit).
  const rigCss = pose
    ? Object.entries(pose)
        .map(([k, v]) => {
          const pivots = (motion.side ? RIG_SIDE : RIG).pivots;
          // Kaş kendi ortasında döner; ayrılamayan çizimde kaşın tek parçası yok (kural yazılmaz).
          const brow = k.startsWith("brow-") ? split?.centres[k as BrowPart] : undefined;
          if (k.startsWith("brow-") && !brow) return "";
          const [px, py] = brow ?? (k === "torso" ? pivots.body : pivots[k as RigPart]);
          // Kısalan üst kol (kameraya uzanan) ön kolu bozmaz: ön kol üst kolun ölçeğini dirsekte geri alır, yalnız
          // dirsek omza yaklaşır (ön kol üst kola göre döndüğü için kendi ölçeğiyle geri almak onu eğerdi).
          const up = k.startsWith("forearm-") ? pose[`arm-${k.slice(-1)}` as RigPart] : undefined;
          const undo = up && (up.sx !== 1 || up.sy !== 1) ? `scale(${(1 / up.sx).toFixed(4)}, ${(1 / up.sy).toFixed(4)}) ` : "";
          const transform = `${undo}translate(${v.tx.toFixed(2)}px, ${v.ty.toFixed(2)}px) rotate(${v.rotate.toFixed(2)}deg) scale(${v.sx.toFixed(3)}, ${v.sy.toFixed(3)})`;
          return `#${prefix}${k}{transform:${transform};transform-origin:${px}px ${py}px;transform-box:view-box}`;
        })
        .join("")
    : "";

  const style: CSSProperties = {
    position: "absolute",
    left: placed.x - w / 2,
    top: placed.y - h,
    width: w,
    height: h,
    opacity: layer.opacity * tr.opacity,
    transform: `translate(${tr.x}px, ${tr.y}px) rotate(${layer.rotate + tr.rotate}deg) scale(${tr.scale * motion.squash * (motion.flip ? -1 : 1)}, ${tr.scale})`,
    transformOrigin: "50% 100%",
    filter: sketch ? "url(#ys-sketch)" : undefined,
  };
  const drawn = <div style={{ width: "100%", height: "100%" }} dangerouslySetInnerHTML={{ __html: svg }} />;
  return (
    <div style={style}>
      {rigCss && <style>{rigCss + speakCss}</style>}
      {plan && <style>{drawCss(plan, draw!)}</style>}
      {figure ? (
        <>
          {/* Temas gölgesi: 3D figür zemine bassın (oturan karakterde yok). */}
          {!placed.sitting && <div data-contact style={CONTACT_SHADOW} />}
          <Figure3D spec={figure} pose={pose} view={{ turn: motion.turn, profile: motion.profile }} fallback={drawn} scale={(h * zoom) / RIG.height} />
        </>
      ) : (
        drawn
      )}
    </div>
  );
}
/**
 * Ekran yazısı düzeni (31 Eki: yazılar her çekimde başka boyda, başka yerde ve eğik/kalın karışık duruyordu).
 * - Bilgi kartı: mekân, tarih, olay, sayı, alıntı (label dışındaki her stil) her çekimde aynı yerde, sol üstte alt alta;
 *   yönetmenin x/y'si yok sayılır. Birincil satır (başlık, sayı) büyük, ikincil satır (alt başlık, alıntı) küçük.
 * - Kişi etiketi (label): yönetmenin noktasına en yakın kişinin kafasının üstünde (yakında kişi yoksa o noktada), kamerayla
 *   birlikte taşınır; tek boyda.
 * Hepsi aynı yazı tipi, aynı plaka; kartın solunda paletin vurgu rengiyle çizgi.
 */
const TEXT_SIZE: Record<VectorText["style"], number> = { title: 64, number: 72, subtitle: 44, quote: 44, label: 40 };
const FONT = "Inter, 'Noto Sans', 'Segoe UI', sans-serif";
export const CARD = { x: 72, verticalX: 300, top: 64, width: 960, gap: 12 };

/** Kukla tuvalinde kafanın tepesi kutunun üstünden bu oranda aşağıda (RIG: kaşlar 140, gözler 170 → tepe ~80/800). */
const HEAD_TOP = 0.1;

/** Ekranda aynı anda en fazla bu kadar yazı; üst ve alt sınır (alttaki ~%25 altyazının). Stüdyo kurallarından. */
const { maxTexts: MAX_TEXTS, top: TEXT_TOP, bottom: TEXT_BOTTOM } = TEXT_RULES;
const TAG_WIDTH = 900;
const TEXT_GAP = 24;

/** Etiketin ekrandaki dayanak noktası; head: y bir kafanın tepesidir. */
interface TagAnchor {
  x: number;
  y: number;
  head?: boolean;
}
/** Etiket ile kafa arası (px). */
const TAG_LIFT = 14;
/** Yönetmenin etiket noktası bir kafaya bundan yakınsa etiket o kişiye bağlanır (tuval px). */
const TAG_SNAP = 360;

/** Ekrandaki baş tepesi ve ayak noktasından: yüz kadrajda mı (baş boyun ~1/7'si; tamamı kenarın dışındaysa görünmüyor). */
export function faceOnScreen([x, top]: readonly [number, number], [, foot]: readonly [number, number]): boolean {
  const face = top + (foot - top) / 7;
  return x >= 0 && x <= W && face >= 0 && top <= H;
}

/** Etiket bir kişinin adı mı: biri ötekini içeriyorsa (büyük/küçük harf duyarsız; "Babbage" ↔ "Charles Babbage"). */
export function namesMatch(name: string, label: string): boolean {
  const a = name.trim().toLocaleLowerCase("tr");
  const b = label.trim().toLocaleLowerCase("tr");
  return a.length > 2 && b.length > 2 && (a.includes(b) || b.includes(a));
}

interface PlacedText {
  text: VectorText;
  /** Kartta satırın sol kenarı (sağdaki kartta sağ kenarı), etikette merkez x. */
  x: number;
  /** Kartta satırın üst kenarı, etikette merkez y. */
  y: number;
  size: number;
  card: boolean;
  /** Bilgi kartı sağ üstte (sol üst bir karakterle doluydu). */
  right?: boolean;
}

/**
 * Sahnenin (1920×1080 tuval) videoya ölçeği: aynı oranda 1; dikeyde tam sığdırma sahneyi çok küçültür, 1,3 kat yakın
 * çekim (kenarlardan ~%12 kırpılır); yatay/kareye yakın oranlarda büyütme yok.
 */
export function stageFit(width: number, height: number): number {
  return Math.min(height / H, (width / W) * (width < height ? 1.3 : 1));
}

/** Dikeyde içeriğin görünen bandın kenarına bırakılan pay (tuval px). */
const CONTENT_MARGIN = 30;

/**
 * Dikey kadrajda sahnenin ölçeği: içerik (ekrandaki yatay uçları, tuval px) görünen banda sığmıyorsa sahne küçülür,
 * en çok tuvalin tamamı görünene kadar. Yatay bölümden türetilen Short'ta yanlara yerleşmiş kişi kesiliyordu; içerik
 * zaten ortadaysa ölçek değişmez.
 */
export function contentFit(width: number, base: number, xs: number[]): number {
  if (!xs.length) return base;
  const half = Math.max(...xs.map((x) => Math.abs(Math.min(W, Math.max(0, x)) - W / 2))) + CONTENT_MARGIN;
  return Math.max(width / W, Math.min(base, width / (2 * half)));
}

/**
 * Kişi etiketlerinin tuvaldeki yatay aralığı: dikey videoda tuvalin ekranda görünen kısmı, sağda platformun düğmelerinin
 * altında kalan şerit hariç (VERTICAL_SAFE); öteki oranlarda bütün tuval.
 */
export function tagBounds(width: number, height: number, fit = stageFit(width, height)): { left: number; right: number } {
  if (height <= width) return { left: 0, right: W };
  const offset = (width - W * fit) / 2;
  return { left: Math.max(0, -offset / fit), right: Math.min(W, (width - VERTICAL_SAFE.right - offset) / fit) };
}

/** Satır sayısının kaba tahmini (ortalama harf genişliği ~0,55 em); en fazla iki satıra sığana dek küçülür. */
function fit(text: string, size: number, width: number): { size: number; lines: number } {
  const lines = (s: number) => Math.max(1, Math.ceil((text.length * s * 0.55) / width));
  while (lines(size) > 2 && size > 30) size -= 4;
  return { size, lines: lines(size) };
}

/**
 * Yazıları yerleştirir: bilgi kartı satırları sol üstte alt alta, kişi etiketleri kendi yerinde (altyazı bölgesinin
 * üstüne sıkıştırılır; yatayda örtüştüğü kartın ya da etiketin altına iner, birbirine binmez). En fazla iki yazı. vertical: 9:16'da kart kırpılan
 * kenardan içeri alınır.
 */
export function layoutTexts(
  texts: VectorText[],
  vertical = false,
  anchor: (text: VectorText) => TagAnchor | undefined = (text) => ({ x: text.x, y: text.y }),
  bounds: { left: number; right: number } = { left: 0, right: W },
  /** Ekranda karakterlerin kafa ve üst gövdesi: bilgi kartı onları örtecekse karşı üst köşeye geçer. */
  occupied: Box[] = [],
): PlacedText[] {
  // Dayanağı olmayan etiket (adı geçen kişi bu çekimde yok) gösterilmez ve sınırdan yer kapmaz: ayıklama sınırdan önce.
  const anchors = new Map(texts.filter((text) => text.style === "label").map((text) => [text, anchor(text)]));
  const shown = texts.filter((text) => text.style !== "label" || anchors.get(text)).slice(0, MAX_TEXTS);
  let cardBottom = CARD.top;
  const card = shown
    .filter((text) => text.style !== "label")
    .map((text) => {
      const { size, lines } = fit(text.text, TEXT_SIZE[text.style], CARD.width);
      const y = cardBottom;
      const height = lines * size * 1.15 + size * 0.3;
      cardBottom += height + CARD.gap;
      return { text, x: vertical ? CARD.verticalX : CARD.x, y, size, height, card: true };
    });
  // Kart sol üstte bir karakterin başını ya da kaldırdığı kolunu örtüyorsa (3 Kas, Pascal: "1970" kartı sevinen kişinin
  // elinin üstündeydi) ve sağ üst belirgin biçimde boşsa kart sağa, sağa yaslı geçer.
  const margin = vertical ? CARD.verticalX : CARD.x;
  const blockWidth = Math.max(0, ...card.map((c) => plateWidth(c.text.text, c.size, CARD.width)));
  const block = (x: number): Box => ({ x, y: CARD.top, w: blockWidth, h: cardBottom - CARD.top });
  const covered = (b: Box) => occupied.reduce((n, o) => n + overlap(b, o), 0);
  // Solda kayda değer bir örtüşme varsa (kartın %15'i; kenara değen kol sayılmaz) ve sağ belirgin biçimde boşsa
  // (örtülen alan yarıdan az) geçer; eşitlikte yerinde kalır.
  const leftCovered = covered(block(margin));
  const right = card.length > 0 && leftCovered > blockWidth * (cardBottom - CARD.top) * 0.15 && covered(block(W - margin - blockWidth)) < leftCovered / 2;
  // Sağdaki kartta x satırın sağ kenarıdır.
  if (right) for (const c of card) c.x = W - margin;
  const tags = shown
    .filter((text) => text.style === "label")
    .map((text) => {
      const at = anchors.get(text)!;
      const { size, lines } = fit(text.text, TEXT_SIZE.label, TAG_WIDTH);
      const height = lines * size * 1.15;
      // Kafaya bağlı etiket kafanın hemen üstünde durur (y kafanın tepesi); değilse y etiketin ortasıdır.
      const y = at.head ? at.y - height / 2 - TAG_LIFT : at.y;
      // Kenar sınırı yazının kendi genişliğiyle: kenardaki kişinin etiketi ondan uzağa itilmesin.
      const half = plateWidth(text.text, size, TAG_WIDTH) / 2;
      return { text, x: Math.min(bounds.right - half - 24, Math.max(bounds.left + half + 24, at.x)), y: Math.min(TEXT_BOTTOM, Math.max(TEXT_TOP, y)), size, height, half, card: false };
    })
    .sort((a, b) => a.y - b.y);
  // Etiket yalnız yatayda örtüştüğü karta ya da etikete binmesin diye onun altına iner: yan yana iki kişinin etiketi
  // kendi kafalarının üstünde kalır (eskiden ikincisi her durumda alta itilip yüzün üstüne düşüyordu; inceleme
  // "text_overlap", 1 Kas). Alt sınırı aşarsa etiketler birlikte yukarı kayar.
  const boxes = card.map((c) => {
    const w = plateWidth(c.text.text, c.size, CARD.width);
    const left = right ? c.x - w : c.x;
    return { left, right: left + w, bottom: c.y + c.height };
  });
  let bottom: number = TEXT_TOP;
  for (const t of tags) {
    const left = t.x - t.half;
    const right = t.x + t.half;
    for (const b of boxes) if (left < b.right + TEXT_GAP && right > b.left - TEXT_GAP) t.y = Math.max(t.y, b.bottom + TEXT_GAP + t.height / 2);
    t.y = Math.max(t.y, TEXT_TOP + t.height / 2);
    boxes.push({ left, right, bottom: t.y + t.height / 2 });
    bottom = Math.max(bottom, t.y + t.height / 2);
  }
  const overflow = bottom - TEXT_BOTTOM;
  if (overflow > 0) for (const t of tags) t.y -= overflow;
  return [
    ...card.map(({ text, x, y, size }) => ({ text, x, y, size, card: true, ...(right ? { right } : {}) })),
    ...tags.map(({ text, x, y, size }) => ({ text, x, y, size, card: false })),
  ];
}

/** Yazı plakasının kaba genişliği: harf başına ~0,55 em (en çok kutu genişliği) + iki yanda 0,5 em dolgu. */
function plateWidth(text: string, size: number, width: number): number {
  return Math.min(width, text.length * size * 0.55) + size;
}

/** #rgb/#rrggbb rengin bağıl parlaklığı (0–1); çözülemezse undefined. */
function luminance(color: string): number | undefined {
  const m = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color.trim());
  if (!m) return undefined;
  const hex = m[1]!.length === 3 ? [...m[1]!].map((ch) => ch + ch).join("") : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/**
 * Yazı rengi yalnız açık renkse kullanılır; koyu konturlu yazı her zeminde açık renkle okunur
 * (30 Eki incelemesi: lacivert pencere üstünde teal rakamlar okunmuyordu).
 */
export function readable(color: string | undefined): string | undefined {
  if (!color) return undefined;
  const l = luminance(color);
  return l !== undefined && l >= 0.35 ? color : undefined;
}

/** "1971" ya da "60.000 $" gibi metindeki ilk sayıyı sıfırdan sayarak gösterir. */
function countUp(text: string, k: number): string {
  const m = /\d[\d.,]*/.exec(text);
  if (!m) return text;
  const raw = m[0].replace(/[.,]+$/, "");
  // Son ayraçtan sonra tam 3 hane yoksa ondalıktır ("3.14", "1,5", "%2,5"); 3 hane binliktir ("60.000").
  const last = Math.max(raw.lastIndexOf("."), raw.lastIndexOf(","));
  const decimal = last >= 0 && raw.length - last - 1 !== 3 ? raw[last]! : "";
  const decimals = decimal ? raw.length - last - 1 : 0;
  const intPart = decimal ? raw.slice(0, last) : raw;
  const group = /[.,]/.exec(intPart)?.[0] ?? "";
  const value = Number(intPart.replace(/[.,]/g, "") + (decimal ? `.${raw.slice(last + 1)}` : ""));
  const now = (value * k).toFixed(decimals);
  const [whole, frac] = now.split(".");
  // Yıl gibi ayraçsız sayılar ayraçsız kalır.
  const grouped = group ? whole!.replace(/\B(?=(\d{3})+(?!\d))/g, group) : whole!;
  return text.replace(raw, frac ? `${grouped}${decimal}${frac}` : grouped);
}

function Text({ placed, p, t, seed, accent, dur }: { placed: PlacedText; p: number; t: number; seed: string; accent: string; /** Çekim süresi (sn). */ dur: number }) {
  const { text, y, size, card, right } = placed;
  // Sağdaki kart: x kutunun sağ kenarı, yazı sağa yaslı.
  const x = right ? placed.x - CARD.width : placed.x;
  const tr = layerTransform(text.anims, p, t, seed, { x, y });
  let shown = text.text;
  // Yazı animasyonları doğal hızında oynar, sonra yazı durur (revealWindow).
  const reveal = (a: VectorAnim) => local(p, revealWindow(a, text.text, dur));
  for (const a of text.anims) {
    if (a.type === "typewriter") shown = shown.slice(0, Math.round(shown.length * reveal(a)));
    if (a.type === "count_up") shown = countUp(shown, Easing.out(Easing.cubic)(reveal(a)));
  }
  const kinetic = text.anims.find((a) => a.type === "kinetic");
  const q = kinetic && reveal(kinetic);
  const plate = useKinetic(q, wordCount(shown));
  const bar = readable(accent) ?? "#ffd84d";
  const primary = text.style === "title" || text.style === "number";
  return (
    <div
      data-text={card ? "card" : "tag"}
      style={{
        position: "absolute",
        left: card ? x : x - TAG_WIDTH / 2,
        top: y,
        width: card ? CARD.width : TAG_WIDTH,
        textAlign: right ? "right" : card ? "left" : "center",
        transform: `translate(${tr.x}px, ${card ? "" : "calc(-50% + "}${tr.y}px${card ? "" : ")"}) rotate(${tr.rotate}deg) scale(${tr.scale})`,
        transformOrigin: card ? "0 0" : "50% 50%",
        opacity: tr.opacity,
        color: readable(text.color) ?? (text.style === "number" ? bar : "white"),
        fontFamily: FONT,
        fontSize: size,
        fontWeight: primary ? 800 : 600,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1.15,
        letterSpacing: primary ? -0.5 : 0,
        textShadow: "0 2px 10px rgba(0,0,0,0.45)",
      }}
    >
      {shown && (
        // Yarı saydam plaka: yazı dolu bir duvarın üstüne düşse de okunur. Kartta solda vurgu çizgisi.
        <span
          ref={plate}
          style={{
            display: "inline-block",
            padding: "0.14em 0.5em 0.16em",
            borderRadius: 10,
            background: "rgba(14,16,22,0.66)",
            boxShadow: "0 6px 24px rgba(0,0,0,0.22)",
            ...(card && right ? { borderRight: `6px solid ${bar}`, borderTopRightRadius: 2, borderBottomRightRadius: 2 } : {}),
            ...(card && !right ? { borderLeft: `6px solid ${bar}`, borderTopLeftRadius: 2, borderBottomLeftRadius: 2 } : {}),
          }}
        >
          {q === undefined ? shown : splitWords(shown)}
        </span>
      )}
    </div>
  );
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Rota i'nin çizilme aralığı (çekim oranı): rotalar sırayla, her biri çekimin ~%45'inde çizilir. */
const routeWindow = (i: number) => [0.1 + i * 0.15, 0.55 + i * 0.15] as const;

/**
 * Koddan üretilen haritanın canlı katmanı: rotalar çizilerek ilerler, ülke adları önce, şehir ve rota etiketleri
 * sırayla belirir. Etiketler React metni olarak çizilir (SVG'ye metin gömülmez; temizleyici metni siler).
 */
function MapOverlay({ meta, p, prefix }: { meta: VectorAsset["meta"]; p: number; prefix: string }) {
  const routes = meta.routes ?? 0;
  const css = Array.from({ length: routes }, (_, i) => {
    const [a, b] = routeWindow(i);
    const k = Easing.inOut(Easing.cubic)(clamp01((p - a) / (b - a)));
    return `#${prefix}route-${i}{stroke-dashoffset:${(1 - k).toFixed(4)}}`;
  }).join("");
  return (
    <>
      {css && <style>{css}</style>}
      {(meta.labels ?? []).map((l, i) => {
        const appear = l.kind === "country" ? 0.03 : l.kind === "route" ? routeWindow(l.order - 1)[1] : 0.12 + (l.order - routes - 1) * 0.07;
        const k = clamp01((p - appear) / 0.06);
        if (k <= 0) return null;
        const style: CSSProperties =
          l.kind === "country"
            ? { fontSize: 30, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: "#3a3f48", textShadow: "0 0 6px #fff, 0 0 12px #fff" }
            : l.kind === "city"
              ? { fontSize: 26, fontWeight: 700, color: "#1f2430", background: "rgba(255,255,255,0.88)", padding: "2px 12px", borderRadius: 10 }
              : { fontSize: 26, fontWeight: 700, color: "#fff", background: "rgba(31,36,48,0.86)", padding: "3px 14px", borderRadius: 10 };
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: l.x,
              top: l.y,
              transform: `translate(-50%, calc(-50% + ${(1 - k) * 12}px))`,
              opacity: k,
              whiteSpace: "nowrap",
              fontFamily: "Inter, 'Noto Sans', 'Segoe UI', sans-serif",
              ...style,
            }}
          >
            {l.text}
          </div>
        );
      })}
    </>
  );
}

/** Karakterlerin arkasında kalan atmosfer: konfeti, kıvılcım ve toz yüzleri örtmesin (inceleme: "konfeti yüzü kapatıyor"). */
const BEHIND = new Set<Visual["ambience"]>(["confetti", "embers", "dust"]);

/**
 * Büyütme balonu: nesnenin çizimi yuvarlak, kenarlı bir pencerede büyük; pencereden nesneye ince bir çizgi ve nesnenin
 * üstünde küçük bir nokta. Yaylanarak açılır, çekim sonuna kadar kalır.
 */
function Callout({ asset, target, at, p, prefix, accent }: { asset: VectorAsset; target: readonly [number, number]; at: readonly [number, number]; p: number; prefix: string; accent: string }) {
  const s = calloutScale(p);
  if (s === 0) return null;
  const { r } = CALLOUT;
  const svg = prefixSvgIds(fitSvg(asset.svg, "meet"), prefix);
  return (
    <div data-callout={asset.id} style={{ position: "absolute", left: 0, top: 0, width: W, height: H, opacity: Math.min(1, s) }}>
      <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }}>
        <line x1={at[0]} y1={at[1]} x2={target[0]} y2={target[1]} stroke={accent} strokeWidth={4} strokeDasharray="10 8" strokeLinecap="round" />
        <circle cx={target[0]} cy={target[1]} r={9} fill={accent} stroke="white" strokeWidth={3} />
      </svg>
      <div
        style={{
          position: "absolute",
          left: at[0] - r,
          top: at[1] - r,
          width: 2 * r,
          height: 2 * r,
          borderRadius: "50%",
          overflow: "hidden",
          background: "radial-gradient(circle at 35% 30%, #ffffff, #f1ece2 70%, #e3dccd)",
          border: `6px solid ${accent}`,
          boxShadow: "0 18px 40px rgba(0,0,0,0.35)",
          transform: `scale(${s})`,
        }}
      >
        <div style={{ position: "absolute", inset: "13%" }} dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </div>
  );
}

/** Çekimin ışık havası: aynı palet bütün videoda göz yormasın (30 Eki geri bildirimi). */
const MOOD_GRADE: Record<VectorMood, CSSProperties> = {
  neutral: {},
  day: { background: "rgba(255,246,225,0.12)", mixBlendMode: "soft-light" },
  warm: { background: "linear-gradient(180deg, rgba(255,160,70,0.34), rgba(255,95,45,0.22))", mixBlendMode: "soft-light" },
  cool: { background: "linear-gradient(180deg, rgba(70,150,255,0.30), rgba(40,90,200,0.22))", mixBlendMode: "soft-light" },
  night: { background: "linear-gradient(180deg, rgba(8,20,60,0.55), rgba(15,25,55,0.40))", mixBlendMode: "multiply" },
  dramatic: { background: "radial-gradient(ellipse at center, rgba(140,30,50,0.10) 30%, rgba(30,0,10,0.55) 100%)", mixBlendMode: "multiply" },
};

export function VectorScene({
  visual,
  assets,
  palette,
  lineStyle = "outline",
  texture = "none",
  speech = [],
  ambience = "none",
  insets = true,
}: {
  visual: Visual;
  assets: Assets;
  palette: string[];
  lineStyle?: LineStyle;
  /** Stil paketinin dokusu: sahnenin üstüne, yazıların altına. */
  texture?: Texture;
  /** Anlatımın kelime zamanları (bölüm başından, ms): konuşan karakterin ağzı bunlarla oynar. */
  speech?: WordTiming[];
  /** Atmosfer: konfeti, kıvılcım ve toz karakterlerin arkasında; yağmur, kar, sis ve ışık önde; hepsi yazıların altında. */
  ambience?: Visual["ambience"];
  /** Büyütme balonu (küçük resimde kapalı: başlıkla yarışmasın). */
  insets?: boolean;
}) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  // Dudak senkronu: anlatımın kelime zamanlarından ağız şekilleri (bölüm başından ms); her kare o anın şekli.
  // Konuşma vurguları: baş, kaş ve el bunlara denk gelir (beats.ts).
  const cues = useMemo(() => visemeCues(speech), [speech]);
  const beats = useMemo(() => speechBeats(speech), [speech]);
  const strokes = useMemo(() => armBeats(beats), [beats]);
  const phrases = useMemo(() => beats.filter((b) => b.phrase), [beats]);
  const ms = ((visual.fromFrame + frame) / fps) * 1000;
  const stroke = strokeAt(strokes, ms);
  const voice: Voice | undefined = speech.length
    ? { viseme: visemeAt(cues, ms), nod: pulseAt(beats, ms, BEAT.nod), brow: pulseAt(phrases, ms, BEAT.brow), stroke: stroke.k, strokeIndex: stroke.index }
    : undefined;
  const overlay = Boolean(visual.overlay);
  const dur = visual.durationInFrames / fps;
  const model = useMemo(() => shotModel(visual.vector!, assets, lineStyle, width, height, overlay, dur), [visual.vector, assets, lineStyle, width, height, overlay, dur]);
  const shot = shotFrame(model, { shotId: visual.shotId, frame, fps, durationInFrames: visual.durationInFrames, voice, width, height, insets, overlay });
  const [c0 = "#1d2433", c1 = "#3a4a66", accent = "#ffd84d"] = palette;
  const grain = useMemo(() => textureLayer(texture, `${visual.shotId}-tex`), [texture, visual.shotId]);
  return <ShotStage {...model} {...shot} {...{ visual, lineStyle, ambience, grain, texture, c0, c1, accent, width, height }} />;
}

/** Çekimin kareden bağımsız kurgusu: temizlenmiş varlıklar, yerleşim ve son kamera (render ve denetim aynı sonucu görür). */
export interface ShotModel {
  spec: VectorShot;
  safe: Assets;
  placed: PlacedLayer[];
  bg?: VectorAsset;
  /** Geniş çekimde kadrajda kalması gerekenler (kişiler ve küçük nesneler; sahneye giren hariç). */
  keep: PlacedLayer[];
  cam: VectorShot["camera"];
  centre: boolean;
  /** Yakın çekimin öznesi olan nesnenin katmanı (closeUpCamera); okunur boya gelemediyse balon ona açılır. */
  subject?: number;
  /** Dikey kadrajda sahnenin ölçeği. */
  fit: number;
  /** Yönetmen planında kodun düzelttiği ya da düşürdüğü jestler (staging.ts); denetim bunları bildirir. */
  problems: StagingProblem[];
}

/** Katman sahneye giriyor ya da yer değiştiriyor (yürüme, kayma, taşınma). */
const movingLayer = (spec: VectorShot, i: number) => spec.layers[i]!.anims.some((a) => a.type === "walk" || a.type === "slide_in" || a.type === "move");

/**
 * Çekimin kurgusu (kareden bağımsız): temizlenmiş varlıklar, sahnelenmiş plan, yerleşim ve kamera. Render (VectorScene)
 * ve denetim (lint.ts) aynısını kullanır. dur: çekim süresi (sn).
 */
export function shotModel(vector: VectorShot, assets: Assets, lineStyle: LineStyle, width: number, height: number, overlay: boolean, dur: number): ShotModel {
  // Eski planlarda aynı karakterin kopyaları olabilir; render'da da tek kalır.
  const unique = uniqueCharacters(vector, (id) => assets[id]?.kind === "character");
  // Varlıklar üretimde temizlenir; gömmeden önce bir kez daha (savunma derinliği).
  const safe: Assets = Object.fromEntries(
    Object.entries(assets).flatMap(([id, a]) => {
      // Arka plan da dahil bütün varlıklar aynı çizgi stiline getirilir; gerçek veriden üretilenler (harita, bayrak) hariç.
      // Bozuk tek varlık bütün vektör çekimlerini düşürmesin: o varlık atlanır.
      try {
        return [[id, { ...a, svg: a.meta.exact ? sanitizeSvg(a.svg) : applyLineStyle(sanitizeSvg(a.svg), lineStyle) }]];
      } catch {
        return [];
      }
    }),
  );
  // Yönetmen planının saçma jestleri: elde tutma yerleşimi değiştirdiği için önce; işaret ve iş jesti yerleşimden sonra.
  const before = stageBefore(unique, safe, dur);
  const placed = resolveLayout(before.spec, safe);
  const after = stageAfter(before.spec, placed, safe, (i) => focusOf(before.spec, placed, i, (j) => safe[before.spec.layers[j]!.asset]?.kind).aim !== undefined);
  const spec = after.spec;
  const problems = [...before.problems, ...after.problems];
  const bg = spec.background ? safe[spec.background] : undefined;
  const moving = (i: number) => movingLayer(spec, i);
  // Geniş çekimde kadrajda kalacaklar: karakterler ve sahnedeki küçük nesneler; sahneye giren (yürüyen, kayan) hariç.
  const keep = placed.filter((pl) => {
    const layer = spec.layers[pl.index]!;
    if (moving(pl.index)) return false;
    return safe[layer.asset]!.kind === "character" || ((pl.grounded || pl.heldBy !== undefined) && pl.width < W * 0.4);
  });
  const { cam, centre, subject } = ((): { cam: VectorShot["camera"]; centre: boolean; subject?: number } => {
    const isPerson = (pl: PlacedLayer) => safe[spec.layers[pl.index]!.asset]!.kind === "character";
    const close = closeUpCamera(spec.camera, heldFraming(placed, spec.layers), Boolean(bg?.meta.exact), (pl) => !isPerson(pl), (pl) => isPerson(pl) && !moving(pl.index));
    if (bg?.meta.exact) return close;
    // Yerinde duranların yüzleri (dinlenme pozunda): kadrajın kenarında yarım kalmasın (faceSafe).
    const neutral = (pl: PlacedLayer): Motion => ({ tr: { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }, flip: spec.layers[pl.index]!.flip, squash: 1 });
    const still = placed.filter((pl) => isPerson(pl) && !moving(pl.index));
    const faces = still.map((pl) => boxOf(faceCorners(safe[spec.layers[pl.index]!.asset]!).map((c) => rigToCanvas(pl, spec.layers[pl.index]!, neutral(pl), c))));
    const bodies = still.map((pl) => ({ x: pl.x - pl.width / 2, y: pl.y - pl.height, w: pl.width, h: pl.height }));
    if (close.centre) return { ...close, cam: faceSafe(close.cam, true, faces, true, bodies) };
    // Boş geniş çekim içeriğe yaklaşır; sahneye giren biri varsa yolu kadrajda kalsın diye yaklaşılmaz.
    const filled = placed.some((pl) => moving(pl.index)) ? undefined : fillWide(close.cam, placed, (pl) => safe[spec.layers[pl.index]!.asset]!.kind === "character");
    const wide = filled ?? { cam: frameWide(close.cam, keep), centre: false };
    // Son olarak ayakta duranlar eklem yerinden kesilmez (oturanın bacağı masanın ardında, ona bakılmaz).
    const people = placed.filter((pl) => safe[spec.layers[pl.index]!.asset]!.kind === "character" && !pl.sitting);
    return { cam: faceSafe(jointSafe(wide.cam, wide.centre, people, keep), wide.centre, faces, false, bodies), centre: wide.centre };
  })();
  // Dikey kadraj: geniş çekimde kenara düşen kişi/nesne kesilmesin diye sahne gerektiği kadar küçülür (contentFit).
  // Yakın çekim bilerek kırpar; harita tuvalin tamamıdır; tahta ekrana sabittir, sahneyle aynı ölçekte kalmalı.
  const fit = (() => {
    const base = stageFit(width, height);
    if (height <= width || overlay || bg?.meta.exact || Math.max(cam.zoomFrom, cam.zoomTo) >= CLOSE_UP.zoom) return base;
    const xs = keep.flatMap((pl) => [0, 1].flatMap((q) => [pl.x - pl.width / 2, pl.x + pl.width / 2].map((x) => cameraPoint(cam, q, centre, [x, pl.y])[0])));
    return contentFit(width, base, xs);
  })();
  return { spec, safe, placed, ...(bg ? { bg } : {}), keep, cam, centre, ...(subject === undefined ? {} : { subject }), fit, problems };
}

/** Çekimin bir karesi: katmanların hareketi, ekrandaki yazılar, elde tutulanların yeri ve büyütme balonu. */
export interface ShotFrame {
  p: number;
  t: number;
  /** Kamera hareketinin yumuşatılmış ilerlemesi. */
  k: number;
  dur: number;
  motions: Map<number, Motion>;
  texts: ReturnType<typeof layoutTexts>;
  drawnAt: Map<number, PlacedLayer>;
  inset?: { asset: VectorAsset; target: [number, number]; at: [number, number] };
}

export function shotFrame(
  model: ShotModel,
  o: { shotId: string; frame: number; fps: number; durationInFrames: number; voice?: Voice; width: number; height: number; insets: boolean; overlay: boolean },
): ShotFrame {
  const { spec, safe, placed, bg, cam, centre, fit, subject } = model;
  const { shotId, frame, fps, voice, width, height, insets } = o;
  const p = Math.min(1, frame / Math.max(1, o.durationInFrames));
  const t = frame / fps;
  const k = interpolate(p, [0, 1], [0, 1], { easing: ease });
  const dur = o.durationInFrames / fps;
  const motions = new Map(
    placed.map((pl) => {
      const layer = spec.layers[pl.index]!;
      const asset = safe[layer.asset]!;
      const focus = asset.kind === "character" ? focusOf(spec, placed, pl.index, (i) => safe[spec.layers[i]!.asset]?.kind) : {};
      return [pl.index, motionOf(layer, asset, pl, p, t, `${shotId}-${pl.index}-`, dur, focus, safe[sideAssetId(layer.asset)], voice)] as const;
    }),
  );
  // Kişi etiketi yazı katmanında (kamera dışında) çizilir ama kişiye aittir: yönetmenin noktasına en yakın kafaya
  // bağlanır, kişi yürüdükçe ve kamera yaklaştıkça onunla gider. Eskiden tuval noktası ekran noktası sayılıyordu;
  // zoom'da etiket kafadan kopuyordu (Bilgisayarlar bölümü incelemesi: "etiket kafanın üstünde değil", 1 Kas).
  // Önce adı etikette geçen kişi ("Babbage" → Charles Babbage), yoksa noktaya yeterince yakın kafa.
  const heads = placed
    .filter((pl) => safe[spec.layers[pl.index]!.asset]!.kind === "character")
    .map((pl) => {
      const tr = motions.get(pl.index)!.tr;
      const name = safe[spec.layers[pl.index]!.asset]!.meta.check?.name ?? "";
      // Kafanın tepesi kutunun tepesinden biraz aşağıda (kukla tuvali): etiket çizilen kafanın hemen üstüne oturur.
      return { at: [pl.x + tr.x, pl.y + tr.y - pl.height * tr.scale * (1 - HEAD_TOP)] as const, foot: [pl.x + tr.x, pl.y + tr.y] as const, name };
    });
  // Ekranda kafalar ve üst gövdeler (kaldırılan kollar dahil): bilgi kartı bunları örtmesin.
  const bodies: Box[] = heads.map((h) => {
    const [x, y] = cameraPoint(cam, k, centre, h.at);
    const tall = cameraPoint(cam, k, centre, h.foot)[1] - y;
    return { x: x - tall * 0.3, y: y - tall * 0.15, w: tall * 0.6, h: tall * 0.6 };
  });
  const present = new Set(placed.map((pl) => spec.layers[pl.index]!.asset));
  const absent = Object.entries(safe).flatMap(([id, a]) => (a.kind === "character" && !present.has(id) && a.meta.check?.name ? [a.meta.check.name] : []));
  const texts = layoutTexts(spec.texts, height > width, (text) => {
    const gap = (h: (typeof heads)[number]) => Math.hypot(h.at[0] - text.x, h.at[1] - text.y);
    const named = heads.find((h) => namesMatch(h.name, text.text));
    // Bölümün başka bir karakterinin adı ama o bu çekimde yok (ör. kopyası atıldı): etiket boşlukta asılı kalmasın.
    if (!named && absent.some((name) => namesMatch(name, text.text))) return undefined;
    const near = named ?? heads.filter((h) => gap(h) < TAG_SNAP).sort((a, b) => gap(a) - gap(b))[0];
    const [x, y] = cameraPoint(cam, k, centre, near?.at ?? [text.x, text.y]);
    // Yüzü kadrajda olmayan kişinin adı gösterilmez: yakın çekim masadaki gazeteye yaklaşınca Dell'in etiketi ekranın
    // üst kenarına yapışıyordu (Apple s6-sh6, 1 Kas).
    if (near && !faceOnScreen([x, y], cameraPoint(cam, k, centre, near.foot))) return undefined;
    return { x, y, head: near !== undefined };
  }, tagBounds(width, height, fit), bodies);
  // Katmanların bu karedeki yeri: elde tutulan nesne tutan karakterin elini izler (avucun ortasından tutulur).
  const drawnAt = new Map(
    placed.map((pl) => {
      const holder = pl.heldBy === undefined ? undefined : placed.find((h) => h.index === pl.heldBy);
      if (!holder) return [pl.index, pl] as const;
      const [hx, hy] = handPoint(holder, spec.layers[holder.index]!, motions.get(holder.index)!);
      return [pl.index, { ...pl, x: hx, y: hy + pl.height * 0.45 }] as const;
    }),
  );
  // Büyütme balonu: anlatılan küçük nesne yuvarlak pencerede büyük; yüzleri ve yazıları örtmeyen yerde.
  const inset = (() => {
    if (!insets || bg?.meta.exact || o.overlay) return undefined;
    const zoom = Math.max(cam.zoomFrom, cam.zoomTo);
    const index = calloutTarget(spec, placed, (i) => safe[spec.layers[i]!.asset]!.kind === "prop", zoom, subject);
    if (index === undefined) return undefined;
    const at = drawnAt.get(index)!;
    const tr = motions.get(index)!.tr;
    const target = cameraPoint(cam, k, centre, [at.x + tr.x, at.y + tr.y - (at.height * tr.scale) / 2]);
    const scale = cameraAt(cam, k, centre).scale;
    const faces = heads.map((h) => {
      const [x, y] = cameraPoint(cam, k, centre, h.at);
      const tall = cameraPoint(cam, k, centre, h.foot)[1] - y;
      return { x: x - tall * 0.12, y, w: tall * 0.24, h: tall * 0.22 };
    });
    const avoid: Box[] = [
      // Nesnenin kendisi, yüzler ve yazılar.
      { x: target[0] - (at.width * scale) / 2, y: target[1] - (at.height * scale) / 2, w: at.width * scale, h: at.height * scale },
      ...faces,
      ...texts.map((tx) => {
        const w = Math.min(CARD.width, tx.text.text.length * tx.size * 0.56) + 40;
        return tx.card ? { x: tx.x, y: tx.y, w, h: tx.size * 1.4 } : { x: tx.x - w / 2, y: tx.y - tx.size * 0.7, w, h: tx.size * 1.4 };
      }),
    ];
    const spot = calloutSpot(target, avoid);
    // Yakın çekimde yüz büyük: balon bir yüzü örtecekse açılmaz.
    const box = { x: spot[0] - CALLOUT.r, y: spot[1] - CALLOUT.r, w: 2 * CALLOUT.r, h: 2 * CALLOUT.r };
    if (zoom >= CALLOUT.closeUp && faces.some((f) => overlap(box, f) > 0)) return undefined;
    return { asset: safe[spec.layers[index]!.asset]!, target, at: spot };
  })();
  return { p, t, k, dur, motions, texts, drawnAt, ...(inset ? { inset } : {}) };
}

/** Çekimin bir karesinin çizimi (shotModel + shotFrame'in sonucu). */
function ShotStage({
  visual,
  spec,
  safe,
  placed,
  bg,
  cam,
  centre,
  fit,
  p,
  t,
  k,
  dur,
  motions,
  texts,
  drawnAt,
  inset,
  lineStyle,
  ambience,
  grain,
  texture,
  c0,
  c1,
  accent,
  width,
  height,
}: ShotModel &
  ShotFrame & {
    visual: Visual;
    lineStyle: LineStyle;
    ambience: Visual["ambience"];
    grain: ReturnType<typeof textureLayer>;
    texture: Texture;
    c0: string;
    c1: string;
    accent: string;
    width: number;
    height: number;
  }) {
  const stage = (
    <AbsoluteFill style={{ overflow: "hidden", background: `linear-gradient(160deg, ${c0}, ${c1})` }}>
      {lineStyle === "sketch" && (
        // El çizimi titreşimi: sabit gürültüyle konturlar hafifçe dalgalanır.
        <svg width={0} height={0} style={{ position: "absolute" }}>
          <filter id="ys-sketch">
            <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves={1} seed={3} />
            <feDisplacementMap in="SourceGraphic" scale={3} />
          </filter>
        </svg>
      )}
      <AbsoluteFill
        style={{
          // Yakın çekim: odak noktasına doğru yaklaşır ve onu ortalar.
          transform: cameraTransform(cam, k, centre),
          transformOrigin: "0 0",
        }}
      >
        {bg?.meta.globe && (
          // Küre three.js ile 3D çizilir; SVG'nin tabanı (küre, ülkeler) gizlenir, rotalar ve işaretler küre durunca belirir.
          <>
            <Globe3D globe={bg.meta.globe} p={p} seed={visual.shotId} />
            <style>{`#${visual.shotId}-bg-globe-base{display:none}`}</style>
          </>
        )}
        {bg && (
          <AbsoluteFill
            // Arka plan geri çekilir: soluk, düşük kontrastlı ve hafif koyu; dolu duvar detayı karakterle yarışmasın.
            // Harita bilgi taşır: renkleri olduğu gibi kalır.
            style={{
              filter: bg.meta.exact ? undefined : "saturate(0.78) contrast(0.86) brightness(0.94)",
              opacity: bg.meta.globe ? clamp01((p - GLOBE_SETTLE) / 0.06) : undefined,
            }}
            dangerouslySetInnerHTML={{ __html: prefixSvgIds(fitSvg(bg.svg, "slice"), `${visual.shotId}-bg-`) }}
          />
        )}
        {bg?.meta.exact && (
          // Harita 1920×1080 üretilir: etiket koordinatları tuvalle birebir, kamerayla birlikte yakınlaşır.
          <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H }}>
            <MapOverlay meta={bg.meta} p={bg.meta.globe ? overlayProgress(p) : p} prefix={`${visual.shotId}-bg-`} />
          </div>
        )}
        {BEHIND.has(ambience) && <Ambience kind={ambience} seed={visual.shotId} size={[W, H]} />}
        <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H }}>
          {placed.map((pl) => {
            const layer = spec.layers[pl.index]!;
            const asset = safe[layer.asset]!;
            return (
              <Layer
                key={pl.index}
                layer={layer}
                asset={asset}
                placed={drawnAt.get(pl.index)!}
                motion={motions.get(pl.index)!}
                prefix={`${visual.shotId}-${pl.index}-`}
                sketch={lineStyle === "sketch"}
                draw={drawOf(layer.anims, p)}
                zoom={Math.max(cam.zoomFrom, cam.zoomTo)}
              />
            );
          })}
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={MOOD_GRADE[spec.mood]} />
      {grain && (
        // Durağan doku katmanı resim olarak: tarayıcı bir kez rasterlar (satır içi SVG filtresi her karede yeniden
        // hesaplanıyordu: render %40–60 yavaşladı). Kameradan bağımsız, kağıt gibi sabit.
        <Img
          data-texture={texture}
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(grain.svg)}`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: grain.opacity }}
        />
      )}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.32) 100%)" }} />
      {!BEHIND.has(ambience) && <Ambience kind={ambience} seed={visual.shotId} size={[W, H]} />}
      {inset && <Callout {...inset} p={p} prefix={`${visual.shotId}-co-`} accent={readable(accent) ?? "#ffd84d"} />}
      {/* Yazılar kamera hareketinin dışında: zoom onları altyazı bölgesine itmesin. */}
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H }}>
        {texts.map((placed, i) => (
          <Text key={i} placed={placed} p={p} t={t} seed={`${visual.shotId}-t${i}`} accent={accent} dur={dur} />
        ))}
      </div>
    </AbsoluteFill>
  );

  if (width === W && height === H) return stage;
  // Başka en-boy oranı (9:16 Shorts): sahne 1920×1080 tuvalde çizilir ve kırpılmadan ortaya sığdırılır; boşluğu aynı
  // arka planın bulanık, büyütülmüş kopyası doldurur. Yerleşim, yazı ve harita koordinatları değişmez.
  // Dikeyde tam sığdırma sahneyi çok küçültür: 1,3 kat yakın çekim (kenarlardan ~%12 kırpılır). İçerik zaten orta
  // bantta (x 420–1500, arka plan kuralı) yerleşir; yatay/kareye yakın oranlarda büyütme yapılmaz.
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: `linear-gradient(160deg, ${c0}, ${c1})` }}>
      {bg && (
        <AbsoluteFill
          style={{ filter: "blur(28px) brightness(0.7) saturate(0.9)", transform: "scale(1.15)" }}
          dangerouslySetInnerHTML={{ __html: prefixSvgIds(fitSvg(bg.svg, "slice"), `${visual.shotId}-bd-`) }}
        />
      )}
      <div
        style={{
          position: "absolute",
          width: W,
          height: H,
          left: (width - W * fit) / 2,
          top: (height - H * fit) / 2,
          transform: `scale(${fit})`,
          transformOrigin: "0 0",
        }}
      >
        {stage}
      </div>
    </AbsoluteFill>
  );
}

import { applyLineStyle, depthToFloor, STAGE, type LineStyle, type VectorCrowd } from "@ys/core";
import { useMemo } from "react";
import { random } from "remotion";
import { CROWD, crowdBeat } from "./crowd-timing.ts";

/**
 * Figüranlar (4 Kas; inceleme: "kalabalık / ordu / seyirci" denilen sahnelerde beş kişi duruyordu, kadro dışı insanlar
 * ya aynı karakterin klonu ya da tasarımcının yüzsüz "hayalet" çizimiydi; 1191 hikâyeden kopuk bulgunun ~100'ü). Kadronun
 * arkasında sıra sıra duran isimsiz insanlar kodla çizilir: API yok, kalite kapısı yok. Her biri 100 × 260 birimlik
 * kutuda basit bir insan (baş, saç, gövde, kollar, bacaklar; yönetmenin seçtiği kılık ve başlık), çizgi stili paketin
 * (applyLineStyle), renkleri doğal giysi ve ten renkleri, arka plan gibi hafif soluk (CROWD.filter): kadroyla yarışmaz.
 * Kişiler RIG gibi kendi SVG'lerinde, parçaları kare başına CSS ile döner (alkış, sevinç, protesto, yürüyüş).
 */

/**
 * Birim kutu ve eklem noktaları (1,7 m yetişkin). 6 Kas (kullanıcı: "kuru kalabalıklar bok gibi"; Antik Mısır incelemesi:
 * "tahta kuklalar gibi aynı figürler", "kalkan kollar ince çubuk, yumruk değil"): gövde dikdörtgen, kol uçtan uca aynı
 * kalınlıkta bir çubuk ve ucunda top, herkes aynı yüz ve duruşta. Artık gövde omuzdan bele daralır ve bir yanı gölgeli,
 * kol dirsekte bükülen iki parça (üst kol, ön kol) ve yumruk biçimli el, giysiye göre yaka, kuşak, kıvrım; yüzde göz,
 * kaş, burun ve eyleme göre ağız (protestoda bağıran, sevinçte gülen); kişiye göre yapı (build), bakış yönü (turn) ve
 * duruş (pose: protestoda hangi kol, dinlerken kavuşuk kollar, dururken eller belde).
 */
const UNIT = {
  w: 100,
  h: 260,
  /** Ekrandaki kutunun eni/boyu: çizim yatayda gerilir (kadronun çizimleri 400 × 800; 100/260 oranında figür sırık gibiydi). */
  aspect: 0.46,
  shoulder: { l: [25, 71], r: [75, 71] },
  elbow: { l: [25, 109], r: [75, 109] },
  hip: { l: [40, 156], r: [60, 156] },
  neck: [50, 56],
  feet: [50, 255],
} as const;

export { CROWD };

const SKIN = ["#f1c7a5", "#e3b08a", "#c99068", "#a86e45", "#80502f", "#5c3a22"];
const HAIR = ["#1d1a17", "#2f2219", "#4a3020", "#6e4526", "#b48c4f", "#8f8f8f"];
const CASUAL = ["#3f5a7a", "#7a3b3b", "#4f6b4a", "#8a7350", "#5b5470", "#a35f3a", "#2f4f5f", "#6d6d6d", "#b08a4a", "#7d8fa3"];
const BOTTOMS = ["#2e3440", "#3d3a36", "#4a4f5c", "#5b4a3a", "#2a2f3a", "#55606e"];
const FORMAL = ["#22283a", "#2b2b2e", "#3a3f4a", "#2e3a4f", "#3b3330"];
const ROBES = ["#7a5a3a", "#8a3a2a", "#3a5a4a", "#c9b48a", "#4a4a6a", "#9a7a4a", "#5e3c52"];
const UNIFORM = "#4b5a3a";
/** İnce iç çizgiler (yaka, etek, yumruk): kendi rengi; gruptan miras alsa düz stil konturu bunlara taşıyordu. */
const DETAIL = "#3b3440";
/** Saç biçimleri: kısa, uzun, kel, topuz, kıvırcık, yandan ayrık. */
const HAIR_STYLES = 6;

export interface CrowdFigure {
  /** Ayakların ortası (tuval) ve boyu (px), çekim başında. */
  x: number;
  depth: number;
  /** Boy (m). */
  meters: number;
  row: number;
  skin: string;
  hair: string;
  /** 0 kısa, 1 uzun, 2 kel, 3 topuz, 4 kıvırcık, 5 yandan ayrık. */
  hairStyle: number;
  top: string;
  bottom: string;
  /** Kişiye özgü ritim. */
  phase: number;
  tempo: number;
  /** Yapı: çizimin genişlik katı (ince–iri). */
  build: number;
  /** Bakış: −1 sola, 1 sağa (yüzün parçaları başın içinde o yana kayar). */
  turn: number;
  /** Duruşun seçimi (0–1): protestoda hangi kol, dinlerken kavuşuk kollar, dururken eller belde. */
  pose: number;
  /** Sakal. */
  beard: boolean;
}

export interface CrowdBox {
  l: number;
  r: number;
  t: number;
  b: number;
}

const pick = <T,>(list: readonly T[], seed: string) => list[Math.floor(random(seed) * list.length)]!;

/**
 * Kalabalığın çizim sırası (yerleşimin z'si, 100 × (1 − derinlik)): ön sıranın, ileri yürüyende çekim sonundaki yeri.
 * z'si bundan küçük katmanlar figüranların arkasında kalır.
 */
export const crowdZ = (crowd: VectorCrowd) => 100 * (1 - (CROWD.rows[crowd.size].at(-1)! - (crowd.action === "advance" ? CROWD.advance : 0)));

/** Figüranın tuvaldeki yeri ve boyu: ileri yürüyen kalabalık çekim boyunca öne gelir; genişlik yapıyla. */
export function figureAt(f: CrowdFigure, crowd: VectorCrowd, p: number, floorY: number): { x: number; y: number; h: number; w: number } {
  const depth = crowd.action === "advance" ? f.depth - CROWD.advance * p : f.depth;
  const { y, scale } = depthToFloor(depth, floorY);
  const h = f.meters * STAGE.pxPerMeter * scale;
  return { x: f.x, y, h, w: h * UNIT.aspect * f.build };
}

/**
 * Kalabalığın kişileri: arkadan öne sıralar, sıra içinde eşit aralıklı ve oynak; sıralar yarım aralık kaydırılır (arka
 * sıradakinin başı öndekilerin arasından görünür). side: yalnız sol ya da sağ yarı. avoid: kalabalığın arkasında kalan
 * katmanların kutuları (tuval): onları örtecek figüran çizilmez (çekim boyunca, ileri yürüyende son yerinde de).
 */
export function crowdFigures(crowd: VectorCrowd, seed: string, floorY: number, avoid: readonly CrowdBox[]): CrowdFigure[] {
  const rows = CROWD.rows[crowd.size];
  const out: CrowdFigure[] = [];
  rows.forEach((depth, row) => {
    const n = CROWD.perRow[crowd.size] + (row % 2);
    const gap = STAGE.width / n;
    for (let k = 0; k < n; k++) {
      const s = `${seed}-crowd-${row}-${k}`;
      const x = (k + 0.5 + (row % 2 ? -0.5 : 0)) * gap + (random(`${s}-x`) - 0.5) * gap * 0.4;
      if (crowd.side === "left" && x > STAGE.width * 0.5) continue;
      if (crowd.side === "right" && x < STAGE.width * 0.5) continue;
      const robes = crowd.dress === "robes";
      const top =
        crowd.dress === "uniform" ? (crowd.colour ?? UNIFORM) : crowd.dress === "formal" ? pick(FORMAL, `${s}-top`) : robes ? (crowd.colour ?? pick(ROBES, `${s}-top`)) : pick(CASUAL, `${s}-top`);
      const hairStyle = Math.floor(random(`${s}-style`) * HAIR_STYLES);
      const f: CrowdFigure = {
        x,
        depth,
        meters: CROWD.height[0] + (CROWD.height[1] - CROWD.height[0]) * random(`${s}-h`),
        row,
        skin: pick(SKIN, `${s}-skin`),
        hair: pick(HAIR, `${s}-hair`),
        hairStyle,
        top,
        bottom: crowd.dress === "uniform" ? top : crowd.dress === "formal" ? top : pick(BOTTOMS, `${s}-bottom`),
        phase: random(`${s}-phase`) * Math.PI * 2,
        tempo: 0.8 + random(`${s}-tempo`) * 0.4,
        build: CROWD.build[0] + (CROWD.build[1] - CROWD.build[0]) * random(`${s}-build`),
        // Çoğu kalabalığın ortasına (sahneye) bakar, biraz da rastgele.
        turn: Math.max(-1, Math.min(1, (x < STAGE.width / 2 ? 0.6 : -0.6) + (random(`${s}-turn`) - 0.5) * 1.2)),
        pose: random(`${s}-pose`),
        // Uzun saçlı ve topuzluya sakal yok.
        beard: hairStyle !== 1 && hairStyle !== 3 && random(`${s}-beard`) < CROWD.beard,
      };
      const boxes = [figureAt(f, crowd, 0, floorY), figureAt(f, crowd, 1, floorY)].map((a) => ({ l: a.x - a.w / 2, r: a.x + a.w / 2, t: a.y - a.h, b: a.y }));
      const covers = boxes.some((b) => avoid.some((o) => b.l < o.r + CROWD.margin && b.r > o.l - CROWD.margin && b.t < o.b && b.b > o.t));
      if (!covers) out.push(f);
    }
  });
  return out;
}

/** Rengi koyulaştır (gölge, kuşak): her kanal k katı. */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v * k)));
  return `#${[n >> 16, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, "0")).join("")}`;
}

/** Sol parçanın yolunu sağa aynala (x → 100 − x). */
const mirror = (d: string) => d.replace(/(-?[\d.]+) (-?[\d.]+)/g, (_, x: string, y: string) => `${100 - Number(x)} ${y}`);

/**
 * Bir figüranın çizimi (birim kutuda; parçaların kimliği prefix ile). Oranlar kadronun çizimlerine yakın: baş boyun
 * beşte biri (gerçek oranla küçük baş kadronun yanında cüce gibi kalıyordu), kol kalın, yumruk iri.
 */
export function figureSvg(f: CrowdFigure, crowd: VectorCrowd, prefix: string): string {
  const robes = crowd.dress === "robes";
  const long = crowd.dress !== "casual";
  const dark = shade(f.top, 0.72);
  const NO = 'stroke="none"';
  // Kol: üst kol (omuzdan dirseğe daralır), içinde ön kol (dirsekte döner) ve yumruk. Gündelikte kısa kollu: ön kol ten.
  // Dirsekteki dolgu dairesi iki parçanın birleşme çizgisini örter (tahta manken eklemi gibi görünüyordu).
  const arm = (side: "l" | "r") => {
    const m = side === "l" ? (d: string) => d : mirror;
    const upper = robes
      ? "M17 70 Q18 64 25 64 Q32 64 33 70 L34 111 L16 111 Z"
      : long
        ? "M18 70 Q18 64 25 64 Q32 64 32 70 L30.5 111 L19.5 111 Z"
        : "M18 70 Q18 64 25 64 Q32 64 32 70 L31.5 92 L18.5 92 Z";
    const skinUpper = long ? "" : `<path d="${m("M19.3 90 L30.7 90 L30.5 111 L19.5 111 Z")}" fill="${f.skin}"/>`;
    const fore = robes ? "M16 107 L34 107 L35 141 L15 141 Z" : "M19.5 107 L30.5 107 L29.5 141 L20.5 141 Z";
    const cloth = long ? f.top : f.skin;
    const fist =
      `<path d="${m("M18.5 139 Q17 150 20.5 154 Q25 157 29.5 154 Q33 150 31.5 139 Z")}" fill="${f.skin}"/>` +
      `<path d="${m("M20 145.5 Q25 148.5 30 145.5")}" fill="none" stroke="${DETAIL}" stroke-width="1.3"/>`;
    const [ex, ey] = UNIT.elbow[side];
    return (
      `<g id="${prefix}a${side}"><path d="${m(upper)}" fill="${f.top}"/>${skinUpper}` +
      `<g id="${prefix}f${side}"><path d="${m(fore)}" fill="${cloth}"/><circle cx="${ex}" cy="${ey}" r="${robes ? 7.5 : 4.4}" fill="${cloth}" ${NO}/>${fist}</g></g>`
    );
  };
  const leg = "M27.5 152 L49.5 152 L47 245 L33 245 Z";
  const shoe = "M29.5 242 Q28.5 253 37 253 L48.5 253 Q50.5 247 46.5 242 Z";
  const legs = robes
    ? ""
    : `<g id="${prefix}ll"><path d="${leg}" fill="${f.bottom}"/><path d="${shoe}" fill="#2b2522"/></g>` +
      `<g id="${prefix}lr"><path d="${mirror(leg)}" fill="${f.bottom}"/><path d="${mirror(shoe)}" fill="#2b2522"/></g>`;
  const chest = "M26 66 Q50 59 74 66 Q80 68 80 77 L75 114 Q72 136 72 158 L28 158 Q28 136 25 114 L20 77 Q20 68 26 66 Z";
  const gown = "M26 66 Q50 59 74 66 Q80 68 80 77 L77 120 Q85 186 90 251 Q50 257 10 251 Q15 186 23 120 L20 77 Q20 68 26 66 Z";
  const torso =
    `<path d="${robes ? gown : chest}" fill="${f.top}"/>` +
    // Işık bir yandan: gövdenin öbür yarısı gölgede.
    `<path d="${robes ? "M50 62 Q64 62 74 66 Q80 68 80 77 L77 120 Q85 186 90 251 Q70 254 52 254 Z" : "M50 62 Q64 62 74 66 Q80 68 80 77 L75 114 Q72 136 72 158 L52 158 Z"}" fill="#000000" fill-opacity="0.13" ${NO}/>`;
  const dress = {
    casual: `<path d="M42 64 Q50 72 58 64" fill="none" stroke="${DETAIL}" stroke-width="1.6"/><path d="M28 154 Q50 158 72 154" fill="none" stroke="${DETAIL}" stroke-width="1.4"/>`,
    formal:
      `<path d="M42 64 L50 88 L58 64 Z" fill="#eeeeea"/><path d="M48.5 69 L51.5 69 L53 96 L50 101 L47 96 Z" fill="#7a2f2f"/>` +
      `<path d="M41 64 L50 90 L45 100 L36 71 Z" fill="${dark}"/><path d="M59 64 L50 90 L55 100 L64 71 Z" fill="${dark}"/><circle cx="50" cy="124" r="1.6" fill="${dark}"/>`,
    uniform:
      `<path d="M43 64 L50 71 L57 64" fill="none" stroke="${DETAIL}" stroke-width="1.6"/><path d="M27 134 Q50 138 73 134 L73 142 Q50 146 27 142 Z" fill="#3a2e22"/><rect x="46.5" y="134.5" width="7" height="8" rx="1" fill="#c9a94a"/>` +
      `<circle cx="50" cy="84" r="1.5" fill="${dark}"/><circle cx="50" cy="102" r="1.5" fill="${dark}"/><circle cx="50" cy="120" r="1.5" fill="${dark}"/>`,
    robes:
      `<path d="M43 64 L50 78 L57 64" fill="none" stroke="${DETAIL}" stroke-width="1.6"/><path d="M23 118 Q50 125 77 118 L78 128 Q50 135 22 128 Z" fill="${dark}"/>` +
      `<path d="M40 135 Q37 194 32 250 M60 135 Q63 194 68 250 M50 136 L50 252" fill="none" stroke="${dark}" stroke-width="1.6"/>`,
  }[crowd.dress];
  // Yüzün parçaları bakış yönünde kayar (dörtte üç baş); ağız eyleme göre.
  const dx = f.turn * 3.5;
  const x = (v: number) => (v + dx).toFixed(2);
  const brow =
    crowd.action === "protest"
      ? `M${x(39.5)} 22.5 L${x(46.5)} 25.5 M${x(60.5)} 22.5 L${x(53.5)} 25.5`
      : crowd.action === "cheer"
        ? `M${x(39.5)} 22.5 Q${x(43)} 19.5 ${x(46.5)} 21.5 M${x(53.5)} 21.5 Q${x(57)} 19.5 ${x(60.5)} 22.5`
        : `M${x(39.5)} 23.5 Q${x(43)} 21.5 ${x(46.5)} 23.5 M${x(53.5)} 23.5 Q${x(57)} 21.5 ${x(60.5)} 23.5`;
  const mouth =
    crowd.action === "protest"
      ? `<ellipse cx="${x(50)}" cy="43" rx="4.4" ry="3.8" fill="#4a2020" ${NO}/>`
      : crowd.action === "cheer"
        ? `<path d="M${x(44.5)} 40.5 Q${x(50)} 48.5 ${x(55.5)} 40.5 Z" fill="#4a2020" ${NO}/>`
        : `<path d="M${x(45.5)} 42.5 Q${x(50)} 45 ${x(54.5)} 42.5" fill="none" stroke="#5a3a2a" stroke-width="1.4"/>`;
  const face =
    `<ellipse cx="${x(43)}" cy="30.5" rx="2.2" ry="2.7" fill="#1b1b1b" ${NO}/><ellipse cx="${x(57)}" cy="30.5" rx="2.2" ry="2.7" fill="#1b1b1b" ${NO}/>` +
    `<circle cx="${x(43.7)}" cy="29.6" r="0.7" fill="#ffffff" ${NO}/><circle cx="${x(57.7)}" cy="29.6" r="0.7" fill="#ffffff" ${NO}/>` +
    `<path d="${brow}" fill="none" stroke="${shade(f.hair, 0.9)}" stroke-width="1.9" stroke-linecap="round"/>` +
    `<path d="M${(50 + dx * 1.4).toFixed(2)} 31 Q${(52.5 + dx * 1.4).toFixed(2)} 36 ${(49.5 + dx * 1.4).toFixed(2)} 37" fill="none" stroke="${shade(f.skin, 0.68)}" stroke-width="1.3"/>` +
    mouth;
  const beard = f.beard ? `<path d="M32.5 34 Q33.5 54 50 55 Q66.5 54 67.5 34 Q63 47 50 48.5 Q37 47 32.5 34 Z" fill="${f.hair}"/>` : "";
  const hair = [
    `<path d="M32 28 Q32 8 50 8 Q68 8 68 28 Q60 17 50 18 Q40 17 32 28 Z" fill="${f.hair}"/>`,
    `<path d="M31 32 Q30 6 50 6 Q70 6 69 32 L71 64 L62 62 L64 30 Q50 19 36 30 L38 62 L29 64 Z" fill="${f.hair}"/>`,
    `<path d="M34 20 Q36 13 41 11" fill="none" stroke="${shade(f.skin, 0.8)}" stroke-width="1.5"/>`,
    `<path d="M32 28 Q32 8 50 8 Q68 8 68 28 Q60 17 50 18 Q40 17 32 28 Z" fill="${f.hair}"/><circle cx="50" cy="6" r="8" fill="${f.hair}"/>`,
    `<g fill="${f.hair}"><circle cx="35" cy="19" r="7"/><circle cx="43" cy="11" r="7.5"/><circle cx="57" cy="11" r="7.5"/><circle cx="65" cy="19" r="7"/><circle cx="50" cy="14" r="7"/></g>`,
    `<path d="M32 30 Q31 7 50 7 Q69 7 68 28 Q63 13 45 18 Q38 21 32 30 Z" fill="${f.hair}"/>`,
  ][f.hairStyle]!;
  const hat = {
    none: "",
    cap: `<path d="M31 22 Q32 5 50 5 Q68 5 69 22 Z" fill="${f.top}"/><path d="M${f.turn < 0 ? "50 20 L22 22 L32 25" : "50 20 L78 22 L68 25"} Z" fill="${dark}"/>`,
    helmet: `<path d="M29 30 Q29 2 50 2 Q71 2 71 30 Z" fill="#5d6450"/><rect x="28" y="27" width="44" height="6" rx="2" fill="#4a5040"/>`,
    turban: `<ellipse cx="50" cy="14" rx="22" ry="13" fill="#ece6d6"/><path d="M30 17 Q50 5 70 17 M33 10 Q50 19 67 8" fill="none" stroke="#cfc6b0" stroke-width="2"/>`,
    hat: `<rect x="36" y="-3" width="28" height="17" rx="3" fill="#2f2a26"/><ellipse cx="50" cy="14" rx="27" ry="4.5" fill="#2f2a26"/>`,
  }[crowd.headwear];
  const head =
    `<g id="${prefix}h">` +
    `<path d="M44.5 46 L55.5 46 L57 66 L43 66 Z" fill="${f.skin}"/><path d="M50 48 L55.5 46 L57 66 L50 66 Z" fill="#000000" fill-opacity="0.12" ${NO}/>` +
    `<ellipse cx="32.5" cy="32" rx="3" ry="4.8" fill="${f.skin}"/><ellipse cx="67.5" cy="32" rx="3" ry="4.8" fill="${f.skin}"/>` +
    `<ellipse cx="50" cy="31" rx="18" ry="22" fill="${f.skin}"/>` +
    beard +
    face +
    hair +
    hat +
    `</g>`;
  return (
    `<svg viewBox="0 0 ${UNIT.w} ${UNIT.h}" width="100%" height="100%" preserveAspectRatio="none" overflow="visible">` +
    `<g id="${prefix}b" stroke="#2b2b33" stroke-width="2.2" stroke-linejoin="round">` +
    legs +
    torso +
    dress +
    arm("l") +
    arm("r") +
    head +
    `</g></svg>`
  );
}

/** Bir kolun açıları (derece): üst kol omuzda, ön kol dirsekte (sol kol; sağ kol aynalı işaretle). */
interface ArmPose {
  up: number;
  fore: number;
}

/** Kare başına parça dönüşleri (CSS). t: çekimdeki saniye. */
export function crowdCss(figures: readonly CrowdFigure[], crowd: VectorCrowd, t: number, prefix: string): string {
  const rule = (id: string, [ox, oy]: readonly [number, number], transform: string) => `#${id}{transform:${transform};transform-origin:${ox}px ${oy}px;transform-box:view-box}`;
  return figures
    .map((f, i) => {
      const p = `${prefix}${i}-`;
      const w = t * f.tempo;
      const s = (hz: number) => Math.sin(w * hz * 2 * Math.PI + f.phase);
      const toward = f.x < STAGE.width / 2 ? 1 : -1;
      let body = `rotate(${(s(0.15) * 1.2).toFixed(2)}deg)`;
      // Sol kol (ekranın solu) dışa/yukarı + derece; sağ kol − derece. Dirsek dinlenmede hafif bükük.
      let l: ArmPose = { up: s(0.2) * 2, fore: -6 };
      let r: ArmPose = { up: -s(0.2) * 2, fore: 6 };
      let head = f.turn * 3;
      let legs = 0;
      // Eller belde: dirsek dışarıda, el kalçada (omuz 25,71; kollar 38 birim).
      const akimbo = { up: 38, fore: -68 };
      switch (crowd.action) {
        case "stand":
          // Dörtte biri elleri belde durur.
          if (f.pose < CROWD.akimbo) [l, r] = [akimbo, { up: -akimbo.up, fore: -akimbo.fore }];
          break;
        case "listen":
          head = 4 * toward + f.turn * 2 + s(0.1) * 2;
          // Bir kısmı kollarını kavuşturur.
          if (f.pose < CROWD.crossed) [l, r] = [{ up: 8, fore: -110 }, { up: -8, fore: 110 }];
          break;
        case "cheer": {
          body = `translate(0px, ${(-Math.abs(s(1)) * 10).toFixed(2)}px)`;
          const wave = s(2) * 12;
          // Kimi tek kolunu kaldırır, kimi iki kolunu; dirsekler hafif bükük.
          const one = f.pose < CROWD.oneArm;
          l = one && f.pose < CROWD.oneArm / 2 ? { up: 8, fore: -10 } : { up: 148 + wave, fore: -22 };
          r = one && f.pose >= CROWD.oneArm / 2 ? { up: -8, fore: 10 } : { up: -148 - wave, fore: 22 };
          break;
        }
        case "applaud": {
          // Eller göğsün önünde buluşur, ön kollar vuruşta açılıp kapanır.
          const clap = s(3.5) * 9;
          // Dirsekler dışa açık, eller göğüs hizasında ortada buluşur (kollar çaprazlanınca kavuşuk kol gibi okunuyordu).
          l = { up: 26, fore: -128 + clap };
          r = { up: -26, fore: 128 - clap };
          break;
        }
        case "protest": {
          // Yumruklar ortak vuruşta kalkar (slogan sesi o anda, sfx.ts chantTimes); kimi sağ, kimi sol, kimi iki yumruk.
          const beat = crowdBeat(CROWD.chantHz, t, f.phase);
          const fist = (sign: number): ArmPose => ({ up: sign * (-165 + beat * 12), fore: sign * (-28 - beat * 14) });
          const which = f.pose < CROWD.fists[0] ? "r" : f.pose < CROWD.fists[1] ? "l" : f.pose < CROWD.fists[2] ? "both" : "none";
          if (which === "r" || which === "both") r = fist(1);
          if (which === "l" || which === "both") l = fist(-1);
          body = `rotate(${(s(0.8) * 2).toFixed(2)}deg)`;
          break;
        }
        case "advance": {
          // Hep birlikte adım (sesi sfx.ts stepTimes).
          const step = crowdBeat(CROWD.marchHz, t, f.phase);
          legs = step * 12;
          l = { up: -step * 14, fore: -12 };
          r = { up: -step * 14, fore: 12 };
          body = `translate(0px, ${(-Math.abs(step) * 4).toFixed(2)}px)`;
          break;
        }
      }
      return (
        rule(`${p}b`, UNIT.feet, body) +
        rule(`${p}al`, UNIT.shoulder.l, `rotate(${l.up.toFixed(2)}deg)`) +
        rule(`${p}ar`, UNIT.shoulder.r, `rotate(${r.up.toFixed(2)}deg)`) +
        rule(`${p}fl`, UNIT.elbow.l, `rotate(${l.fore.toFixed(2)}deg)`) +
        rule(`${p}fr`, UNIT.elbow.r, `rotate(${r.fore.toFixed(2)}deg)`) +
        rule(`${p}h`, UNIT.neck, `rotate(${head.toFixed(2)}deg)`) +
        rule(`${p}ll`, UNIT.hip.l, `rotate(${legs.toFixed(2)}deg)`) +
        rule(`${p}lr`, UNIT.hip.r, `rotate(${(-legs).toFixed(2)}deg)`)
      );
    })
    .join("");
}

/** Kalabalık katmanı: kadrodan önce, kamera dönüşünün içinde çizilir. */
export function Crowd({
  crowd,
  figures,
  p,
  t,
  prefix,
  lineStyle,
  floorY,
}: {
  crowd: VectorCrowd;
  figures: readonly CrowdFigure[];
  p: number;
  t: number;
  prefix: string;
  lineStyle: LineStyle;
  floorY: number;
}) {
  const svgs = useMemo(() => figures.map((f, i) => applyLineStyle(figureSvg(f, crowd, `${prefix}${i}-`), lineStyle)), [figures, crowd, prefix, lineStyle]);
  return (
    <div data-crowd={crowd.action} style={{ position: "absolute", left: 0, top: 0, width: STAGE.width, height: STAGE.height, filter: CROWD.filter }}>
      <style>{crowdCss(figures, crowd, t, prefix)}</style>
      {figures.map((f, i) => {
        const at = figureAt(f, crowd, p, floorY);
        return <div key={i} style={{ position: "absolute", left: at.x - at.w / 2, top: at.y - at.h, width: at.w, height: at.h }} dangerouslySetInnerHTML={{ __html: svgs[i]! }} />;
      })}
    </div>
  );
}

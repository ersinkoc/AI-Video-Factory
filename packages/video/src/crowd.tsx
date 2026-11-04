import { applyLineStyle, depthToFloor, STAGE, type LineStyle, type VectorCrowd } from "@ys/core";
import { useMemo } from "react";
import { random } from "remotion";

/**
 * Figüranlar (4 Kas; inceleme: "kalabalık / ordu / seyirci" denilen sahnelerde beş kişi duruyordu, kadro dışı insanlar
 * ya aynı karakterin klonu ya da tasarımcının yüzsüz "hayalet" çizimiydi; 1191 hikâyeden kopuk bulgunun ~100'ü). Kadronun
 * arkasında sıra sıra duran isimsiz insanlar kodla çizilir: API yok, kalite kapısı yok. Her biri 100 × 260 birimlik
 * kutuda basit bir insan (baş, saç, gövde, kollar, bacaklar; yönetmenin seçtiği kılık ve başlık), çizgi stili paketin
 * (applyLineStyle), renkleri doğal giysi ve ten renkleri, arka plan gibi hafif soluk (CROWD.filter): kadroyla yarışmaz.
 * Kişiler RIG gibi kendi SVG'lerinde, parçaları kare başına CSS ile döner (alkış, sevinç, protesto, yürüyüş).
 */

/** Birim kutu ve eklem noktaları (1,7 m yetişkin). */
const UNIT = { w: 100, h: 260, shoulder: { l: [20, 60], r: [80, 60] }, hip: { l: [39, 150], r: [61, 150] }, neck: [50, 46], feet: [50, 255] } as const;

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
} as const;

const SKIN = ["#f1c7a5", "#e3b08a", "#c99068", "#a86e45", "#80502f", "#5c3a22"];
const HAIR = ["#1d1a17", "#2f2219", "#4a3020", "#6e4526", "#b48c4f", "#8f8f8f"];
const CASUAL = ["#3f5a7a", "#7a3b3b", "#4f6b4a", "#8a7350", "#5b5470", "#a35f3a", "#2f4f5f", "#6d6d6d", "#b08a4a", "#7d8fa3"];
const BOTTOMS = ["#2e3440", "#3d3a36", "#4a4f5c", "#5b4a3a", "#2a2f3a", "#55606e"];
const FORMAL = ["#22283a", "#2b2b2e", "#3a3f4a", "#2e3a4f", "#3b3330"];
const ROBES = ["#7a5a3a", "#8a3a2a", "#3a5a4a", "#c9b48a", "#4a4a6a", "#9a7a4a", "#5e3c52"];
const UNIFORM = "#4b5a3a";

export interface CrowdFigure {
  /** Ayakların ortası (tuval) ve boyu (px), çekim başında. */
  x: number;
  depth: number;
  /** Boy (m). */
  meters: number;
  row: number;
  skin: string;
  hair: string;
  /** 0 kısa, 1 uzun, 2 kel, 3 topuz. */
  hairStyle: number;
  top: string;
  bottom: string;
  /** Kişiye özgü ritim. */
  phase: number;
  tempo: number;
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

/** Figüranın tuvaldeki yeri ve boyu: ileri yürüyen kalabalık çekim boyunca öne gelir. */
export function figureAt(f: CrowdFigure, crowd: VectorCrowd, p: number, floorY: number): { x: number; y: number; h: number; w: number } {
  const depth = crowd.action === "advance" ? f.depth - CROWD.advance * p : f.depth;
  const { y, scale } = depthToFloor(depth, floorY);
  const h = f.meters * STAGE.pxPerMeter * scale;
  return { x: f.x, y, h, w: (h * UNIT.w) / UNIT.h };
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
      const f: CrowdFigure = {
        x,
        depth,
        meters: CROWD.height[0] + (CROWD.height[1] - CROWD.height[0]) * random(`${s}-h`),
        row,
        skin: pick(SKIN, `${s}-skin`),
        hair: pick(HAIR, `${s}-hair`),
        hairStyle: Math.floor(random(`${s}-style`) * 4),
        top,
        bottom: crowd.dress === "uniform" ? top : crowd.dress === "formal" ? top : pick(BOTTOMS, `${s}-bottom`),
        phase: random(`${s}-phase`) * Math.PI * 2,
        tempo: 0.8 + random(`${s}-tempo`) * 0.4,
      };
      const boxes = [figureAt(f, crowd, 0, floorY), figureAt(f, crowd, 1, floorY)].map((a) => ({ l: a.x - a.w / 2, r: a.x + a.w / 2, t: a.y - a.h, b: a.y }));
      const covers = boxes.some((b) => avoid.some((o) => b.l < o.r + CROWD.margin && b.r > o.l - CROWD.margin && b.t < o.b && b.b > o.t));
      if (!covers) out.push(f);
    }
  });
  return out;
}

/** Bir figüranın çizimi (birim kutuda; parçaların kimliği prefix ile). */
export function figureSvg(f: CrowdFigure, crowd: VectorCrowd, prefix: string): string {
  const robes = crowd.dress === "robes";
  const sleeve = (side: "l" | "r") => {
    const x = side === "l" ? 13 : 75;
    const [hx] = UNIT.shoulder[side];
    return `<g id="${prefix}a${side}"><rect x="${x}" y="58" width="12" height="86" rx="6" fill="${f.top}"/><circle cx="${hx - (side === "l" ? 1 : -1)}" cy="147" r="6.5" fill="${f.skin}"/></g>`;
  };
  const legs = robes
    ? ""
    : `<g id="${prefix}ll"><rect x="30" y="146" width="18" height="100" rx="6" fill="${f.bottom}"/><ellipse cx="38" cy="249" rx="12" ry="6" fill="#2b2522"/></g>` +
      `<g id="${prefix}lr"><rect x="52" y="146" width="18" height="100" rx="6" fill="${f.bottom}"/><ellipse cx="62" cy="249" rx="12" ry="6" fill="#2b2522"/></g>`;
  const torso = robes ? `<path d="M22 60 Q50 50 78 60 L88 252 L12 252 Z" fill="${f.top}"/>` : `<path d="M22 60 Q50 50 78 60 L76 154 L24 154 Z" fill="${f.top}"/>`;
  const collar = crowd.dress === "formal" ? `<path d="M42 57 L50 78 L58 57 Z" fill="#eeeeea"/><path d="M48.5 62 L51.5 62 L53 90 L50 95 L47 90 Z" fill="#7a2f2f"/>` : "";
  const hair = [
    `<path d="M35 24 Q36 8 50 8 Q64 8 65 24 Q58 16 50 17 Q42 16 35 24 Z" fill="${f.hair}"/>`,
    `<path d="M34 26 Q34 8 50 8 Q66 8 66 26 L67 52 L60 50 L62 26 Q50 18 38 26 L40 50 L33 52 Z" fill="${f.hair}"/>`,
    ``,
    `<path d="M35 24 Q36 8 50 8 Q64 8 65 24 Q58 16 50 17 Q42 16 35 24 Z" fill="${f.hair}"/><circle cx="50" cy="6" r="7" fill="${f.hair}"/>`,
  ][f.hairStyle]!;
  const hat = {
    none: "",
    cap: `<path d="M34 20 Q36 6 50 6 Q64 6 66 20 Z" fill="${f.top}"/><path d="M50 18 L74 20 L66 22 Z" fill="${f.top}"/>`,
    helmet: `<path d="M32 26 Q32 4 50 4 Q68 4 68 26 Z" fill="#5d6450"/><rect x="31" y="23" width="38" height="5" rx="2" fill="#4a5040"/>`,
    turban: `<ellipse cx="50" cy="14" rx="19" ry="12" fill="#ece6d6"/><path d="M33 16 Q50 6 67 16" fill="none" stroke="#cfc6b0" stroke-width="2"/>`,
    hat: `<rect x="37" y="0" width="26" height="14" rx="3" fill="#2f2a26"/><ellipse cx="50" cy="14" rx="24" ry="4" fill="#2f2a26"/>`,
  }[crowd.headwear];
  const head =
    `<g id="${prefix}h">` +
    `<rect x="44" y="40" width="12" height="18" fill="${f.skin}"/>` +
    `<ellipse cx="50" cy="28" rx="15" ry="18" fill="${f.skin}"/>` +
    hair +
    `<circle cx="44.5" cy="29" r="1.9" fill="#1b1b1b" stroke="none"/><circle cx="55.5" cy="29" r="1.9" fill="#1b1b1b" stroke="none"/>` +
    `<path d="M46 38 Q50 40.5 54 38" fill="none" stroke="#5a3a2a" stroke-width="1.4"/>` +
    hat +
    `</g>`;
  return (
    `<svg viewBox="0 0 ${UNIT.w} ${UNIT.h}" width="100%" height="100%" overflow="visible">` +
    `<g id="${prefix}b" stroke="#2b2b33" stroke-width="2.4" stroke-linejoin="round">` +
    legs +
    torso +
    collar +
    sleeve("l") +
    sleeve("r") +
    head +
    `</g></svg>`
  );
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
      let al = s(0.2) * 2;
      let ar = -s(0.2) * 2;
      let head = 0;
      let legs = 0;
      switch (crowd.action) {
        case "listen":
          head = 4 * toward + s(0.1) * 2;
          break;
        case "cheer":
          body = `translate(0px, ${(-Math.abs(s(1)) * 10).toFixed(2)}px)`;
          al = 150 + s(2) * 12;
          ar = -150 - s(2) * 12;
          break;
        case "applaud":
          al = -24 + s(3.5) * 7;
          ar = 24 - s(3.5) * 7;
          break;
        case "protest":
          ar = -165 + s(1.6) * 12;
          body = `rotate(${(s(0.8) * 2).toFixed(2)}deg)`;
          break;
        case "advance":
          legs = s(1) * 12;
          al = -s(1) * 14;
          ar = -s(1) * 14;
          body = `translate(0px, ${(-Math.abs(s(1)) * 4).toFixed(2)}px)`;
          break;
        default:
          break;
      }
      return (
        rule(`${p}b`, UNIT.feet, body) +
        rule(`${p}al`, UNIT.shoulder.l, `rotate(${al.toFixed(2)}deg)`) +
        rule(`${p}ar`, UNIT.shoulder.r, `rotate(${ar.toFixed(2)}deg)`) +
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

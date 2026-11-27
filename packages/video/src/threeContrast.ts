import type { SceneThree, VectorAsset } from "@ys/core";
import { geometry } from "./rigGeometry.ts";
import { plainFill, shapesOf } from "./screen.ts";
import type { Box } from "./threeSpot.ts";

/**
 * 3D illüstrasyonun rengi arka planından ayrılsın (27 Kas; kullanıcı: "kurulan skill'lerle daha tutarlı videolar").
 * Yönetmen rengi odayı görmeden seçer, çoğu zaman varsayılan açık mavi (#70d6ff) ve sarı (#ffd84d): açık duvarlı odada
 * (IPv4 s3-sh1'in gökyüzü dışındaki yerleri, Estonya'nın gri ofisi, Antik Mısır'ın kum rengi duvarı) ince ağ çizgileri
 * ve halkalar "zor seçiliyor", "soluk" notu alıyordu. Arka plan çizimi bir ızgarada örneklenir (sahne "slice" ile dolar):
 * her hücrenin ortasında en üstteki şeklin sınırı içindeyse rengi (degradede duraklarının ortalaması; okunamayan dolguda
 * hücre bilinmez sayılır; şekil kutusuyla boyamak yanıltıyordu: Açık Kaynak s1-sh2'de kubbenin kutusu koyu mor gökyüzünü
 * magenta gösterdi, ağ koyulaşıp gökyüzünde kayboldu). 3D'nin altındaki hücrelerin en az known payı biliniyorsa ve renk
 * hücrelerin enough payında WCAG kontrastı min'e ulaşmıyorsa, tonu korunarak siyaha ya da beyaza levels oranlarında
 * karıştırılır (readableOn). Sabit seviyeler aynı bölümün benzer odalarında aynı tonu verir: 0,1'lik adımlar LLM
 * bölümünün tek mavisini dört tona bölüyordu (17 bölümde 3D renkleri 32 → 40). min: metin dışı grafik için WCAG 1.4.11
 * (3:1). cols × rows: örnek ızgarası.
 */
export const THREE_CONTRAST = { min: 3, levels: [0.6], cols: 48, rows: 27, known: 0.6, enough: 0.8 } as const;

type Rgb = [number, number, number];
const grids = new WeakMap<VectorAsset, (Rgb | undefined)[] | null>();

function rgbOf(color: string): Rgb | undefined {
  const hex = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(color.trim())?.[1];
  if (!hex) return undefined;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

const hexOf = (c: Rgb) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;

/** WCAG göreli parlaklığı. */
function relative([r, g, b]: Rgb): number {
  const lin = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastOf(a: Rgb, b: Rgb): number {
  const [l1, l2] = [relative(a), relative(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * Dolgunun rengi: düz renk ya da url(#id) ile verilen degradenin duraklarının ortalaması (Açık Kaynak s6-sh1: gökyüzü
 * degradeydi, bilinmeyen sayılınca karar yalnız kubbenin magentasına göre verildi) ve örtücülüğü (durakların stop-opacity
 * ortalaması; Yahoo s8-sh3'te koyu odanın ortasındaki saydamlığı 0,45'ten 0'a inen yeşil ışıma opak sayılınca oda açık
 * görünmüş, ağ koyulaşıp kaybolmuştu). Dolgusu verilmeyen şekil SVG'de siyah çizilir. Okunamazsa undefined.
 */
export function fillOf(svg: string, fill: string | undefined): { rgb: Rgb; alpha: number } | undefined {
  if (fill === undefined) return { rgb: [0, 0, 0], alpha: 1 };
  if (plainFill(fill)) {
    const rgb = rgbOf(fill);
    return rgb && { rgb, alpha: 1 };
  }
  const id = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)$/.exec(String(fill).trim())?.[1];
  const body = id && new RegExp(String.raw`<(linearGradient|radialGradient)\b[^>]*\bid="${id.replace(/[^\w-]/g, "")}"[^>]*>([\s\S]*?)</\1>`).exec(svg)?.[2];
  const stops = [...(body ?? "").matchAll(/<stop\b[^>]*>/gi)].flatMap(([tag]) => {
    const rgb = rgbOf(/stop-color\s*[:=]\s*"?\s*(#[0-9a-f]{3,6})/i.exec(tag)?.[1] ?? "");
    const alpha = Number(/stop-opacity\s*[:=]\s*"?\s*([\d.]+)/i.exec(tag)?.[1] ?? 1);
    return rgb ? [{ rgb, alpha: Math.min(1, Math.max(0, alpha)) }] : [];
  });
  if (!stops.length) return undefined;
  const sum: Rgb = [0, 0, 0];
  for (const c of stops) for (const i of [0, 1, 2] as const) sum[i] += c.rgb[i];
  return { rgb: sum.map((v) => v / stops.length) as Rgb, alpha: stops.reduce((n, c) => n + c.alpha, 0) / stops.length };
}

/** Arka planın sahne ızgarasındaki rengi (hücrenin ortasındaki şekillerin saydamlıklarıyla harmanı, fillOf); okunamazsa undefined. */
function paint(bg: VectorAsset): (Rgb | undefined)[] | undefined {
  const known = grids.get(bg);
  if (known !== undefined) return known ?? undefined;
  const found = shapesOf(bg.svg, true);
  if (!found) {
    grids.set(bg, null);
    return undefined;
  }
  const { cols, rows } = THREE_CONTRAST;
  const [vx, vy, vw, vh] = found.vb;
  const s = Math.max(1920 / vw, 1080 / vh);
  const [ox, oy] = [(1920 - vw * s) / 2, (1080 - vh * s) / 2];
  const top = [...found.shapes].reverse().filter((sh) => sh.fill !== "none" && sh.alpha > 0);
  const cells = Array.from({ length: cols * rows }, (_, n) => {
    const [x, y] = [vx + (((n % cols) + 0.5) * (1920 / cols) - ox) / s, vy + ((Math.floor(n / cols) + 0.5) * (1080 / rows) - oy) / s];
    // Üstten alta saydamlıklarıyla harmanlanır; okunamayan dolgu ya da altı boş kalan yarıdan çok saydamlık bilinmez.
    const sum: Rgb = [0, 0, 0];
    let left = 1;
    for (const sh of top) {
      if (left < 0.02) break;
      if (!(x >= sh.x && x <= sh.x + sh.w && y >= sh.y && y <= sh.y + sh.h && sh.item!.contains(new (geometry().Point)(x, y)))) continue;
      const f = fillOf(bg.svg, sh.fill);
      if (!f) return undefined;
      const a = f.alpha * sh.alpha;
      for (const i of [0, 1, 2] as const) sum[i] += f.rgb[i] * a * left;
      left *= 1 - a;
    }
    return left > 0.5 ? undefined : (sum.map((v) => v / (1 - left)) as Rgb);
  });
  grids.set(bg, cells);
  return cells;
}

/** Bölgenin altındaki arka planın bilinen hücrelerinin renkleri; hücrelerinin known payı bilinmiyorsa undefined. */
export function groundUnder(bg: VectorAsset, box: Box): Rgb[] | undefined {
  const cells = paint(bg);
  if (!cells) return undefined;
  const { cols, rows } = THREE_CONTRAST;
  const [cw, ch] = [1920 / cols, 1080 / rows];
  const found: Rgb[] = [];
  let all = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const [x, y] = [(c + 0.5) * cw, (r + 0.5) * ch];
      if (x < box.x || x > box.x + box.w || y < box.y || y > box.y + box.h) continue;
      all++;
      const rgb = cells[r * cols + c];
      if (rgb) found.push(rgb);
    }
  // Bölgenin çoğu bilinmiyorsa (degrade gökyüzü, desen) tahmin yapılmaz.
  return found.length && found.length >= all * THREE_CONTRAST.known ? found : undefined;
}

/** Rengin zeminin hücrelerinin kaçında en az min kontrastlı olduğu (pay). */
export function readableShare(color: Rgb, ground: readonly Rgb[]): number {
  return ground.filter((g) => contrastOf(color, g) >= THREE_CONTRAST.min).length / ground.length;
}

/**
 * Rengin zemine karşı en okunur hali: renk zeminin enough payında okunuyorsa olduğu gibi; değilse tonu korunarak siyaha
 * ya da beyaza levels oranlarında karıştırılmış adaylardan en az değişeni, zeminin enough payında okunuyorsa; hiçbiri o kadar
 * okunmuyorsa (karışık zemin) yönetmenin rengi kalır. Ortalama renge bakmak karışık zeminde yanılıyordu (Açık Kaynak
 * s6-sh1: ağın yarısı magenta kubbenin, yarısı koyu mor gökyüzünün önündeydi; ortalamaya göre koyulaşan ağ gökyüzünde
 * kayboldu).
 */
export function readableOn(color: string, ground: readonly Rgb[]): string {
  const rgb = rgbOf(color);
  if (!rgb) return color;
  if (readableShare(rgb, ground) >= THREE_CONTRAST.enough) return color;
  // Adaylar değişim miktarına göre: önce iki yönün de küçük adımları.
  for (const k of THREE_CONTRAST.levels)
    for (const to of [[0, 0, 0], [255, 255, 255]] as Rgb[]) {
      const mix = rgb.map((v, i) => v + (to[i]! - v) * k) as Rgb;
      if (readableShare(mix, ground) >= THREE_CONTRAST.enough) return hexOf(mix);
    }
  return color;
}

/**
 * İllüstrasyonun ana rengi (gövdeler ve ağ çizgileri), çizildiği bölgenin arka planına karşı okunur. Vurgu rengi
 * yönetmenin kalır: scene3d onu kenar ışığının ve parıltının rengi olarak da kullanır (IPv4 s3-sh3'te siyaha çekilince
 * kenar ışığı sönüyordu).
 */
export function contrastThree(t: SceneThree, bg: VectorAsset, box: Box): SceneThree {
  const ground = groundUnder(bg, box);
  const color = ground ? readableOn(t.color, ground) : t.color;
  return color === t.color ? t : { ...t, color };
}

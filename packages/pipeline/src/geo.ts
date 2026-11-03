import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { LocalizedError, msg, type FlagSpec, type MapLabel, type MapSpec, type VectorAssetMeta } from "@ys/core";
import { geoBounds, geoCentroid, geoContains, geoEquirectangular, geoMercator, geoNaturalEarth1, geoOrthographic, geoPath, geoGraticule10, type GeoPath, type GeoProjection } from "d3-geo";
import countries from "i18n-iso-countries";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import { polityAt, polityFeature, politiesIn, type Polity } from "./history.ts";

/**
 * Gerçek dünya varlıkları: harita Natural Earth 1:50m sınırlarından (world-atlas, ISC; tarihî haritada o yılın sınırları
 * Cliopatria'dan, history.ts), bayrak flag-icons'tan (MIT) üretilir. Model çağrısı yoktur; aynı tarif her zaman aynı SVG'yi verir (kütüphane anahtarı tariften).
 */

const require = createRequire(import.meta.url);
countries.registerLocale(require("i18n-iso-countries/langs/tr.json"));
countries.registerLocale(require("i18n-iso-countries/langs/en.json"));

const W = 1920;
const H = 1080;
/** Haritanın sığdırıldığı alan: kenarlarda etiket ve altyazı payı. */
const FIT: [[number, number], [number, number]] = [
  [170, 110],
  [W - 170, H - 230],
];

export interface GeneratedAsset {
  svg: string;
  width: number;
  height: number;
  meta: VectorAssetMeta;
}

type Country = Feature<Polygon | MultiPolygon, { name: string }>;
const worlds = new Map<string, Promise<Country[]>>();
const lands = new Map<string, Promise<Feature<MultiPolygon>>>();

/** Kara (kıyı çizgisi, ülke sınırı yok): tarihî haritanın tabanı ve siyasi katmanın kırpma şekli. */
function loadLand(detail: "50m" | "110m"): Promise<Feature<MultiPolygon>> {
  let l = lands.get(detail);
  if (!l) {
    l = readFile(require.resolve(`world-atlas/land-${detail}.json`), "utf8").then((raw) => {
      const topo = JSON.parse(raw) as Topology<{ land: GeometryCollection }>;
      return (feature(topo, topo.objects.land) as FeatureCollection<MultiPolygon>).features[0]!;
    });
    lands.set(detail, l);
  }
  return l;
}

/** Bölge haritası 1:50m (ayrıntılı kıyı ve adalar), dünya ve küre 1:110m (dosya ~10 kat küçük). */
function loadWorld(detail: "50m" | "110m"): Promise<Country[]> {
  let w = worlds.get(detail);
  if (!w) {
    w = readFile(require.resolve(`world-atlas/countries-${detail}.json`), "utf8").then((raw) => {
      const topo = JSON.parse(raw) as Topology<{ countries: GeometryCollection<{ name: string }> }>;
      return (feature(topo, topo.objects.countries) as FeatureCollection<Polygon | MultiPolygon, { name: string }>).features;
    });
    worlds.set(detail, w);
  }
  return w;
}

/** ISO alpha-3 (ya da alpha-2) → world-atlas kimliği (ISO numeric, baştaki sıfırlarla). */
function numericOf(code: string): string | undefined {
  const c = code.trim().toUpperCase();
  return c.length === 2 ? countries.alpha2ToNumeric(c) : countries.alpha3ToNumeric(c);
}

/** Ülke etiketleri büyük harf; dilin kuralıyla (Türkçe: i → İ). */
const upper = (text: string, lang: string) => text.toLocaleUpperCase(lang);

function countryName(code: string, lang: string): string {
  // Kod numericOf ile bulunduysa kütüphanede tr/en adı da var; "?? code" yalnız savunma.
  /* v8 ignore next */
  return countries.getName(code.trim().toUpperCase(), lang === "tr" ? "tr" : "en", { select: "official" }) ?? code;
}

/** Çok parçalı ülkede (Fransa + Guyana gibi) etiketi en büyük kara parçasının ortasına koyar. */
function mainPart(f: Country): Feature<Polygon> {
  if (f.geometry.type === "Polygon") return f as Feature<Polygon>;
  const parts = f.geometry.coordinates.map((coordinates) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates } }) as Feature<Polygon>);
  const area = geoPath();
  return parts.reduce((a, b) => (area.area(b) > area.area(a) ? b : a));
}

/** Palet: stilin ilk iki rengi (koyu tonlar) ve vurgu rengi; deniz ve kara sakin, vurgu canlı. */
function mapColors(palette: string[]) {
  // En doygun orta tonlu palet rengi (koyu lacivert ya da krem değil); yoksa sıcak turuncu.
  const accent =
    palette
      .filter((c) => /^#[\da-f]{6}$/i.test(c) && lightness(c) > 0.3 && lightness(c) < 0.8 && saturation(c) > 0.35)
      .sort((a, b) => saturation(b) - saturation(a))[0] ?? "#d9783c";
  return {
    sea: "#dfe8ea",
    land: "#f4f0e6",
    border: "#b8b0a0",
    focusBorder: "#8f8676",
    tone: { accent, warm: "#d9785c", cool: "#4f86b8", muted: "#9aa5b1" } as Record<MapSpec["highlight"][number]["tone"], string>,
    route: "#2f3542",
    marker: "#2f3542",
  };
}

function lightness(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return (Math.max(r!, g!, b!) + Math.min(r!, g!, b!)) / 2;
}

/** Yalnız süzülmüş "#rrggbb" ve açıklığı 0,3'ün üstündeki renklerle çağrılır: en parlak kanal sıfır olamaz. */
function saturation(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r!, g!, b!);
  const min = Math.min(r!, g!, b!);
  return (max - min) / max;
}

/**
 * Harita. `year` verilirse tarihî harita: bugünkü ülke sınırları çizilmez; kara (kıyı çizgisi) üstüne o yılın siyasi
 * varlıkları (`history`, Cliopatria) karaya kırpılarak çizilir. Vurgu tarihî devletlere gider (adıyla ya da bugünkü
 * ülke kodu verildiyse o yıl ülkenin ortasındaki devlet). Veri yüklenemediyse yalnız kara, işaretler ve rotalar:
 * yanlış dönemin sınırı hiç çizilmez.
 */
export async function generateMap(spec: MapSpec, lang: string, palette: string[], history?: Polity[]): Promise<GeneratedAsset> {
  const past = spec.year !== undefined;
  const wide = spec.projection === "globe" || (!spec.focus.length && !spec.markers.length && !spec.routes.length);
  const detail = wide ? "110m" : "50m";
  const all = await loadWorld(detail);
  const byId = new Map(all.filter((f) => f.id !== undefined).map((f) => [String(f.id), f]));
  const pick = (codes: string[]) => codes.map((c) => ({ code: c, f: byId.get(numericOf(c) ?? "") })).filter((x): x is { code: string; f: Country } => Boolean(x.f));
  const colors = mapColors(palette);

  // O yılın siyasi varlıkları (şekil nesnesi kimlik olarak kullanılır: vurgu rengi ve çizim sırası).
  const year = spec.year ?? 0;
  const era = new Map<Polity, Country>(politiesIn(history ?? [], year).map((p) => [p, polityFeature(p)]));
  const shapeOf = (p: Polity) => era.get(p) ?? era.set(p, polityFeature(p)).get(p)!;
  const membersOf = (h: MapSpec["highlight"][number]): { code?: string; f: Country }[] => {
    if (!past) return pick(h.countries);
    const named = h.polities.flatMap((n) => {
      const p = polityAt(history ?? [], n, year);
      return p ? [{ f: shapeOf(p) }] : [];
    });
    // Bugünkü ülke kodu: o yıl ülkenin ortasında hangi devlet varsa o (bugünün sınırı çizilmez).
    const placed = pick(h.countries).flatMap((x) => {
      const centre = geoCentroid(mainPart(x.f));
      const at = [...era.values()].find((f) => geoContains(f, centre));
      return at ? [{ f: at }] : [];
    });
    return [...named, ...placed];
  };
  const groups = spec.highlight.map((h) => ({ h, members: membersOf(h) }));

  // Görünüm: odak ülkeleri + işaretler + rotalar; hiçbiri yoksa vurgulananlar, o da yoksa bütün dünya.
  const fitTo: Feature<Geometry>[] = [
    ...pick(spec.focus).map((x) => x.f),
    ...spec.markers.map((m) => ({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [m.lon, m.lat] } }) as Feature<Geometry>),
    ...spec.routes.map((r) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: r.points.map((p) => [p.lon, p.lat]) } }) as Feature<Geometry>),
  ];
  if (!fitTo.length) fitTo.push(...groups.flatMap((g) => g.members.map((m) => m.f)));
  const target: FeatureCollection = { type: "FeatureCollection", features: fitTo };
  const regional = fitTo.length > 0;

  let projection: GeoProjection;
  if (spec.projection === "globe") {
    const [lon, lat] = regional ? geoCentroid(target) : [20, 25];
    projection = geoOrthographic().rotate([-lon, -lat]).clipAngle(90).fitExtent(FIT, { type: "Sphere" });
  } else if (regional) {
    projection = geoMercator().fitExtent(FIT, target);
    // Tek şehir ya da çok küçük bölge: aşırı yakınlaşma yerine en az ~bölge ölçeği.
    const [[w, s], [e, n]] = geoBounds(target);
    if (Math.abs(e - w) < 6 && Math.abs(n - s) < 4) {
      const c = geoCentroid(target);
      projection = geoMercator().center(c).scale(5200).translate([W / 2, (FIT[0][1] + FIT[1][1]) / 2]);
    }
    projection.clipExtent([
      [0, 0],
      [W, H],
    ]);
  } else {
    projection = geoNaturalEarth1().fitExtent(FIT, { type: "Sphere" });
  }
  const path = geoPath(projection).digits(1);

  const tone = new Map<Country, string>();
  const labels: MapLabel[] = [];
  for (const { h, members } of groups) {
    for (const m of members) tone.set(m.f, colors.tone[h.tone]);
    if (h.label && members.length) {
      // Grup etiketi: grubun en büyük ülkesinin ortası.
      const biggest = members.reduce((a, b) => (path.area(a.f) > path.area(b.f) ? a : b));
      const [x, y] = path.centroid(mainPart(biggest.f));
      if (Number.isFinite(x)) labels.push({ x, y, text: upper(h.label, lang), kind: "country", order: 0 });
    } else if (!past) {
      // Tarihî devletin veri setindeki adı İngilizce: bölümün dilinde etiket yalnız yönetmenden gelir.
      for (const m of members) {
        const [x, y] = path.centroid(mainPart(m.f));
        // Ekranda çok küçük kalan ülkeye isim yazılmaz (üst üste binmesin).
        if (Number.isFinite(x) && path.area(m.f) > 2500) labels.push({ x, y, text: upper(countryName(m.code!, lang), lang), kind: "country", order: 0 });
      }
    }
  }
  const focusShapes = new Set(past ? [] : pick(spec.focus).map((x) => x.f));
  const land = past ? await loadLand(detail) : undefined;
  const base = (p: GeoPath, line: number) => (land ? historyParts(land, [...era.values()], p, tone, colors, line) : landParts(all, p, tone, focusShapes, colors, line));

  const globe = spec.projection === "globe";
  const parts: string[] = [];
  // Kürede taban (gök, küre, ülkeler) ayrı grupta: render 3D küreyi çizerken bu grubu gizler, rotalar ve işaretler kalır.
  if (globe) parts.push(`<g id="globe-base">`);
  parts.push(`<rect width="${W}" height="${H}" fill="${globe ? "#1b2333" : colors.sea}"/>`);
  if (globe) parts.push(`<path d="${path({ type: "Sphere" })}" fill="${colors.sea}" stroke="#8fa3b5" stroke-width="2"/>`);
  parts.push(...base(path, 1));
  if (globe) parts.push(`</g>`);

  spec.routes.forEach((r, i) => {
    const d = path({ type: "LineString", coordinates: r.points.map((p) => [p.lon, p.lat]) });
    if (!d) return;
    // pathLength=1: render, stroke-dashoffset'i 1→0 götürerek rotayı çizerek ilerletir.
    parts.push(`<path id="route-${i}" d="${d}" pathLength="1" fill="none" stroke="${colors.route}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1" stroke-dashoffset="0"/>`);
    // Rota etiketi yolun ortasında (uçtaki şehir etiketiyle çakışmasın).
    const mid = r.points[Math.floor((r.points.length - 1) / 2)]!;
    const next = r.points[Math.floor((r.points.length - 1) / 2) + 1]!;
    const at = projection([(mid.lon + next.lon) / 2, (mid.lat + next.lat) / 2]);
    if (r.label && at) labels.push({ x: at[0], y: at[1] + 44, text: r.label, kind: "route", order: i + 1 });
  });
  spec.markers.forEach((m, i) => {
    const at = projection([m.lon, m.lat]);
    if (!at || at[0] < 0 || at[0] > W || at[1] < 0 || at[1] > H) return;
    parts.push(`<circle cx="${at[0].toFixed(1)}" cy="${at[1].toFixed(1)}" r="11" fill="#ffffff" stroke="${colors.marker}" stroke-width="5"/>`);
    labels.push({ x: at[0], y: at[1] - 34, text: m.label, kind: "city", order: spec.routes.length + i + 1 });
  });

  const meta: VectorAssetMeta = { exact: true, floorY: 900, labels: declutter(labels.map((l) => ({ ...l, text: l.text.slice(0, 60) }))), routes: spec.routes.length };
  if (globe) {
    const [lon, lat] = projection.rotate().map((v) => -v) as [number, number];
    const [cx, cy] = projection.translate();
    meta.globe = { lon, lat, cx, cy, r: projection.scale(), texture: globeTexture(base, colors) };
  }
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${parts.join("")}</svg>`, width: W, height: H, meta };
}

const graticule = (path: GeoPath, line: number) => `<path d="${path(geoGraticule10())}" fill="none" stroke="#ffffff" stroke-opacity="0.55" stroke-width="${line}"/>`;
const border = (strong: boolean, line: number) => +((strong ? 1.6 : 0.9) * line).toFixed(2);

/** Enlem-boylam ağı ve ülkeler; önce sıradan ülkeler, sonra odak/vurgulu olanlar (sınırları üstte görünsün). */
function landParts(all: Country[], path: GeoPath, tone: Map<Country, string>, focus: Set<Country>, colors: ReturnType<typeof mapColors>, line: number): string[] {
  const parts = [graticule(path, line)];
  const strong = (f: Country) => tone.has(f) || focus.has(f);
  for (const f of [...all].sort((a, b) => Number(strong(a)) - Number(strong(b)))) {
    const d = path(f);
    if (!d) continue;
    parts.push(`<path d="${d}" fill="${tone.get(f) ?? colors.land}" stroke="${strong(f) ? colors.focusBorder : colors.border}" stroke-width="${border(strong(f), line)}" stroke-linejoin="round"/>`);
  }
  return parts;
}

/**
 * Tarihî taban: kara, üstünde o yılın siyasi sınırları karaya kırpılmış (veri setindeki kıyılar kaba, Natural Earth'ün
 * kıyısı doğru), en üstte kıyı çizgisi. Sahipsiz kara düz kalır; vurgulananlar en son çizilir.
 */
function historyParts(land: Feature<MultiPolygon>, shapes: Country[], path: GeoPath, tone: Map<Country, string>, colors: ReturnType<typeof mapColors>, line: number): string[] {
  // Görünümde hiç kara yoksa (açık deniz) yol boş gelir.
  const coast = path(land) ?? "";
  const parts = [graticule(path, line), `<clipPath id="land"><path d="${coast}"/></clipPath>`, `<path d="${coast}" fill="${colors.land}"/>`, `<g clip-path="url(#land)">`];
  for (const f of [...shapes].sort((a, b) => Number(tone.has(a)) - Number(tone.has(b)))) {
    const d = path(f);
    if (!d) continue;
    const fill = tone.get(f);
    parts.push(`<path d="${d}" fill="${fill ?? "none"}" stroke="${fill ? colors.focusBorder : colors.border}" stroke-width="${border(Boolean(fill), line)}" stroke-linejoin="round"/>`);
  }
  parts.push(`</g>`, `<path d="${coast}" fill="none" stroke="${colors.border}" stroke-width="${border(false, line)}" stroke-linejoin="round"/>`);
  return parts;
}

/** 3D kürenin dokusu: eşdikdörtgen izdüşüm (2:1). Kürenin önünde doku pikseli ekran pikselinin ~1,8 katı: çizgiler de o kadar kalın. */
const TEX_W = 4096;
const TEX_H = 2048;
function globeTexture(base: (path: GeoPath, line: number) => string[], colors: ReturnType<typeof mapColors>): string {
  const path = geoPath(geoEquirectangular().scale(TEX_W / (2 * Math.PI)).translate([TEX_W / 2, TEX_H / 2])).digits(1);
  const parts = [`<rect width="${TEX_W}" height="${TEX_H}" fill="${colors.sea}"/>`, ...base(path, 1.8)];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TEX_W}" height="${TEX_H}" viewBox="0 0 ${TEX_W} ${TEX_H}">${parts.join("")}</svg>`;
}

/** Etiketin yaklaşık kutusu (render'daki yazı boyutlarıyla). */
function box(l: MapLabel): { x0: number; y0: number; x1: number; y1: number } {
  const size = l.kind === "country" ? 30 : 26;
  const w = l.text.length * size * (l.kind === "country" ? 0.72 : 0.6) + (l.kind === "country" ? 0 : 26);
  const h = size * 1.4;
  return { x0: l.x - w / 2, y0: l.y - h / 2, x1: l.x + w / 2, y1: l.y + h / 2 };
}

const hits = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * Etiket çakışmasını açgözlü biçimde çözer: şehir/rota etiketi yerleşmişlerle çakışıyorsa noktanın altına, sağına,
 * soluna denenir; hiçbiri olmuyorsa en az çakışan yer seçilir. Ülke adları sabit kalır (ülkenin ortasında).
 */
export function declutter(labels: MapLabel[]): MapLabel[] {
  const placed: MapLabel[] = [];
  for (const l of [...labels].sort((a, b) => a.order - b.order)) {
    if (l.kind === "country") {
      placed.push(l);
      continue;
    }
    const half = box(l);
    const w = half.x1 - half.x0;
    // Etiket noktanın 34 px üstünde üretilir; seçenekler nokta merkezine göre.
    const cy = l.y + (l.kind === "city" ? 34 : -44);
    const options = [
      { x: l.x, y: l.y },
      { x: l.x, y: cy + 36 },
      { x: l.x + w / 2 + 22, y: cy },
      { x: l.x - w / 2 - 22, y: cy },
      { x: l.x, y: cy - 70 },
    ];
    const score = (o: { x: number; y: number }) => placed.filter((p) => hits(box({ ...l, ...o }), box(p))).length;
    const best = options.reduce((a, b) => (score(b) < score(a) ? b : a));
    placed.push({ ...l, x: Math.round(best.x), y: Math.round(best.y) });
  }
  return placed;
}

// ---------------- bayrak ----------------

/**
 * flag-icons'ta olmayan tarihî bayraklar: ülke koduna eşlenir. Osmanlı bayrağı (1844–1922) bugünkü Türk bayrağıyla
 * aynı tasarımdır (kırmızı zemin, beyaz ay-yıldız); oranlar küçük farklarla.
 */
const HISTORICAL: Record<string, string> = { ottoman: "tr" };

export function flagCodes(): string[] {
  return Object.keys(HISTORICAL);
}

export async function generateFlag(spec: FlagSpec): Promise<GeneratedAsset> {
  const raw = spec.code.trim().toLowerCase();
  const alpha2 = HISTORICAL[raw] ?? (raw.length === 3 ? countries.alpha3ToAlpha2(raw.toUpperCase())?.toLowerCase() : raw);
  if (!alpha2 || !/^[a-z]{2}(-[a-z]+)?$/.test(alpha2)) throw new LocalizedError(msg("err.flag.unknownCode", { code: spec.code }));
  const dir = join(dirname(require.resolve("flag-icons/package.json")), "flags", "4x3");
  let svg: string;
  try {
    svg = await readFile(join(dir, `${alpha2}.svg`), "utf8");
  } catch {
    throw new LocalizedError(msg("err.flag.notFound", { code: spec.code }));
  }
  // Bayrak 640×480; dalgalanma render'da (sway). Direkli sürümde bayrak direğin tepesinde.
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const flag = `<g>${inner}</g>`;
  if (!spec.pole) {
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><rect width="640" height="480" fill="none" stroke="#1d1a24" stroke-width="6"/>${flag}<rect width="640" height="480" fill="none" stroke="#1d1a24" stroke-opacity="0.6" stroke-width="6"/></svg>`,
      width: 640,
      height: 480,
      meta: { exact: true, realHeight: 0.42, grounded: false },
    };
  }
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 1500"><rect x="8" y="0" width="22" height="1500" rx="8" fill="#5b5146"/><circle cx="19" cy="10" r="16" fill="#d6b25e"/><g transform="translate(30 40)">${flag}<rect width="640" height="480" fill="none" stroke="#1d1a24" stroke-opacity="0.6" stroke-width="5"/></g></svg>`,
    width: 680,
    height: 1500,
    meta: { exact: true, realHeight: 2.6, grounded: true },
  };
}

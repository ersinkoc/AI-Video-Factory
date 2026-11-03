import { gunzipSync, gzipSync } from "node:zlib";
import { msg, type Text } from "@ys/core";
import type { AssetStore } from "@ys/storage";
import { geoArea } from "d3-geo";
import { strFromU8, unzipSync } from "fflate";
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";
import type { EpisodeState } from "./state.ts";

/**
 * Tarihî siyasi sınırlar: Cliopatria (Seshat Global History Databank; MÖ 3400 – MS 2024, 1600'den fazla siyasi varlık;
 * Bennett vd. 2025, Scientific Data, doi:10.1038/s41597-025-04516-9). Bugünkü ülkelerle tarihî bir olay anlatılınca
 * harita yanlış oluyordu (3 Kas, Osmanlı bölümü: 1452'deki boğaz sahnesinde bugünkü Türkiye sınırları). Lisans
 * CC BY 4.0: kaynak gösterilir (`historyCredit`, yayın paketi açıklamasına eklenir). İlk kullanımda bir kez indirilir
 * (46 MB zip, 171 MB GeoJSON), sadeleştirilip kütüphaneye yazılır (~10 MB gzip); sonraki çalıştırmalar oradan okur.
 */
export const HISTORY = {
  version: "v0.2.1",
  url: "https://github.com/Seshat-Global-History-Databank/cliopatria/raw/v0.2.1/cliopatria.geojson.zip",
  key: "library/geo/cliopatria-v0.2.1.json.gz",
  source: "https://github.com/Seshat-Global-History-Databank/cliopatria",
};

/** Yıl aralığı tutmazsa en fazla bu kadar yıl uzaktaki kayıt kabul edilir (anlatılan yıl ile veri adımı birebir değil). */
const NEAR_YEARS = 50;

/** Bir siyasi varlığın bir yıl aralığındaki toprakları. Halkalar düz [lon, lat, lon, lat…], 0,01° (~1 km) çözünürlükte. */
export interface Polity {
  name: string;
  from: number;
  to: number;
  /** İngilizce Wikipedia başlığı (ad eşleştirmede ikinci anahtar). */
  wikipedia: string;
  polygons: number[][][];
}

interface RawFeature {
  properties: { Name: string; FromYear: number; ToYear: number; Wikipedia?: string | null };
  geometry: Polygon | MultiPolygon | null;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Halkayı yuvarlar, art arda yinelenen noktaları atar; kapalı halka için en az 4 nokta kalmazsa boş döner. */
function ring(points: Position[]): number[] {
  const out: number[] = [];
  for (const [x, y] of points) {
    const px = round(x!);
    const py = round(y!);
    if (out.length && out[out.length - 2] === px && out[out.length - 1] === py) continue;
    out.push(px, py);
  }
  return out.length >= 8 ? out : [];
}

const pairs = (flat: number[]): Position[] => {
  const out: Position[] = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i]!, flat[i + 1]!]);
  return out;
};

/**
 * Ham GeoJSON'u sadeleştirir: ilişki satırları ("(Vassalage of …)") atılır, yalnız ad/yıl/Wikipedia ve yuvarlanmış
 * halkalar kalır. d3-geo küresel sarım ister (yarım küreden küçük dış halka saat yönünde); veride ~%6 dış halka ters,
 * ters halka bütün dünyayı boyar: alanı yarım küreyi aşan poligonun halkaları çevrilir.
 */
export function compactHistory(features: RawFeature[]): Polity[] {
  const out: Polity[] = [];
  for (const f of features) {
    const p = f.properties;
    if (!f.geometry || p.Name.startsWith("(")) continue;
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    const polygons: number[][][] = [];
    for (const poly of polys) {
      const rings = poly.map(ring).filter((r) => r.length);
      if (!rings.length) continue;
      if (geoArea({ type: "Polygon", coordinates: rings.map(pairs) }) > 2 * Math.PI) for (const r of rings) reverseRing(r);
      polygons.push(rings);
    }
    if (polygons.length) out.push({ name: p.Name, from: p.FromYear, to: p.ToYear, wikipedia: p.Wikipedia ?? "", polygons });
  }
  return out;
}

function reverseRing(r: number[]): void {
  const pts = pairs(r).reverse();
  r.splice(0, r.length, ...pts.flat());
}

/** d3-geo'ya verilecek şekil. */
export function polityFeature(p: Polity): Feature<MultiPolygon, { name: string }> {
  return { type: "Feature", properties: { name: p.name }, geometry: { type: "MultiPolygon", coordinates: p.polygons.map((poly) => poly.map(pairs)) } };
}

/** O yıl var olan siyasi varlıklar. */
export function politiesIn(all: Polity[], year: number): Polity[] {
  return all.filter((p) => p.from <= year && year <= p.to);
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^the /, "");

/**
 * Yönetmenin verdiği adla (İngilizce Wikipedia başlığı ya da veri setindeki ad) o yılın kaydını bulur. Önce tam ad,
 * yoksa kısmi ad ("Ottoman" → "Ottoman Empire"); yıl aralığını kapsayan kayıt, yoksa en yakın (en fazla 50 yıl).
 */
export function polityAt(all: Polity[], name: string, year: number): Polity | undefined {
  const n = norm(name);
  if (!n) return undefined;
  let found = all.filter((p) => norm(p.name) === n || norm(p.wikipedia) === n);
  if (!found.length && n.length >= 4) found = all.filter((p) => norm(p.name).includes(n) || norm(p.wikipedia).includes(n));
  const gap = (p: Polity) => (year < p.from ? p.from - year : year > p.to ? year - p.to : 0);
  const best = found.sort((a, b) => gap(a) - gap(b))[0];
  return best && gap(best) <= NEAR_YEARS ? best : undefined;
}

const cache = new WeakMap<AssetStore, Promise<Polity[]>>();

/**
 * Sadeleştirilmiş veri: kütüphanede varsa oradan, yoksa indirilip yazılır. Süreç içinde bir kez yüklenir; indirme
 * düşerse önbellek temizlenir (sonraki harita yeniden dener).
 */
export function loadHistory(deps: { store: AssetStore; fetch?: typeof fetch; log?: (t: Text) => void }): Promise<Polity[]> {
  let p = cache.get(deps.store);
  if (!p) {
    p = fetchHistory(deps);
    p.catch(() => cache.delete(deps.store));
    cache.set(deps.store, p);
  }
  return p;
}

async function fetchHistory(deps: { store: AssetStore; fetch?: typeof fetch; log?: (t: Text) => void }): Promise<Polity[]> {
  const stored = await deps.store.get(HISTORY.key);
  if (stored) return (JSON.parse(gunzipSync(stored).toString("utf8")) as { polities: Polity[] }).polities;
  deps.log?.(msg("log.history.download", { version: HISTORY.version }));
  const res = await (deps.fetch ?? fetch)(HISTORY.url, { signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`Cliopatria ${HISTORY.version}: HTTP ${res.status}`);
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()), { filter: (f) => f.name.endsWith(".geojson") });
  const file = Object.values(files)[0];
  if (!file) throw new Error(`Cliopatria ${HISTORY.version}: no .geojson in the archive`);
  const polities = compactHistory((JSON.parse(strFromU8(file)) as { features: RawFeature[] }).features);
  await deps.store.put(HISTORY.key, new Uint8Array(gzipSync(JSON.stringify({ version: HISTORY.version, polities }))), "application/gzip");
  deps.log?.(msg("log.history.ready", { n: polities.length }));
  return polities;
}

/** CC BY 4.0 kaynak satırı (yayın paketi açıklaması), bölümün dilinde (Türkçe ya da İngilizce). */
export function historyCredit(lang: string): string {
  const head = lang === "tr" ? "Tarihî harita verisi" : "Historical map data";
  return `${head}: Cliopatria (Seshat Global History Databank), CC BY 4.0 — ${HISTORY.source}`;
}

/** Bir çekim tarihî harita (yıllı tarif) kullanıyorsa açıklamaya eklenecek atıf satırı; yoksa boş. */
export function historyCredits(state: Pick<EpisodeState, "shots" | "vectorProps" | "input">): string[] {
  const props = state.vectorProps ?? {};
  const used = (state.shots ?? []).flatMap((s) => (s.vector ? [s.vector.background, ...s.vector.layers.map((l) => l.asset)] : []));
  return used.some((id) => id !== undefined && props[id]?.map?.year !== undefined) ? [historyCredit(state.input.lang)] : [];
}

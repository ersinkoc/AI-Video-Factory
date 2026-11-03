import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { geoArea } from "d3-geo";
import { compactHistory, HISTORY, historyCredit, historyCredits, loadHistory, polityAt, polityFeature, politiesIn, type Polity } from "../src/history.ts";

/**
 * Tarihî sınır verisi (Cliopatria): sadeleştirme (küresel sarım düzeltmesi dahil), ad ve yılla eşleştirme, bir kez
 * indirip kütüphaneye yazma ve CC BY atfı. Ağ sahtedir; zip testte fflate ile kurulur.
 */

// Saat yönünde (d3: küçük poligon) ve tersi (d3: bütün dünya eksi kare) birim kare.
const CW = [[30, 40], [30, 41], [31, 41], [31, 40], [30, 40]];
const CCW = [...CW].reverse();
const feature = (Name: string, FromYear: number, ToYear: number, geometry: unknown, Wikipedia: string | null = Name) => ({
  properties: { Name, FromYear, ToYear, Wikipedia },
  geometry,
});
const RAW = [
  feature("Ottoman Empire", 1450, 1452, { type: "Polygon", coordinates: [CCW] }),
  feature("Byzantine Empire", 1440, 1467, { type: "MultiPolygon", coordinates: [[CW], [[[0, 0], [0, 0.001], [0.001, 0.001], [0, 0]]]] }, null),
  feature("(Vassalage of Serbia to Ottoman Empire)", 1450, 1452, { type: "Polygon", coordinates: [CW] }),
  feature("Empty", 1450, 1452, null),
  feature("Ottoman Empire", 1453, 1458, { type: "Polygon", coordinates: [CW] }),
  // Bütün halkaları yuvarlanınca çöken (tek noktaya inen) kayıt düşer.
  feature("Tiny", 1450, 1452, { type: "Polygon", coordinates: [[[5, 5], [5, 5.001], [5.001, 5.001], [5, 5]]] }),
  feature("Beylik of Karaman", 1429, 1462, { type: "Polygon", coordinates: [[[32.004, 37], [32.004, 37], [32, 38], [33, 38], [33, 37], [32.004, 37]]] }, "Karamanids"),
];

const store = () => {
  const files = new Map<string, Uint8Array>();
  return { files, get: vi.fn(async (k: string) => files.get(k)), put: vi.fn(async (k: string, v: Uint8Array) => void files.set(k, v)) } as const;
};
const zipped = (name: string) => zipSync({ [name]: strToU8(JSON.stringify({ type: "FeatureCollection", features: RAW })), "LICENSE.md": strToU8("CC BY 4.0") });

afterEach(() => vi.unstubAllGlobals());

describe("sadeleştirme", () => {
  const all = compactHistory(RAW as never);

  it("ilişki satırları ve şekilsizler atılır; yuvarlanır, yinelenen nokta ve dejenere halka düşer", () => {
    expect(all.map((p) => p.name)).toEqual(["Ottoman Empire", "Byzantine Empire", "Ottoman Empire", "Beylik of Karaman"]);
    expect(all[1]!.wikipedia).toBe("");
    expect(all[1]!.polygons).toHaveLength(1);
    expect(all[3]!.polygons[0]![0]!.slice(0, 4)).toEqual([32, 37, 32, 38]);
  });

  it("ters sarılmış dış halka çevrilir: d3 onu bütün dünya değil küçük bir alan sayar", () => {
    for (const p of all) expect(geoArea(polityFeature(p))).toBeLessThan(0.01);
    expect(geoArea({ type: "Polygon", coordinates: [CCW] })).toBeGreaterThan(2 * Math.PI);
  });

  it("yıl ve adla eşleşme: tam ad, Wikipedia başlığı, kısmi ad, en yakın kayıt (50 yıla kadar)", () => {
    expect(politiesIn(all, 1451).map((p) => p.name)).toEqual(["Ottoman Empire", "Byzantine Empire", "Beylik of Karaman"]);
    expect(politiesIn(all, 1466).map((p) => p.name)).toEqual(["Byzantine Empire"]);
    expect(polityAt(all, "the Ottoman Empire", 1452)).toMatchObject({ name: "Ottoman Empire", from: 1450 });
    expect(polityAt(all, "Ottoman Empire", 1455)).toMatchObject({ from: 1453 });
    expect(polityAt(all, "Karamanids", 1440)?.name).toBe("Beylik of Karaman");
    expect(polityAt(all, "Byzantine", 1450)?.name).toBe("Byzantine Empire");
    expect(polityAt(all, "Osmanlı İmparatorluğu", 1452)).toBeUndefined();
    // Anlatılan yıl veri adımına denk gelmeyebilir: yakın kayıt kabul, çok uzak olan değil.
    expect(polityAt(all, "Ottoman Empire", 1480)?.name).toBe("Ottoman Empire");
    expect(polityAt(all, "Ottoman Empire", 1400)?.name).toBe("Ottoman Empire");
    expect(polityAt(all, "Ottoman Empire", 1600)).toBeUndefined();
    // Çok kısa kısmi ad ve boş ad eşleşmez.
    expect(polityAt(all, "Emp", 1452)).toBeUndefined();
    expect(polityAt(all, " — ", 1452)).toBeUndefined();
  });
});

describe("yükleme", () => {
  it("ilk kullanımda indirir, sadeleştirip kütüphaneye yazar; aynı depoda bir daha indirmez", async () => {
    const s = store();
    const fetchFn = vi.fn(async () => new Response(zipped("cliopatria_polities_only_v021.geojson")));
    const log = vi.fn();
    const first = await loadHistory({ store: s as never, fetch: fetchFn as never, log });
    expect(fetchFn).toHaveBeenCalledWith(HISTORY.url, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(first.map((p) => p.name)).toEqual(["Ottoman Empire", "Byzantine Empire", "Ottoman Empire", "Beylik of Karaman"]);
    expect(s.put).toHaveBeenCalledWith(HISTORY.key, expect.any(Uint8Array), "application/gzip");
    expect(log.mock.calls.map((c) => c[0].key)).toEqual(["log.history.download", "log.history.ready"]);
    expect(await loadHistory({ store: s as never, fetch: fetchFn as never })).toBe(first);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("kütüphanede varsa oradan okur (indirme yok)", async () => {
    const s = store();
    const polities: Polity[] = [{ name: "Rome", from: -27, to: 395, wikipedia: "Roman Empire", polygons: [[[0, 0, 0, 1, 1, 1, 0, 0]]] }];
    s.files.set(HISTORY.key, new Uint8Array(gzipSync(JSON.stringify({ version: HISTORY.version, polities }))));
    const fetchFn = vi.fn();
    expect(await loadHistory({ store: s as never, fetch: fetchFn as never })).toEqual(polities);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("indirme düşerse hata verir ve önbellek temizlenir: sonraki çağrı yeniden dener (varsayılan fetch)", async () => {
    const s = store();
    const fetchFn = vi.fn(async () => new Response("yok", { status: 503 }));
    vi.stubGlobal("fetch", fetchFn);
    await expect(loadHistory({ store: s as never })).rejects.toThrow("HTTP 503");
    fetchFn.mockImplementationOnce(async () => new Response(zipSync({ "README.md": strToU8("x") })));
    await expect(loadHistory({ store: s as never })).rejects.toThrow("no .geojson");
    fetchFn.mockImplementationOnce(async () => new Response(zipped("data.geojson")));
    expect(await loadHistory({ store: s as never })).toHaveLength(4);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
});

describe("atıf", () => {
  const map = (year?: number) => ({ description: "map", map: { projection: "flat" as const, focus: [], highlight: [], markers: [], routes: [], ...(year === undefined ? {} : { year }) } });
  const shot = (vector?: { background?: string; layers: { asset: string }[] }) => ({ id: "s", ...(vector ? { vector } : {}) });

  it("dilin satırı; yalnız bir çekim yıllı haritayı kullanıyorsa", () => {
    expect(historyCredit("tr")).toMatch(/^Tarihî harita verisi: Cliopatria .* CC BY 4\.0 — https:\/\/github\.com\//);
    expect(historyCredit("de")).toMatch(/^Historical map data: /);
    const base = { input: { lang: "en" } };
    expect(historyCredits({ ...base, shots: [shot({ background: "b-old", layers: [{ asset: "b-map" }] })], vectorProps: { "b-map": map(1452), "b-old": map() } } as never)).toEqual([historyCredit("en")]);
    expect(historyCredits({ ...base, shots: [shot(), shot({ background: "b-old", layers: [] }), shot({ layers: [{ asset: "b-old" }] })], vectorProps: { "b-old": map(), "b-unused": map(1452) } } as never)).toEqual([]);
    expect(historyCredits(base as never)).toEqual([]);
  });
});

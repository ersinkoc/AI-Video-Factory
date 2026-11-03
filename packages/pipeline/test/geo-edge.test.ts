import { describe, expect, it } from "vitest";
import { MapSpec, sanitizeSvg } from "@ys/core";
import { flagCodes, generateMap } from "../src/geo.ts";
import type { Polity } from "../src/history.ts";

const palette = ["#1d2433", "#3a4a66", "#c8553d"];

describe("harita: kenar durumlar", () => {
  it("uygun vurgu rengi olmayan palette sıcak turuncuya düşer; alpha-2 kodu da tanınır", async () => {
    const map = await generateMap(MapSpec.parse({ focus: ["tr"], highlight: [{ countries: ["tr"] }] }), "tr", ["#000000", "#ffffff", "#808080"]);
    expect(map.svg).toContain('fill="#d9783c"');
    expect(map.meta.labels?.map((l) => l.text)).toContain("TÜRKİYE");
  });

  it("küre: odak yoksa sabit merkez, odak varsa ülkenin üstü; arka yüzdeki ülkeye etiket yazılmaz", async () => {
    const world = await generateMap(MapSpec.parse({ projection: "globe" }), "en", palette);
    expect(world.svg).toContain('fill="#1b2333"');
    expect(world.svg).toContain('stroke="#8fa3b5"');
    expect(world.meta.labels).toEqual([]);

    const globe = await generateMap(
      MapSpec.parse({
        projection: "globe",
        focus: ["TUR"],
        highlight: [
          { countries: ["AUS"], label: "Avustralya" },
          { countries: ["NZL", "CHL"] },
          { countries: ["GRC", "TUR", "BGR"], label: "Balkanlar ve Anadolu", tone: "warm" },
        ],
      }),
      "tr",
      palette,
    );
    const texts = globe.meta.labels!.map((l) => l.text);
    expect(texts).toContain("BALKANLAR VE ANADOLU");
    expect(texts).not.toContain("AVUSTRALYA");
    expect(texts.some((t) => /ZELANDA|ŞİLİ/.test(t))).toBe(false);
    expect(globe.svg).toContain('fill="#d9785c"');
  });

  it("tek şehirlik küçük bölgede aşırı yakınlaşmaz; tek parçalı ülke etiketi ortasında; boşluklu kod da adıyla yazılır", async () => {
    const map = await generateMap(
      MapSpec.parse({
        markers: [
          { lon: 7.44, lat: 46.95, label: "Bern" },
          { lon: 8.54, lat: 47.37, label: "Zürih" },
        ],
        highlight: [{ countries: [" che "], tone: "muted" }],
      }),
      "en",
      palette,
    );
    const labels = map.meta.labels!;
    const bern = labels.find((l) => l.text === "Bern")!;
    const zurich = labels.find((l) => l.text === "Zürih")!;
    // 5200 ölçeğinde ~1 derece ≈ 90 px: iki şehir yakın ama ayrı.
    expect(Math.hypot(bern.x - zurich.x, bern.y - zurich.y)).toBeGreaterThan(60);
    expect(Math.hypot(bern.x - zurich.x, bern.y - zurich.y)).toBeLessThan(400);
    expect(labels.map((l) => l.text)).toContain("SWITZERLAND");
    expect(labels.map((l) => l.text)).not.toContain(" CHE ");
  });

  it("Mercator'un dışında kalan işaret ve rota çizilmez; etiketsiz rota etiket üretmez", async () => {
    const map = await generateMap(
      MapSpec.parse({
        markers: [
          { lon: 28.98, lat: 41.01, label: "İstanbul" },
          { lon: 32.85, lat: 39.93, label: "Ankara" },
          { lon: 30, lat: 89, label: "Kutup" },
        ],
        routes: [
          { points: [{ lon: 0, lat: 88 }, { lon: 40, lat: 88.5 }], label: "Kuzey" },
          { points: [{ lon: 28.98, lat: 41.01 }, { lon: 32.85, lat: 39.93 }] },
        ],
      }),
      "tr",
      palette,
    );
    const texts = map.meta.labels!.map((l) => l.text);
    expect(texts).toEqual(expect.arrayContaining(["İstanbul", "Ankara"]));
    expect(texts).not.toContain("Kutup");
    expect(texts).not.toContain("Kuzey");
    expect(map.svg).not.toContain('id="route-0"');
    expect(map.svg).toContain('id="route-1"');
    expect(map.meta.routes).toBe(2);
  });

  it("tarihî bayrak kimlikleri listelenir", () => {
    expect(flagCodes()).toEqual(["ottoman"]);
  });
});

describe("tarihî harita (yıllı tarif)", () => {
  // Saat yönünde kareler (d3 sarımı): Trakya ve Orta Anadolu'da birer devlet (1452), Roma (MS 200).
  const square = (lon: number, lat: number, size: number) => [[lon, lat, lon, lat + size, lon + size, lat + size, lon + size, lat, lon, lat]];
  const history: Polity[] = [
    { name: "Ottoman Empire", from: 1450, to: 1452, wikipedia: "Ottoman Empire", polygons: [square(26, 40, 2)] },
    { name: "Beylik of Karaman", from: 1429, to: 1462, wikipedia: "Karamanids", polygons: [square(32, 37, 5)] },
    { name: "Roman Empire", from: -27, to: 395, wikipedia: "Roman Empire", polygons: [square(10, 40, 3)] },
    // O yıl var ama görünümün dışında: çizilmez.
    { name: "Ming dynasty", from: 1368, to: 1644, wikipedia: "Ming dynasty", polygons: [square(110, 30, 5)] },
  ];

  it("bugünkü sınırlar çizilmez; o yılın devletleri karaya kırpılır, adla ya da ülke kodunun ortasındaki devletle vurgulanır", async () => {
    const map = await generateMap(
      MapSpec.parse({
        year: 1452,
        focus: ["TUR"],
        highlight: [
          { polities: ["Ottoman Empire", "Atlantis"], tone: "warm", label: "Osmanlı" },
          { countries: ["TUR"], tone: "cool" },
        ],
        markers: [{ lon: 28.98, lat: 41.01, label: "Konstantinopolis" }],
      }),
      "tr",
      palette,
      history,
    );
    const clean = sanitizeSvg(map.svg);
    expect(clean).toContain('<clipPath id="land">');
    expect(clean).toContain('clip-path="url(#land)"');
    // Osmanlı sıcak tonla; Türkiye'nin ortası (Orta Anadolu) o yıl Karaman: soğuk tonla, etiketsiz (veri adı İngilizce).
    expect(map.svg).toContain('fill="#d9785c"');
    expect(map.svg).toContain('fill="#4f86b8"');
    expect(map.meta.labels!.map((l) => l.text)).toEqual(["OSMANLI", "Konstantinopolis"]);
    // Bugünkü ülke şekilleri yok: ağ, kırpma, kara, iki devlet (Roma o yıl yok), kıyı çizgisi.
    expect(map.svg.match(/<path /g)).toHaveLength(6);
    const today = await generateMap(MapSpec.parse({ focus: ["TUR"] }), "tr", palette);
    expect(today.svg.match(/<path /g)!.length).toBeGreaterThan(10);
  });

  it("yakın yılın kaydı da vurgulanır (o yıl listede olmasa da); ortasında devlet olmayan ülke kodu vurgu getirmez", async () => {
    const map = await generateMap(
      MapSpec.parse({ year: 1470, focus: ["TUR"], highlight: [{ polities: ["Ottoman Empire"], tone: "warm" }, { countries: ["GRC"], tone: "cool" }] }),
      "tr",
      palette,
      history,
    );
    expect(map.svg).toContain('fill="#d9785c"');
    expect(map.svg).not.toContain('fill="#4f86b8"');
    expect(map.meta.labels).toEqual([]);
  });

  it("veri yoksa yalnız kara, işaret ve rota (vurgu yok)", async () => {
    const map = await generateMap(MapSpec.parse({ year: 1453, highlight: [{ polities: ["Ottoman Empire"] }], markers: [{ lon: 29, lat: 41, label: "İstanbul" }] }), "tr", palette);
    expect(map.svg).toContain('<clipPath id="land">');
    expect(map.svg).not.toContain('fill="#c8553d"');
    expect(map.meta.labels!.map((l) => l.text)).toEqual(["İstanbul"]);
  });

  it("odak ve işaret yoksa görünüm vurgulanan devlete sığar; ekranda kara yoksa kıyı boş", async () => {
    const fit = await generateMap(MapSpec.parse({ year: 200, highlight: [{ polities: ["Roman Empire"], label: "Roma" }] }), "tr", palette, history);
    const label = fit.meta.labels!.find((l) => l.text === "ROMA")!;
    expect(label.x).toBeGreaterThan(800);
    expect(label.x).toBeLessThan(1120);
    const ocean = await generateMap(MapSpec.parse({ year: 1500, markers: [{ lon: -120, lat: 0, label: "Pasifik" }] }), "tr", palette, history);
    expect(ocean.svg).toContain('<clipPath id="land"><path d=""/></clipPath>');
  });

  it("küre: doku da o yılın sınırlarıyla", async () => {
    const globe = await generateMap(MapSpec.parse({ projection: "globe", year: 1451, highlight: [{ polities: ["Karamanids"], label: "Karaman" }] }), "tr", palette, history);
    expect(globe.meta.globe!.texture).toContain('clip-path="url(#land)"');
    expect(globe.meta.globe!.texture).toContain('fill="#c8553d"');
  });
});

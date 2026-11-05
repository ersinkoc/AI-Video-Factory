import { RIG, TimelineVisual, VectorAsset, VectorShot, type Timeline } from "@ys/core";
import { describe, expect, it } from "vitest";
import { dressVisuals, fixturesOf, SET } from "../src/setDressing.ts";
import { shotModel } from "../src/Vector.tsx";

/**
 * Set eşyası yerleşimi: mekânın çizilmiş set eşyaları o mekânın geniş/orta çekimlerinde odanın dibine, hiçbir şeyi
 * değiştirmeyen ve denetimin yeni kusur bulmadığı bir yere; yer mekân başına sabit.
 */

const PARTS = Object.keys(RIG.pivots);
const asset = (id: string, kind: "character" | "prop" | "background", svg: string, width: number, height: number, meta: object = {}) =>
  VectorAsset.parse({ id, kind, svg, width, height, meta });
const box = (id: string, fill: string, w = 100, h = 200) => `<svg viewBox="0 0 ${w} ${h}"><rect id="${id}" width="${w}" height="${h}" fill="${fill}"/></svg>`;

const ASSETS = {
  room: asset("room", "background", '<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#aaa"/></svg>', 1920, 1080, { floorY: 700 }),
  "room~rev": asset("room~rev", "background", '<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#999"/></svg>', 1920, 1080, { floorY: 700 }),
  map: asset("map", "background", '<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080"/></svg>', 1920, 1080, { exact: true }),
  hero: asset("hero", "character", `<svg viewBox="0 0 400 800">${PARTS.map((p) => `<g id="${p}"><rect width="10" height="10" fill="#123456"/></g>`).join("")}</svg>`, 400, 800),
  shelf: asset("shelf", "prop", box("shelf", "#7a4b2a"), 100, 200, { realHeight: 1.8, grounded: true }),
  cabinet: asset("cabinet", "prop", box("cabinet", "#556677"), 100, 120, { realHeight: 1.2, grounded: true }),
  plant: asset("plant", "prop", box("plant", "#228833"), 100, 160, { realHeight: 1.4, grounded: true }),
  stool: asset("stool", "prop", box("stool", "#884422"), 100, 100, { realHeight: 0.5, grounded: true }),
  poster: asset("poster", "prop", box("poster", "#ffcc00"), 100, 140, { realHeight: 1, grounded: false }),
  crate: asset("crate", "prop", box("crate", "#996633"), 100, 100, { grounded: true }),
};

const visual = (shotId: string, shot: object, extra: object = {}) =>
  TimelineVisual.parse({ shotId, assetUrl: "", kind: "motion_graphic", fromFrame: 0, durationInFrames: 150, vector: VectorShot.parse(shot), ...extra });
const hero = (x = 960, depth = 0.4) => ({ asset: "hero", x, depth });
const added = (v: Timeline["visuals"][number]) => v.vector!.layers.filter((l) => ["shelf", "cabinet", "plant", "stool", "poster"].includes(l.asset));

describe("set eşyası yerleşimi", () => {
  it("geniş çekimde odanın dibine, görünen ilk yere; yeri sabit: kadraj başka yere baksa da orada, karşı duvarda (ters açı) yok", () => {
    const [a, b, c] = dressVisuals(
      [visual("s1-sh1", { background: "room", layers: [hero()] }), visual("s1-sh2", { background: "room", layers: [hero(1200)] }), visual("s1-sh3", { background: "room~rev", layers: [hero(700)] })],
      ASSETS,
      { room: ["shelf"] },
      30,
    );
    // Kamera tek kişiye yaklaşır (fillWide; raf onu değiştirmez): kenardaki ilk iki yer kadraj dışında, raf görünen ilk yerde.
    const x = SET.slots[2] * 1920;
    expect(added(a!)).toEqual([expect.objectContaining({ asset: "shelf", x, depth: SET.depth, anims: [] })]);
    expect(a!.dressing).toEqual(["shelf"]);
    // Katmanlar sonuna eklenir: yönetmenin dizinleri değişmez.
    expect(a!.vector!.layers[0]!.asset).toBe("hero");
    // Kamera öbür yana baksa da raf yerinde (kadraj dışında); başka yere taşınmaz.
    expect(added(b!).map((l) => l.x)).toEqual([x]);
    expect(c!.dressing).toBeUndefined();
    // Önce ters açı gelirse raf o duvarda kalır.
    const [d, e] = dressVisuals([visual("s1-sh1", { background: "room~rev", layers: [hero(700)] }), visual("s1-sh2", { background: "room", layers: [hero()] })], ASSETS, { room: ["shelf"] }, 30);
    expect([d!.dressing, e!.dressing]).toEqual([["shelf"], undefined]);
  });

  it("yeri seçilmiş eşya yerinde kalır: önünde biri durursa onun arkasında; arkasındakini ya da havadaki nesneyi örtecekse ya da kadraj kenarında ince şerit kalacaksa o çekimde konmaz", () => {
    const x = SET.slots[2] * 1920;
    const out = dressVisuals(
      [
        visual("s1-sh1", { background: "room", layers: [hero()] }),
        visual("s1-sh2", { background: "room", layers: [hero(x)] }),
        visual("s1-sh3", { background: "room", layers: [hero(), { asset: "cabinet", x, depth: 1 }] }),
        visual("s1-sh4", { background: "room", layers: [hero(), { asset: "poster", x, depth: 0.3 }] }),
        // Kamera kişiye yaklaşır: rafın yalnız kenardaki dilimi görünürdü; biraz ötede raf bütünüyle kadraj dışında, yerinde.
        visual("s1-sh5", { background: "room", layers: [hero(1100)] }),
        visual("s1-sh6", { background: "room", layers: [hero(1200)] }),
        // Öndeki uzun saksı rafı neredeyse bütünüyle örter: yanından bir şerit görünürdü.
        visual("s1-sh7", { background: "room", layers: [hero(), { asset: "plant", x, depth: 0.6 }] }),
      ],
      ASSETS,
      { room: ["shelf"] },
      30,
    );
    expect(out.map((v) => v.dressing)).toEqual([["shelf"], ["shelf"], undefined, undefined, undefined, ["shelf"], undefined]);
    expect(out[1]!.vector!.layers.at(-1)).toMatchObject({ asset: "shelf", x });
  });

  it("önünde duranın başı eşyanın kenarına denk gelmez: eşya başı çerçeveler, ondan uzak durur ya da o çekimde konmaz", () => {
    // 5 Kas, Amazon s7-sh3: ayaklı lambanın abajuru sunucunun başının hemen üstündeydi, şapka gibi okunuyordu.
    const x = SET.slots[2] * 1920;
    const later = (piece: string, hx: number, assets: Record<string, VectorAsset> = ASSETS) =>
      dressVisuals([visual("s1-sh1", { background: "room", layers: [hero()] }), visual("s1-sh2", { background: "room", layers: [hero(hx)] })], assets, { room: [piece] }, 30).map((v) =>
        added(v).map((l) => l.x),
      );
    // Baş rafın içinde, tepesinin epey altında: dolabın önünde duran kişi.
    expect(later("shelf", x)).toEqual([[x], [x]]);
    // Rafın yan kenarı başın içinden geçer.
    expect(later("shelf", x + 60)).toEqual([[x], []]);
    // Alçak dolabın üst kenarı yüzün ortasından geçer.
    expect(later("cabinet", x)).toEqual([[x], []]);
    // Çizimi ölçülemeyen eşyada (viewBox yok) kenar bilinmez: eskisi gibi yerinde durur.
    const blind = { ...ASSETS, shelf: asset("shelf", "prop", '<svg><rect width="100" height="200" fill="#7a4b2a"/></svg>', 100, 200, { realHeight: 1.8, grounded: true }) };
    expect(later("shelf", x + 60, blind)).toEqual([[x], [x]]);
  });

  it("ilk yer doluysa sonrakine; çekim başına en çok perShot eşya, iki eşya aynı yere konmaz", () => {
    const [v] = dressVisuals([visual("s1-sh1", { background: "room", layers: [hero(SET.slots[0] * 1920, 0.85)] })], ASSETS, { room: ["shelf", "cabinet", "plant"] }, 30);
    const xs = added(v!).map((l) => l.x);
    expect(xs).toHaveLength(SET.perShot);
    expect(xs).not.toContain(SET.slots[0] * 1920);
    expect(new Set(xs).size).toBe(xs.length);
  });

  it("yere basmayan, kısa, çizilmemiş ya da çekimde zaten olan eşya kullanılmaz; yakın çekim, harita, tahta ve figüranlı çekim döşenmez", () => {
    const sets = { room: ["stool", "poster", "crate", "missing", "shelf"] };
    const [own] = dressVisuals([visual("s1-sh1", { background: "room", layers: [hero(), { asset: "shelf", x: 1500, depth: 0.6 }] })], ASSETS, sets, 30);
    expect(own!.vector!.layers).toHaveLength(2);
    const untouched = [
      visual("s1-sh2", { background: "room", layers: [hero()], camera: { zoomFrom: 1.6, zoomTo: 1.8, focusX: 960, focusY: 500 } }),
      visual("s1-sh3", { background: "map", layers: [hero()] }),
      visual("s1-sh4", { background: "room", layers: [hero()] }, { overlay: "library/math/x.webm" }),
      visual("s1-sh5", { background: "room", layers: [hero()], crowd: { size: "group", action: "listen" } }),
      visual("s1-sh6", { layers: [hero()] }),
      visual("s1-sh7", { background: "room", layers: [hero()] }),
      TimelineVisual.parse({ shotId: "s1-sh8", assetUrl: "x.jpg", kind: "still_motion", fromFrame: 0, durationInFrames: 30 }),
    ];
    const out = dressVisuals(untouched, ASSETS, { room: ["stool", "poster", "missing"] }, 30);
    expect(out.map((v) => v.vector?.layers.length)).toEqual([1, 1, 1, 1, 1, 1, undefined]);
    // Eşyası olmayan mekân da, çizimi olmayan arka plan da olduğu gibi.
    expect(dressVisuals([untouched[5]!], ASSETS, {}, 30)[0]).toBe(untouched[5]);
    expect(dressVisuals([visual("s1-sh9", { background: "gone", layers: [hero()] })], ASSETS, { gone: ["shelf"] }, 30)[0]!.dressing).toBeUndefined();
  });

  it("ilk yer yalnız seyrek karede seçilir; yeri seçilmiş eşya dolu karede de yerinde durur", () => {
    const props = [hero(), { asset: "cabinet", x: 1300, depth: 0.5 }, { asset: "plant", x: 1600, depth: 0.5 }, { asset: "poster", x: 1750, depth: 1 }];
    const busy = visual("s1-sh2", { background: "room", layers: props });
    expect(dressVisuals([busy], ASSETS, { room: ["shelf"] }, 30)[0]!.dressing).toBeUndefined();
    const [, later] = dressVisuals([visual("s1-sh1", { background: "room", layers: [hero()] }), busy], ASSETS, { room: ["shelf"] }, 30);
    expect(later!.vector!.layers.at(-1)).toMatchObject({ asset: "shelf", x: SET.slots[2] * 1920 });
  });

  it("ilk yer kişinin kolunu, duvar ya da hava nesnesini ve odanın çizili eşyasını örtmez; kadrajı dolduran eşya konmaz", () => {
    const first = SET.slots[2] * 1920;
    const at = (layers: object[], assets: Record<string, VectorAsset> = ASSETS, sets = { room: ["shelf"] }) =>
      dressVisuals([visual("s1-sh1", { background: "room", layers })], assets, sets, 30)[0]!.vector!.layers.filter((l) => l.asset === sets.room[0]).map((l) => l.x);
    expect(at([hero()])).toEqual([first]);
    // Kutusu değmiyor ama uzanan kolu değerdi.
    expect(at([hero(700)])).not.toContain(first);
    // Önde de olsa havadaki nesnenin arkası doldurulmaz.
    expect(at([hero(), { asset: "poster", x: first, depth: 0.3 }])).not.toContain(first);
    // Odanın kendi çizimindeki dolap.
    const den = asset("room", "background", '<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#aaa"/><rect x="380" y="300" width="160" height="400" fill="#654"/></svg>', 1920, 1080, { floorY: 700 });
    expect(at([hero()], { ...ASSETS, room: den })).not.toContain(first);
    // Kamera tek kişiye yaklaşır: 3 m'lik eşya kadrajın boyunu geçer.
    const tower = asset("tower", "prop", box("tower", "#333", 100, 300), 100, 300, { realHeight: 3, grounded: true });
    expect(at([hero()], { ...ASSETS, tower }, { room: ["tower"] })).toEqual([]);
  });

  it("odanın çizili eşya boyu şekilleri sahne px'inde, önbellekli; viewBox'sız çizimde yok", () => {
    const den = asset("den", "background", '<svg viewBox="0 0 960 540"><rect width="960" height="540"/><rect x="100" y="100" width="80" height="200"/><rect x="300" y="500" width="40" height="10"/></svg>', 960, 540);
    expect(fixturesOf(den)).toEqual([{ x: 200, y: 200, w: 160, h: 400 }]);
    expect(fixturesOf(den)).toBe(fixturesOf(den));
    expect(fixturesOf(asset("raw", "background", "<svg><rect width='9' height='9'/></svg>", 9, 9))).toEqual([]);
  });

  it("kamerayı ya da öbür katmanları değiştirecek, kadraj dışında kalacak ya da denetime kusur ekleyecek eşya konmaz", () => {
    // Kamera geniş çekimde içeriği doldurmak için yaklaşıyor: kenara konan eşya kadrajı değiştirirdi, ortadakiler kişiyle çakışır.
    const lone = visual("s1-sh1", { background: "room", layers: [{ asset: "hero", x: 960, depth: 0.95 }] });
    const [v] = dressVisuals([lone], ASSETS, { room: ["shelf"] }, 30);
    for (const l of added(v!)) expect(Math.abs(l.x - 960)).toBeGreaterThan(200);
    // Çizimi bozuk eşya denetimde "çizilemedi" olur: konmaz.
    const broken = { ...ASSETS, shelf: asset("shelf", "prop", "bu bir svg değil", 100, 200, { realHeight: 1.8, grounded: true }) };
    const [w] = dressVisuals([visual("s1-sh2", { background: "room", layers: [hero()] })], broken, { room: ["shelf"] }, 30);
    expect(added(w!)).toEqual([]);
  });

  it("denetim son sözü söyler: yürüyüp eşyanın arkasında duracak kişinin yüzünü örtecek yer seçilmez", () => {
    // Kişi çekimin başında uzakta (yer denetimi geçer), yürüyüşü ilk yerin arkasında biter: yüzü örtülürdü, eşya sonraki yere.
    const walker = { asset: "hero", x: 1500, depth: 0.95, anims: [{ type: "walk", start: 0, end: 0.3, toX: SET.slots[0] * 1920 }] };
    const [v] = dressVisuals([visual("s1-sh1", { background: "room", layers: [walker] })], ASSETS, { room: ["shelf"] }, 30);
    expect(added(v!).map((l) => l.x)).toEqual([SET.slots[1] * 1920]);
  });

  it("set eşyası jestin hedefi olmaz: hedefsiz işaret yine açıklamaya döner", () => {
    const pointing = visual("s1-sh1", { background: "room", layers: [{ ...hero(), anims: [{ type: "point", start: 0, end: 1 }] }] });
    const [v] = dressVisuals([pointing], ASSETS, { room: ["shelf"] }, 30);
    expect(v!.dressing).toEqual(["shelf"]);
    const model = shotModel(v!.vector!, ASSETS, "outline", 1920, 1080, false, 5, v!.dressing);
    expect(model.spec.layers[0]!.anims.map((a) => a.type)).toEqual(["explain"]);
    expect(model.framing.map((p) => p.index)).toEqual([0]);
  });
});

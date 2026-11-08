import { describe, expect, it } from "vitest";
import { CONVERSE, floorYOf, GIANT, ON_SURFACE, READABLE_SIDE, resolveLayout, STAGE, surfaceRoom, VectorShot, type VectorAsset } from "../src/index.ts";

const asset = (id: string, kind: VectorAsset["kind"], meta: VectorAsset["meta"] = {}, w = 400, h = 400): VectorAsset => ({
  id,
  kind,
  svg: "<svg/>",
  width: w,
  height: h,
  meta,
});

const shot = (layers: unknown[], background?: string) => VectorShot.parse({ background, layers });

describe("sahne fiziği: kenar durumlar", () => {
  it("arka plan yoksa ya da zemin çizgisi bildirmiyorsa varsayılan zemin kullanılır", () => {
    expect(floorYOf(shot([]), {})).toBe(STAGE.defaultFloorY);
    expect(floorYOf(shot([], "room"), { room: asset("room", "background") })).toBe(STAGE.defaultFloorY);
    // Kayıtlı olmayan arka plan da varsayılana düşer; aşırı değer sınıra çekilir.
    expect(floorYOf(shot([], "yok"), {})).toBe(STAGE.defaultFloorY);
    expect(floorYOf(shot([], "room"), { room: asset("room", "background", { floorY: 2000 }) })).toBe(900);
  });

  it("gerçek boy verilmemişse türün varsayılan boyu kullanılır (elde tutulan için 0,3 m)", () => {
    const assets = { ali: asset("ali", "character", {}, 400, 800), cup: asset("cup", "prop", {}, 100, 400) };
    const placed = resolveLayout(shot([{ asset: "ali", x: 900, depth: 0 }, { asset: "cup", x: 0, heldBy: 0 }]), assets);
    const ali = placed.find((p) => p.index === 0)!;
    const cup = placed.find((p) => p.index === 1)!;
    expect(ali.height).toBeCloseTo(1.7 * STAGE.pxPerMeter);
    expect(cup.height).toBeCloseTo(0.3 * STAGE.pxPerMeter);
  });

  it("grounded bildirilmemiş nesne derinlik ya da zemin altındaki y ile yere basar; zeminin üstündeki y duvardadır", () => {
    const assets = { box: asset("box", "prop", { realHeight: 1 }) };
    const placed = resolveLayout(
      shot([
        { asset: "box", x: 400, depth: 0.5 },
        { asset: "box", x: 800, y: 1000 },
        { asset: "box", x: 1200, y: 300 },
        { asset: "box", x: 1600 },
      ]),
      assets,
    );
    const by = (i: number) => placed.find((p) => p.index === i)!;
    expect(by(0).z).toBeCloseTo(50);
    expect(by(1).fixes).toContain("piksel konumu derinliğe çevrildi");
    // Duvardaki öğe yerdekilerin arkasında, verilen y'de.
    expect(by(2).z).toBeLessThan(0);
    expect(by(2).y).toBe(300);
    // y de derinlik de yoksa: duvarda, zemin çizgisinin biraz üstünde ve gerçek boyun %80'i.
    expect(by(3).y).toBe(STAGE.defaultFloorY - 60);
    expect(by(3).height).toBeCloseTo(STAGE.pxPerMeter * 0.8);
  });

  it("duvarda/havada sunulan küçük nesne okunur boyun altına düşmez, yönetmenin verdiği boy dahil; büyük öğe olduğu gibi kalır", () => {
    const assets = {
      phone: asset("phone", "prop", { realHeight: 0.15, grounded: false }, 200, 400),
      card: asset("card", "prop", { realHeight: 0.08, grounded: false }, 800, 400),
      poster: asset("poster", "prop", { realHeight: 1, grounded: false }),
    };
    const placed = resolveLayout(
      shot([
        { asset: "phone", x: 400, y: 500 },
        { asset: "card", x: 800, y: 500 },
        { asset: "phone", x: 1200, y: 500, height: 30 },
        { asset: "poster", x: 1600, y: 500 },
      ]),
      assets,
    );
    const by = (i: number) => placed.find((p) => p.index === i)!;
    // En uzun kenar en az READABLE_SIDE.air (0,28 m), duvar öğesi gibi %80 ölçekle: 0,28 × 400 × 0,8 = 89,6 px.
    const least = READABLE_SIDE.air * STAGE.pxPerMeter * 0.8;
    expect(by(0).height).toBeCloseTo(least);
    expect(by(0).fixes).toContain("okunamayacak kadar küçüktü, büyütüldü");
    // Yatık nesnede en uzun kenar genişlik.
    expect(by(1).width).toBeCloseTo(least);
    expect(by(1).height).toBeCloseTo(least / 2);
    expect(by(2).height).toBeCloseTo(least);
    expect(by(3).height).toBeCloseTo(STAGE.pxPerMeter * 0.8);
    expect(by(3).fixes).toEqual([]);
  });

  it("dev nesne (yarısından azı kareye sığar) uzaktaymış gibi küçülür; az taşan ve kişi gerçek boyunda kalır", () => {
    const assets = {
      rocket: asset("rocket", "prop", { realHeight: 22.5, grounded: true }, 100, 800),
      tent: asset("tent", "prop", { realHeight: 4, grounded: true }),
      giant: asset("giant", "character", { realHeight: 6 }, 400, 800),
    };
    const placed = resolveLayout(shot([{ asset: "rocket", x: 1200, depth: 0.6 }, { asset: "tent", x: 400, depth: 0.5 }, { asset: "giant", x: 800, depth: 0 }]), assets);
    const at = (i: number) => placed.find((p) => p.index === i)!;
    const [rocket, tent, giant] = [at(0), at(1), at(2)];
    expect(rocket.height).toBeCloseTo(GIANT.fit * (rocket.y - GIANT.top * STAGE.height), 6);
    expect(rocket.height).toBeGreaterThan(600);
    expect(rocket.fixes).toContain(GIANT.note);
    expect(rocket.distant).toBe(true);
    expect(tent.distant).toBeUndefined();
    // 4 m çadır gerçek boyunda (üstünün kesilmesi doğal).
    expect(tent.height).toBeCloseTo(4 * STAGE.pxPerMeter * tent.scale, 6);
    expect(tent.fixes).not.toContain(GIANT.note);
    expect(giant.height).toBeCloseTo(6 * STAGE.pxPerMeter, 6);
  });

  it("grounded=true nesnenin derinliği yoksa 0,3 varsayılır", () => {
    const placed = resolveLayout(shot([{ asset: "desk", x: 900 }]), { desk: asset("desk", "prop", { realHeight: 1, grounded: true }) });
    expect(placed[0]!.z).toBeCloseTo(70);
    expect(placed[0]!.fixes).toContain("piksel konumu derinliğe çevrildi");
  });

  it("elle verilen z çizim sırasını belirler", () => {
    const assets = { ali: asset("ali", "character", { realHeight: 1.7 }, 400, 800), lamp: asset("lamp", "prop", { grounded: true, realHeight: 1 }) };
    const placed = resolveLayout(shot([{ asset: "ali", x: 600, depth: 0.1, z: -50 }, { asset: "lamp", x: 1400, depth: 0.9 }]), assets);
    expect(placed.map((p) => p.index)).toEqual([0, 1]);
    expect(placed[0]!.z).toBe(-50);
  });

  it("karakter olmayan tutucu yok sayılır; karakterin üstündeki nesne omuz hizasına konur", () => {
    const assets = {
      ali: asset("ali", "character", { realHeight: 1.7 }, 400, 800),
      table: asset("table", "prop", { realHeight: 0.8, grounded: true }, 400, 400),
      bird: asset("bird", "prop", { realHeight: 0.4 }, 400, 400),
    };
    const placed = resolveLayout(
      shot([
        { asset: "table", x: 500, depth: 0.2 },
        { asset: "bird", x: 900, depth: 0.4, heldBy: 0 },
        { asset: "ali", x: 1300, depth: 0.2 },
        { asset: "bird", x: 1300, on: 2 },
      ]),
      assets,
    );
    const by = (i: number) => placed.find((p) => p.index === i)!;
    expect(by(1).heldBy).toBeUndefined();
    expect(by(1).z).toBeCloseTo(60);
    expect(by(3).y).toBeCloseTo(by(2).y - by(2).height * 0.5);
  });

  it("varlığı olmayan katman yerleştirilmez", () => {
    expect(resolveLayout(shot([{ asset: "yok", x: 1 }]), {})).toEqual([]);
  });

  it("sahneye yürüyerek/kayarak/hareketle giren karakter kadraj dışında bırakılır, durağan olan içeri alınır", () => {
    const assets = { ali: asset("ali", "character", { realHeight: 1.7 }, 400, 800) };
    const placed = resolveLayout(
      shot([
        { asset: "ali", x: -300, depth: 0.1, anims: [{ type: "walk", toX: 600 }] },
        { asset: "ali", x: 2300, depth: 0.5, anims: [{ type: "slide_in", from: "right" }] },
        { asset: "ali", x: -500, depth: 0.9, anims: [{ type: "move", toX: 900 }] },
        { asset: "ali", x: 2400, depth: 0.7, anims: [{ type: "wave" }] },
      ]),
      assets,
    );
    const by = (i: number) => placed.find((p) => p.index === i)!;
    expect(by(0).x).toBe(-300);
    expect(by(1).x).toBe(2300);
    expect(by(2).x).toBe(-500);
    expect(by(3).x + by(3).width / 2).toBeLessThanOrEqual(STAGE.width);
    expect(by(3).fixes).toContain("kadraj dışına taşıyordu");
  });
});

describe("sahne fiziği: olmayan katmana başvuru", () => {
  it("var olmayan katmanın üstüne konan nesne kendi başına yerleşir", () => {
    const placed = resolveLayout(shot([{ asset: "box", x: 500, depth: 0.5, on: 7 }]), { box: asset("box", "prop", { realHeight: 1 }) });
    expect(placed).toHaveLength(1);
    expect(placed[0]!.z).toBeCloseTo(50);
  });

  it("mobilyanın yarıdan fazla örttüğü duvar/hava öğesi önüne alınır; karakterin arkasındaki ve z verilen yerinde kalır", () => {
    const assets = {
      bench: asset("bench", "prop", { grounded: true, realHeight: 2 }, 1600, 400),
      logo: asset("logo", "prop", { grounded: false }),
      ali: asset("ali", "character", { realHeight: 1.7 }, 400, 800),
    };
    const logo = { asset: "logo", x: 960, y: 700, height: 200 };
    const [bench, front] = resolveLayout(shot([{ asset: "bench", x: 960, depth: 0.3 }, logo]), assets).sort((a, b) => a.index - b.index);
    expect(front!.z).toBeCloseTo(bench!.z + 0.1);
    expect(front!.fixes).toContain("mobilyanın arkasında kalıyordu, önüne alındı");
    for (const layers of [
      [{ asset: "ali", x: 960, depth: 0.3 }, logo],
      [{ asset: "bench", x: 960, depth: 0.3 }, { ...logo, z: -5 }],
      [{ asset: "bench", x: 960, depth: 0.3 }, { ...logo, y: 100 }],
    ]) {
      const back = resolveLayout(shot(layers), assets).find((p) => p.index === 1)!;
      expect(back.z).toBeLessThan(0);
    }
  });

  it("öndeki ayaktaki karakter arkadakinin yüzünü örtüyorsa en yakın boş yere kayar; oturan, giren ve yer bulamayan kalır", () => {
    const assets = { a: asset("a", "character", {}, 400, 800), b: asset("b", "character", {}, 400, 800) };
    // Arkada (derinlik 0,7) bir kişi; önünde (0,3) aynı x'te ayakta biri.
    const [back, front] = [0, 1].map((i) => resolveLayout(shot([{ asset: "a", x: 900, depth: 0.7 }, { asset: "b", x: 900, depth: 0.3 }]), assets).find((p) => p.index === i)!);
    expect(back!.x).toBe(900);
    expect(Math.abs(front!.x - 900)).toBeGreaterThan(front!.width * 0.3);
    expect(front!.fixes).toContain("arkadaki karakterin yüzünü örtüyordu");
    // Sahneye yürüyerek giren karakter kaydırılmaz.
    const walking = resolveLayout(shot([{ asset: "a", x: 900, depth: 0.7 }, { asset: "b", x: 900, depth: 0.3, anims: [{ type: "walk", toX: 1500 }] }]), assets).find((p) => p.index === 1)!;
    expect(walking.x).toBe(900);
    // Arkadaki kişiler kadrajı boydan boya kaplıyorsa gidecek yer yok: yerinde kalır.
    const row = Array.from({ length: 9 }, (_, i) => ({ asset: "a", x: 120 + i * 210, depth: 0.95 }));
    const stuck = resolveLayout(shot([...row, { asset: "b", x: 960, depth: 0 }]), assets).find((p) => p.index === 9)!;
    expect(stuck.x).toBe(960);
    expect(stuck.fixes).not.toContain("arkadaki karakterin yüzünü örtüyordu");
  });

  it("masadaki nesne arkadaki kişinin yüzünü örtmez: yüzeyde kayar; yer yoksa ayaktaki kişi kenara çekilir", () => {
    const assets = {
      desk: asset("desk", "prop", { realHeight: 0.75, surface: 1, grounded: true }, 1000, 500),
      table: asset("table", "prop", { realHeight: 0.75, surface: 1, grounded: true }, 300, 500),
      chair: asset("chair", "prop", { realHeight: 0.9, surface: 0.5, grounded: true }, 400, 600),
      man: asset("man", "character", {}, 400, 800),
      mon: asset("mon", "prop", { realHeight: 0.5 }, 500, 400),
      banner: asset("banner", "prop", { realHeight: 0.6 }, 9000, 300),
    };
    const at = (layers: unknown[], i: number) => resolveLayout(shot(layers), assets).find((p) => p.index === i)!;
    const desk = { asset: "desk", x: 960, depth: 0.3 };
    const man = { asset: "man", x: 960, depth: 0.5 };
    // Kişinin önündeki monitör yüzeyde yana kayar, kişi yerinde kalır; iki monitör iki yana açılır.
    const mon = at([desk, man, { asset: "mon", x: 960, on: 0 }], 2);
    expect(mon.x).toBe(800);
    expect(mon.fixes).toContain("arkasındaki kişinin yüzünü örtüyordu, yüzeyde kaydırıldı");
    expect(at([desk, man, { asset: "mon", x: 960, on: 0 }], 1).x).toBe(960);
    expect(at([desk, man, { asset: "mon", x: 900, on: 0 }, { asset: "mon", x: 1000, on: 0 }], 3).x).toBeGreaterThan(1100);
    // Masaya oturan kişinin yüzü de açılır; yüzü açıkta kalan monitör kıpırdamaz.
    const chair = { asset: "chair", x: 960, depth: 0.5 };
    expect(at([chair, desk, { asset: "man", x: 960, on: 0 }, { asset: "mon", x: 960, on: 1 }], 3).x).not.toBe(960);
    expect(at([desk, man, { asset: "mon", x: 1140, on: 0 }], 2).x).toBe(1140);
    // Dar masada yer yok: ayaktaki kişi kenara çekilir; oturan ve sahneye yürüyen kalır.
    const table = { asset: "table", x: 960, depth: 0.3 };
    const moved = at([table, man, { asset: "mon", x: 960, on: 0 }], 1);
    expect(Math.abs(moved.x - 960)).toBeGreaterThan(100);
    expect(moved.fixes).toContain("önündeki nesne yüzünü örtüyordu, kenara çekildi");
    expect(at([table, { ...man, anims: [{ type: "walk", toX: 1500 }] }, { asset: "mon", x: 960, on: 0 }], 1).x).toBe(960);
    expect(at([chair, table, { asset: "man", x: 960, on: 0 }, { asset: "mon", x: 960, on: 1 }], 2).fixes).not.toContain("önündeki nesne yüzünü örtüyordu, kenara çekildi");
    // Yüzü örtülmeyen öteki kişi (başka derinlikte: konuşma mesafesine çekilmez) kıpırdamaz; sahneyi boydan boya
    // kaplayan pankartın önünden kaçılacak yer yoksa kişi kalır.
    const far = at([table, man, { asset: "man", x: 300, depth: 0.8 }, { asset: "mon", x: 960, on: 0 }], 2);
    expect(far.x).toBe(300);
    const stuck = at([table, man, { asset: "banner", x: 960, on: 0 }], 1);
    expect(stuck.x).toBe(960);
    expect(stuck.fixes).not.toContain("önündeki nesne yüzünü örtüyordu, kenara çekildi");
  });

  it("yüzeydeki nesnenin tamamı yüzeyde kalır: geniş nesne kenardan içeri alınır, yüzeyden genişi ortalanır", () => {
    const assets = {
      desk: asset("desk", "prop", { realHeight: 0.75, surface: 1, grounded: true }, 1000, 500),
      laptop: asset("laptop", "prop", { realHeight: 0.3 }, 1600, 1000),
      pen: asset("pen", "prop", { realHeight: 0.02 }, 100, 100),
      banner: asset("banner", "prop", { realHeight: 0.6 }, 9000, 300),
    };
    const on = (item: string, x: number) => {
      const placed = resolveLayout(shot([{ asset: "desk", x: 960, depth: 0.3 }, { asset: item, x, on: 0 }]), assets);
      return [placed.find((p) => p.index === 0)!, placed.find((p) => p.index === 1)!] as const;
    };
    // Masanın sağ ucuna konan dizüstü: sağ kenarı yüzeyin yarı eninin edge kesrinde.
    const [desk, laptop] = on("laptop", 1600);
    expect(laptop.x + laptop.width / 2).toBeCloseTo(desk.x + (desk.width / 2) * ON_SURFACE.edge, 6);
    expect(laptop.fixes).toContain("yüzeyin dışına taşıyordu, içeri alındı");
    expect(on("laptop", 320)[1].x - laptop.width / 2).toBeCloseTo(desk.x - (desk.width / 2) * ON_SURFACE.edge, 6);
    // Küçük nesne (okunur boya büyütülmüş kalem) aynı sınırla; yüzeyden geniş nesne ortalanır. Çok küçük nesnenin ortası
    // eskisi gibi yarı enin center kesrinde.
    const pen = on("pen", 1600)[1];
    expect(pen.x).toBeCloseTo(desk.x + surfaceRoom(desk.width / 2, pen.width), 6);
    expect(on("banner", 1600)[1].x).toBe(desk.x);
    expect(surfaceRoom(100, 1)).toBe(100 * ON_SURFACE.center);
    expect(surfaceRoom(100, 500)).toBe(0);
  });

  it("aynı oturağa oturan kişiler yönetmenin x sırasıyla yan yana dizilir; tek kişi oturağın ortasında kalır", () => {
    const assets = { bench: asset("bench", "prop", { realHeight: 0.5, surface: 0.5, grounded: true }, 1200, 400), a: asset("a", "character", {}, 400, 800), b: asset("b", "character", {}, 400, 800) };
    const placed = resolveLayout(
      shot([
        { asset: "bench", x: 960, depth: 0.4 },
        { asset: "b", x: 1200, on: 0 },
        { asset: "a", x: 700, on: 0 },
      ]),
      assets,
    );
    const [b, a] = [1, 2].map((i) => placed.find((p) => p.index === i)!);
    expect(a!.x).toBeLessThan(960);
    expect(b!.x).toBeGreaterThan(960);
    expect(b!.x - a!.x).toBeCloseTo(a!.width * 0.75);
    expect(a!.fixes).toContain("aynı oturakta yanındakiyle iç içeydi, yan yana oturtuldu");
    const single = resolveLayout(shot([{ asset: "bench", x: 960, depth: 0.4 }, { asset: "a", x: 700, on: 0 }]), assets).find((p) => p.index === 1)!;
    expect(single.x).toBe(960);
    // Aynı x'te iki kişi: kimlik sırasıyla.
    const same = resolveLayout(shot([{ asset: "bench", x: 960, depth: 0.4 }, { asset: "a", x: 960, on: 0 }, { asset: "b", x: 960, on: 0 }]), assets);
    expect(same.find((p) => p.index === 1)!.x).toBeLessThan(same.find((p) => p.index === 2)!.x);
  });
});

describe("sahne fiziği: konuşma mesafesi", () => {
  const assets = {
    a: asset("a", "character", {}, 400, 800),
    b: asset("b", "character", {}, 400, 800),
    c: asset("c", "character", {}, 400, 800),
    desk: asset("desk", "prop", { realHeight: 0.75, surface: 1, grounded: true }, 1000, 500),
    screen: asset("screen", "prop", { realHeight: 0.8 }, 800, 500),
    chair: asset("chair", "prop", { realHeight: 0.9, surface: 0.5, grounded: true }, 400, 600),
    cup: asset("cup", "prop", { realHeight: 0.3, grounded: true }, 200, 300),
  };
  const place = (layers: unknown[], extra: object = {}) => resolveLayout(VectorShot.parse({ layers, ...extra }), assets);
  const by = (placed: ReturnType<typeof resolveLayout>, i: number) => placed.find((p) => p.index === i)!;
  // Derinlik 0,3: ölçek 0,85; 1,1 m = 374 px. Kişi boyu 578 px, genişliği 289 px.
  const max = CONVERSE.max * STAGE.pxPerMeter * 0.85;

  it("uzaktaki iki kişi ortada buluşur, aralarında konuşma mesafesi kalır; yakındakiler kıpırdamaz", () => {
    const placed = place([
      { asset: "a", x: 400, depth: 0.3 },
      { asset: "b", x: 1500, depth: 0.3 },
    ]);
    expect(by(placed, 1).x - by(placed, 0).x).toBeCloseTo(max, 6);
    expect((by(placed, 0).x + by(placed, 1).x) / 2).toBeCloseTo(950, 6);
    expect(by(placed, 0).fixes).toContain(CONVERSE.note);
    expect(by(placed, 1).fixes).toContain(CONVERSE.note);
    const near = place([
      { asset: "a", x: 800, depth: 0.3 },
      { asset: "b", x: 1150, depth: 0.3 },
    ]);
    expect([by(near, 0).x, by(near, 1).x]).toEqual([800, 1150]);
    expect(by(near, 0).fixes).not.toContain(CONVERSE.note);
  });

  it("aralarına yürüyerek gelecek biri varsa iki kişi yaklaşmaz; hedefi dışarıdaysa yaklaşırlar (PHP s4-sh5)", () => {
    const walker = (toX: number) => ({ asset: "c", x: 100, depth: 0.3, anims: [{ type: "walk", toX }] });
    const between = place([{ asset: "a", x: 400, depth: 0.3 }, { asset: "b", x: 1500, depth: 0.3 }, walker(950)]);
    expect([by(between, 0).x, by(between, 1).x]).toEqual([400, 1500]);
    const outside = place([{ asset: "a", x: 400, depth: 0.3 }, { asset: "b", x: 1500, depth: 0.3 }, walker(1800)]);
    expect(by(outside, 1).x - by(outside, 0).x).toBeCloseTo(max, 6);
    // Hedefsiz yürüyen ve kayarak giren yerinde sayılır; başka derinlikte varan engel değil.
    const still = place([{ asset: "a", x: 400, depth: 0.3 }, { asset: "b", x: 1500, depth: 0.3 }, { asset: "c", x: 950, depth: 0.3, anims: [{ type: "slide_in" }] }]);
    expect([by(still, 0).x, by(still, 1).x]).toEqual([400, 1500]);
    const far = place([{ asset: "a", x: 400, depth: 0.3 }, { asset: "b", x: 1500, depth: 0.3 }, { ...walker(950), depth: 0.9 }]);
    expect(by(far, 1).x - by(far, 0).x).toBeCloseTo(max, 6);
  });

  it("üç kişi birbirine yaklaşır: ortadaki birine yaklaşırken öbüründen uzaklaşmaz", () => {
    const placed = place([
      { asset: "a", x: 200, depth: 0.3 },
      { asset: "b", x: 960, depth: 0.3 },
      { asset: "c", x: 1720, depth: 0.3 },
    ]);
    for (const [l, r] of [
      [0, 1],
      [1, 2],
    ])
      expect(Math.abs(by(placed, r!).x - by(placed, l!).x - max)).toBeLessThan(1.5);
    // Grup sahnenin ortasında kalır.
    expect(by(placed, 1).x).toBeCloseTo(960, 0);
  });

  it("aradaki masa ya da gövde hizasındaki duvar ekranı aşılmaz: kişiler kenarında durur; başların üstündeki pano engel değil", () => {
    const body = 289 * CONVERSE.body;
    const desk = { asset: "desk", x: 960, depth: 0.3 };
    const atDesk = place([{ asset: "a", x: 200, depth: 0.3 }, desk, { asset: "b", x: 1720, depth: 0.3 }]);
    const d = by(atDesk, 1);
    expect(by(atDesk, 0).x).toBeCloseTo(d.x - d.width / 2 - body, 6);
    expect(by(atDesk, 2).x).toBeCloseTo(d.x + d.width / 2 + body, 6);
    // Gövde hizasında duvardaki ekran (yere basmaz) da engeldir.
    const screen = place([{ asset: "a", x: 200, depth: 0.3 }, { asset: "screen", x: 960, y: 700 }, { asset: "b", x: 1720, depth: 0.3 }]);
    const s = by(screen, 1);
    expect(s.grounded).toBe(false);
    expect(by(screen, 0).x).toBeCloseTo(s.x - s.width / 2 - body, 6);
    // Başların üstünde asılı pano engel değil: tam mesafeye gelirler.
    const high = place([{ asset: "a", x: 200, depth: 0.3 }, { asset: "screen", x: 960, y: 200, height: 150 }, { asset: "b", x: 1720, depth: 0.3 }]);
    expect(by(high, 2).x - by(high, 0).x).toBeCloseTo(max, 6);
  });

  it("biri engele dayalıysa kalanı öbürü kapatır", () => {
    // Gövde hizasındaki ekran a'nın hemen yanında: a kıpırdayamaz, b bütün fazlayı kapatır.
    const placed = place([
      { asset: "a", x: 300, depth: 0.3 },
      { asset: "screen", x: 420, y: 700, height: 200 },
      { asset: "b", x: 1700, depth: 0.3 },
    ]);
    expect(by(placed, 0).x).toBe(300);
    expect(by(placed, 0).fixes).not.toContain(CONVERSE.note);
    expect(by(placed, 2).x - 300).toBeCloseTo(max, 6);
  });

  it("kendi dışındaki nesneyi gösteren kişi yerinde kalır, öbürü yaklaşır; aradakini ya da bir kişiyi gösteren yaklaşır", () => {
    const cup = { asset: "cup", x: 100, depth: 0.3 };
    const point = (target?: number) => ({ type: "point", ...(target === undefined ? {} : { target }) });
    // a (sol) kendi solundaki bardağı gösteriyor.
    let placed = place([{ asset: "a", x: 400, depth: 0.3, anims: [point(2)] }, { asset: "b", x: 1500, depth: 0.3 }, cup]);
    expect(by(placed, 0).x).toBe(400);
    expect(by(placed, 1).x).toBeCloseTo(400 + max, 6);
    // b (sağ) kendi sağındaki bardağı gösteriyor.
    placed = place([{ asset: "a", x: 400, depth: 0.3 }, { asset: "b", x: 1500, depth: 0.3, anims: [point(2)] }, { ...cup, x: 1800 }]);
    expect(by(placed, 1).x).toBe(1500);
    expect(by(placed, 1).fixes).not.toContain(CONVERSE.note);
    expect(by(placed, 0).x).toBeCloseTo(1500 - max, 6);
    // İkisi de kendi yanındakini gösteriyor: kimse kıpırdamaz.
    placed = place([
      { asset: "a", x: 400, depth: 0.3, anims: [point(2)] },
      { asset: "b", x: 1500, depth: 0.3, anims: [point(3)] },
      cup,
      { ...cup, x: 1800 },
    ]);
    expect([by(placed, 0).x, by(placed, 1).x]).toEqual([400, 1500]);
    // Hedefsiz işaret, olmayan katman, öbür kişi ve aradaki nesne kişiyi tutmaz.
    for (const anims of [[point()], [point(9)], [point(1)], [{ type: "explain" }]]) {
      placed = place([{ asset: "a", x: 400, depth: 0.3, anims }, { asset: "b", x: 1500, depth: 0.3 }]);
      expect(by(placed, 1).x - by(placed, 0).x).toBeCloseTo(max, 6);
    }
    placed = place([{ asset: "a", x: 400, depth: 0.3, anims: [point(2)] }, { asset: "b", x: 1500, depth: 0.3 }, { ...cup, x: 950 }]);
    expect(by(placed, 0).x).toBeGreaterThan(400);
  });

  it("farklı derinlikteki, giren, oturan kişiye; yakın çekimde ve tahtalı çekimde dokunulmaz", () => {
    const two = (b: object) => [{ asset: "a", x: 400, depth: 0.3 }, { asset: "b", x: 1500, depth: 0.3, ...b }];
    const xs = (placed: ReturnType<typeof resolveLayout>) => [by(placed, 0).x, by(placed, 1).x];
    expect(xs(place(two({ depth: 0.6 })))).toEqual([400, 1500]);
    expect(xs(place(two({ anims: [{ type: "walk", toX: 1200 }] })))).toEqual([400, 1500]);
    const seated = place([{ asset: "a", x: 400, depth: 0.3 }, { asset: "chair", x: 1500, depth: 0.3 }, { asset: "b", x: 1500, on: 1 }]);
    expect(by(seated, 0).x).toBe(400);
    expect(xs(place(two({}), { camera: { zoomFrom: 1, zoomTo: 1.6 } }))).toEqual([400, 1500]);
    expect(xs(place(two({}), { math: { steps: ["a = b"] } }))).toEqual([400, 1500]);
  });
});

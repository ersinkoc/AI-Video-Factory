import { RIG, TimelineVisual, VectorAsset, VectorShot } from "@ys/core";
import { describe, expect, it, vi } from "vitest";

// 3D figür, küre ve atmosfer bu denetimde çizilmez (Vector.tsx onları içe aktarır).
vi.mock("../src/Globe3D.tsx", () => ({ Globe3D: () => null }));
vi.mock("../src/Ambience.tsx", () => ({ Ambience: () => null }));
vi.mock("../src/Figure3D.tsx", () => ({ Figure3D: () => null }));
// Hiçbir jest anatomi sınırını aşmıyor (vector-scene testi); denetimin bildirdiğini görmek için kırpma taklit edilir.
const strain = vi.hoisted(() => ({ on: false }));
vi.mock("../src/anatomy.ts", async (orig) => {
  const real = await orig<typeof import("../src/anatomy.ts")>();
  return {
    ...real,
    anatomical: (pose: Parameters<typeof real.anatomical>[0], profile: boolean) => {
      const r = real.anatomical(pose, profile);
      return strain.on ? { pose: r.pose, strains: [{ part: "forearm-r", what: "rotate", value: 158.4, limit: 150 }] } : r;
    },
  };
});

const { frameIssues, LINT, lintShot, snaps } = await import("../src/lint.ts");
const { faceSafe, FACE_SAFE } = await import("../src/Vector.tsx");
type View = Parameters<typeof frameIssues>[0];
type Layer = View["layers"][number];

const PARTS = Object.keys(RIG.pivots);
const rig = (fill: string) => `<svg viewBox="0 0 400 800">${PARTS.map((p) => `<g id="${p}"><rect width="10" height="10" fill="${fill}"/></g>`).join("")}</svg>`;
const asset = (id: string, kind: "character" | "prop" | "background", svg: string, width: number, height: number, meta: object = {}) => VectorAsset.parse({ id, kind, svg, width, height, meta });
const ASSETS = {
  hero: asset("hero", "character", rig("#123456"), 400, 800),
  pal: asset("pal", "character", rig("#654321"), 400, 800),
  walker: asset("walker", "character", rig("#aa0000"), 400, 800),
  "walker~side": asset("walker~side", "character", rig("#0000aa"), 400, 800),
  cup: asset("cup", "prop", '<svg viewBox="0 0 100 100"><rect width="100" height="100"/></svg>', 100, 100, { realHeight: 0.3 }),
  room: asset("room", "background", '<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080"/></svg>', 1920, 1080),
  map: asset("map", "background", '<svg viewBox="0 0 1920 1080"><rect width="1920" height="1080"/></svg>', 1920, 1080, { exact: true }),
};
const visual = (shot: object, durationInFrames = 90, extra: object = {}) =>
  TimelineVisual.parse({ shotId: "s1", assetUrl: "", kind: "motion_graphic", fromFrame: 0, durationInFrames, vector: VectorShot.parse(shot), ...extra });
const codes = (list: { code: string }[]) => list.map((i) => i.code).sort();

const person = (o: Partial<Layer> = {}): Layer => ({
  index: 0,
  person: true,
  box: { x: 400, y: 200, w: 200, h: 600 },
  opacity: 1,
  moving: false,
  x: 500,
  z: 50,
  width: 300,
  face: { x: 450, y: 250, w: 100, h: 100 },
  ...o,
});
const prop = (o: Partial<Layer> = {}): Layer => ({ index: 1, person: false, box: { x: 440, y: 240, w: 200, h: 200 }, opacity: 1, moving: false, x: 540, z: 80, width: 200, ...o });
const issues = (v: Partial<View>) => {
  const out: [string, number][] = [];
  frameIssues({ layers: [], texts: [], ...v }, (code, _detail, layer) => out.push([code, layer]));
  return out;
};

describe("denetim: kare kuralları", () => {
  it("yarım yüz: kadrajın kenarında kısmen görünen yüz; tamamı dışarıdaki, kadraja giren ve neredeyse tamamı görünen değil", () => {
    expect(issues({ layers: [person({ face: { x: -50, y: 250, w: 100, h: 100 } })] })).toEqual([["face_cut", 0]]);
    expect(issues({ layers: [person({ face: { x: -50, y: 250, w: 100, h: 100 }, moving: true })] })).toEqual([]);
    expect(issues({ layers: [person({ face: { x: -200, y: 250, w: 100, h: 100 } })] })).toEqual([]);
    expect(issues({ layers: [person({ face: { x: -20, y: 250, w: 100, h: 100 } })] })).toEqual([]);
    // Ölçülemeyen (sıfır alanlı) yüz ve yüzü olmayan katman bakılmaz.
    expect(issues({ layers: [person({ face: { x: 0, y: 0, w: 0, h: 10 } }), prop()] })).toEqual([]);
  });

  it("örtülen yüz: önde çizilen görünür katman yüzün yarısına yakınını kapatırsa; geçerken (biri yürürken) ve saydamken değil", () => {
    expect(issues({ layers: [person(), prop()] })).toEqual([["face_covered", 0]]);
    // Arkada çizilen örtmez.
    expect(issues({ layers: [prop(), person()] })).toEqual([]);
    expect(issues({ layers: [person(), prop({ opacity: 0.3 })] })).toEqual([]);
    expect(issues({ layers: [person(), prop({ moving: true })] })).toEqual([]);
    expect(issues({ layers: [person({ moving: true }), prop()] })).toEqual([]);
    expect(issues({ layers: [person({ opacity: 0.2 }), prop()] })).toEqual([]);
    // Neredeyse tamamı kadraj dışında olan yüz örtülmüş sayılmaz.
    expect(issues({ layers: [person({ face: { x: -95, y: 250, w: 100, h: 100 } }), prop({ box: { x: 0, y: 0, w: 1920, h: 1080 } })] })).toEqual([]);
    expect(issues({ layers: [person(), prop({ box: { x: 540, y: 240, w: 200, h: 200 } })] })).toEqual([]);
  });

  it("yüzdeki yazı", () => {
    expect(issues({ layers: [person()], texts: [{ text: "1923", box: { x: 400, y: 260, w: 300, h: 60 } }] })).toEqual([["text_on_face", 0]]);
    expect(issues({ layers: [person()], texts: [{ text: "1923", box: { x: 400, y: 100, w: 300, h: 60 } }] })).toEqual([]);
  });

  it("iç içe yürüme: aynı derinlikte, biri yürürken, gövdeler üst üste; kadraj dışında, farklı derinlikte ya da ikisi de dururken değil", () => {
    const a = person({ face: undefined as never, moving: true });
    delete a.face;
    const b = person({ index: 1, x: 540 });
    delete b.face;
    expect(issues({ layers: [a, b] })).toEqual([["walk_through", 0]]);
    expect(issues({ layers: [a, { ...b, x: 1000 }] })).toEqual([]);
    expect(issues({ layers: [a, { ...b, z: 70 }] })).toEqual([]);
    expect(issues({ layers: [{ ...a, moving: false }, b] })).toEqual([]);
    const off = { x: -900, y: 0, w: 200, h: 600 };
    expect(issues({ layers: [{ ...a, box: off }, { ...b, box: off }] })).toEqual([]);
    expect(issues({ layers: [{ ...a, box: off }, b] })).toEqual([["walk_through", 0]]);
  });

  it("sıçrayan eklem: ardışık iki karede dönüşü 25°'den çok değişen parça (açı farkı en kısa yoldan)", () => {
    const hits: [string, number][] = [];
    const m = (pose: object) => ({ tr: { x: 0, y: 0, scale: 1, rotate: 0, opacity: 1 }, flip: false, squash: 1, pose }) as never;
    snaps(m({ "arm-r": { rotate: 0 }, torso: { rotate: 0 }, head: { rotate: 350 } }), m({ "arm-r": { rotate: 30 }, torso: { rotate: -40 }, head: { rotate: 10 }, "leg-l": { rotate: 90 } }), (part, d) => hits.push([part, Math.round(d)]));
    expect(hits).toEqual([
      ["arm-r", 30],
      ["torso", 40],
    ]);
    snaps(m(undefined as never), m({}), () => hits.push(["x", 0]));
    expect(hits).toHaveLength(2);
    expect(LINT.snapDeg).toBe(25);
  });
});

describe("denetim: çekim", () => {
  it("vektör olmayan çekime bakılmaz", () => {
    expect(lintShot(TimelineVisual.parse({ shotId: "s1", assetUrl: "x.png", kind: "still_motion", fromFrame: 0, durationInFrames: 30 }), ASSETS)).toEqual([]);
  });

  it("temiz çekim: odada konuşan iki kişi", () => {
    const shot = { background: "room", layers: [{ asset: "hero", x: 700, depth: 0.2, anims: [{ type: "talk" }] }, { asset: "pal", x: 1200, depth: 0.2 }], texts: [{ text: "1923", style: "title", x: 0, y: 0 }] };
    expect(lintShot(visual(shot), ASSETS)).toEqual([]);
  });

  it("çizilemeyen katman ve mekân yeniden plan ister; kodun düzelttiği jest (hedefsiz işaret) yalnız bildirilir", () => {
    const out = lintShot(visual({ background: "yok", layers: [{ asset: "hero", x: 960, depth: 0.2, anims: [{ type: "point" }] }, { asset: "kayip", x: 300 }] }), ASSETS);
    expect(out).toEqual([
      { code: "point_at_nothing", shotId: "s1", layer: 0, detail: expect.any(String), replan: false },
      { code: "missing_asset", shotId: "s1", layer: 1, detail: "layer asset kayip is not drawn", replan: true },
      { code: "missing_asset", shotId: "s1", detail: "background yok is not drawn", replan: true },
    ]);
  });

  it("yarım yüz çekimin sonunda (kadraj durunca) bildirilir; yürüyüş sırasında kenardan geçmek değil", () => {
    // Kenara yürüyüp orada duran kişi: varınca yüzü yarım.
    const out = lintShot(visual({ background: "room", layers: [{ asset: "hero", x: 960, depth: 0.2, anims: [{ type: "walk", toX: 60, end: 0.5 }] }] }), ASSETS, { step: 5 });
    expect(codes(out)).toContain("face_cut");
    const cut = out.find((i) => i.code === "face_cut")!;
    expect([cut.layer, cut.replan]).toEqual([0, true]);
    // Kadraj dışına yürüyüp çıkan kişi sorun değil.
    const away = lintShot(visual({ background: "room", layers: [{ asset: "hero", x: 960, depth: 0.2, anims: [{ type: "walk", toX: -800, end: 0.5 }] }] }), ASSETS, { step: 5 });
    expect(codes(away)).not.toContain("face_cut");
    // Çekimin başında kenarda yarım duran, sonra içeri yürüyen kişi.
    const late = lintShot(visual({ background: "room", layers: [{ asset: "hero", x: 20, depth: 0.2, anims: [{ type: "walk", toX: 960, start: 0.5 }] }] }), ASSETS, { step: 5 });
    expect(late.find((i) => i.code === "face_cut")!.frame).toBe(0);
    // Ortada uzun süre kenarda yarım kalan kişi (başta içeride, sonunda dışarıda).
    const stay = lintShot(
      visual({ background: "room", layers: [{ asset: "hero", x: 960, depth: 0.2, anims: [{ type: "walk", toX: 40, end: 0.3 }, { type: "walk", toX: 160, start: 0.7 }] }] }),
      ASSETS,
      { step: 5 },
    );
    expect(codes(stay)).toContain("face_cut");
    // Kenarda kısa bir an (bakılan karelerin üçte birinden az) yarım kalıp çıkan yüz bildirilmez.
    const pass = lintShot(
      visual({ background: "room", layers: [{ asset: "hero", x: 960, depth: 0.2, anims: [{ type: "walk", toX: 40, end: 0.3 }, { type: "walk", toX: 160, start: 0.42 }] }] }),
      ASSETS,
      { step: 5 },
    );
    expect(codes(pass)).not.toContain("face_cut");
  });

  it("anatomi: render'ın insan eklem sınırına kırptığı poz kodla düzeltilmiş sayılır (yeniden planlanmaz), kişi başına bir kez", () => {
    strain.on = true;
    // Yürüyen (yan çizime geçen) kişinin profil pozu da kırpılır.
    const walk = { asset: "walker", x: 200, depth: 0.5, anims: [{ type: "walk", toX: 1600 }] };
    const out = lintShot(visual({ background: "room", layers: [{ asset: "hero", x: 700, depth: 0 }, { asset: "cup", x: 1200, y: 700 }, walk] }), ASSETS);
    strain.on = false;
    const detail = "forearm-r rotate 158 beyond the human limit 150";
    expect(out.filter((i) => i.code === "anatomy")).toEqual([
      { code: "anatomy", shotId: "s1", layer: 2, frame: 0, detail, replan: false },
      { code: "anatomy", shotId: "s1", layer: 0, frame: 0, detail, replan: false },
    ]);
    expect(codes(lintShot(visual({ background: "room", layers: [{ asset: "hero", x: 700, depth: 0 }] }), ASSETS))).not.toContain("anatomy");
  });

  it("iç içe yürüme: yürüyüp aynı derinlikteki birinin hemen yanında duran", () => {
    const out = lintShot(visual({ background: "room", layers: [{ asset: "pal", x: 900, depth: 0.2 }, { asset: "hero", x: 300, depth: 0.2, anims: [{ type: "walk", toX: 950 }] }] }), ASSETS);
    expect(out.find((i) => i.code === "walk_through")).toMatchObject({ layer: 0, replan: true });
  });

  it("boş kadraj: planlanan her şey kadrajın çok küçük bir kısmında; harita ve katmansız çekim değil", () => {
    const tiny = { background: "room", layers: [{ asset: "cup", x: 960, depth: 1 }] };
    expect(codes(lintShot(visual(tiny), ASSETS))).toEqual(["empty_frame"]);
    expect(lintShot(visual({ ...tiny, background: "map" }), ASSETS)).toEqual([]);
    expect(lintShot(visual({ background: "room", layers: [] }), ASSETS)).toEqual([]);
    // Saydam (henüz belirmemiş) katman görünen içerik sayılmaz.
    const hidden = { background: "room", layers: [{ asset: "hero", x: 960, depth: 0.2, anims: [{ type: "fade_in", start: 0.9 }] }] };
    expect(codes(lintShot(visual(hidden), ASSETS))).toEqual(["empty_frame"]);
  });

  it("sıçrayan eklem: hızlı koşuda bacaklar karede savrulur; irkilme ve yan çizime geçiş sayılmaz", () => {
    // Yan çizimde (adımlar geniş) 1600 px yarım saniyede.
    const sprint = lintShot(visual({ background: "room", layers: [{ asset: "walker", x: 200, depth: 0.2, anims: [{ type: "walk", toX: 1800, start: 0.4, end: 0.45 }] }] }, 300), ASSETS, { step: 1 });
    expect(codes(sprint)).toContain("pose_snap");
    expect(sprint.find((i) => i.code === "pose_snap")!.detail).toMatch(/jumps \d+° in one frame/);
    const startle = lintShot(visual({ background: "room", layers: [{ asset: "hero", x: 960, depth: 0.2, anims: [{ type: "surprised", start: 0.3, end: 0.6 }] }] }, 90), ASSETS, { step: 1 });
    expect(codes(startle)).not.toContain("pose_snap");
    const side = lintShot(visual({ background: "room", layers: [{ asset: "walker", x: 300, depth: 0.2, anims: [{ type: "walk", toX: 1500 }] }] }, 300), ASSETS, { step: 1 });
    expect(codes(side)).not.toContain("pose_snap");
  });

  it("varsayılan adım ve kare hızı; son kare de bakılır", () => {
    const shot = { background: "room", layers: [{ asset: "hero", x: 960, depth: 0.2 }], texts: [{ text: "Ada", style: "label", x: 960, y: 200 }] };
    expect(lintShot(visual(shot, 31), ASSETS)).toEqual([]);
    expect(lintShot(visual(shot, 31, { overlay: "board.webm" }), ASSETS, { fps: 25 })).toEqual([]);
  });
});

describe("kamera: durağan kadrajda yarım yüz yok", () => {
  const cam = (c: object) => VectorShot.parse({ layers: [], camera: c }).camera;
  const face = { x: 1400, y: 500, w: 80, h: 80 };

  it("yüz tamamen içerideyse kamera aynı kalır", () => {
    const c = cam({ zoomFrom: 2, zoomTo: 2, panX: 0 });
    expect(faceSafe(c, true, [{ x: 900, y: 500, w: 80, h: 80 }], true)).toBe(c);
  });

  it("kenardaki yarım yüz için odak en az kayar: yüz ya tamamen dışarıda ya tamamen içeride (payıyla)", () => {
    // Odak 960, 2x: kadraj tuvalin 480–1440 aralığı; payıyla yüz 1384–1496. Dışarı almak 56 px, içeri almak 56 px: önce sol.
    const out = faceSafe(cam({ zoomFrom: 2, zoomTo: 2, panX: 0 }), true, [face], true);
    expect([out.focusX, out.focusY]).toEqual([904, 540]);
    expect(FACE_SAFE.pad[0]).toBe(0.2);
    // Odak 1000: içeri almak 16 px (dışarı 96): içeri alınır; dikey kayma kapalı.
    const near = faceSafe(cam({ zoomFrom: 2, zoomTo: 2, panX: 0, focusX: 1000, focusY: 500 }), true, [face], false);
    expect([near.focusX, near.focusY]).toEqual([1016, 500]);
  });

  it("yüzü yandan dışarıda kalan kişinin gövdesi (uzanan kolu) kenardan sızmaz; yüzü yukarıdan dışarıdakine dokunulmaz", () => {
    // Odak 960, 2x: kadraj 480–1440. Kişi solda, yüz kadraj dışında (payıyla 392–448) ama gövde kutusu 360–520: kol sızıyor.
    const c = cam({ zoomFrom: 2, zoomTo: 2, panX: 0 });
    const face = { x: 400, y: 300, w: 40, h: 40 };
    const out = faceSafe(c, true, [face], false, [{ x: 360, y: 260, w: 160, h: 400 }]);
    expect(FACE_SAFE.arm).toBe(0.2);
    // Gövde (kol payıyla 328–552) dışarı: odak 72 px sağa; yüzü içeri almak 88 px sola, daha uzak.
    expect(out.focusX).toBe(1032);
    // Gövde kutusu verilmezse eski davranış: yüz dışarıdaysa yeter.
    expect(faceSafe(c, true, [face], false)).toBe(c);
    // Yüz yukarıdan dışarıda (masadaki eller ara çekimi): kamera aynı kalır.
    const top = cam({ zoomFrom: 2, zoomTo: 2, panX: 0, focusY: 800 });
    expect(faceSafe(top, true, [{ x: 900, y: 200, w: 40, h: 40 }], true, [{ x: 860, y: 160, w: 160, h: 600 }])).toBe(top);
  });

  it("uyan odak yoksa (tam kadrajda odak kadrajı kaydırmaz) kamera aynı kalır", () => {
    const wide = cam({ zoomFrom: 1, zoomTo: 1, panX: 0 });
    expect(faceSafe(wide, false, [{ x: -40, y: 400, w: 100, h: 100 }], true)).toBe(wide);
  });
});

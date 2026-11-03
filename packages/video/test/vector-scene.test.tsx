// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { RIG, RIG_SIDE, textureLayer, TimelineVisual, VectorAsset, VectorLayer, VectorShot, type LineStyle, type Texture } from "@ys/core";
import { random } from "remotion";
import { afterEach, describe, expect, it, vi } from "vitest";

// Remotion bağlamı yerine kare ve video ayarı testten verilir; geri kalan (Easing, interpolate, random) gerçek.
const clock = vi.hoisted(() => ({ frame: 0, fps: 30, width: 1920, height: 1080 }));
vi.mock("remotion", async (orig) => ({
  ...(await orig<typeof import("remotion")>()),
  useCurrentFrame: () => clock.frame,
  useVideoConfig: () => ({ fps: clock.fps, width: clock.width, height: clock.height, durationInFrames: 300 }),
  // Remotion'un Img'i kompozisyon ister; burada düz resim yeter.
  Img: (p: object) => <img {...p} />,
}));

// 3D küre ayrı testte (globe3d.test.tsx); burada yalnız sahneye hangi bilgiyle konduğu.
vi.mock("../src/Globe3D.tsx", () => ({
  Globe3D: ({ globe, p, seed }: { globe: { lon: number }; p: number; seed: string }) => <div data-globe={`${globe.lon}|${p}|${seed}`} />,
}));

// Atmosfer ayrı testte (episode.test.tsx): burada yalnız sahnenin hangi katmanında, hangi boyda çizildiği.
vi.mock("../src/Ambience.tsx", () => ({
  Ambience: ({ kind, size }: { kind: string; size?: number[] }) => (kind === "none" ? null : <div data-ambience={kind} data-size={size?.join("x")} />),
}));

// 3D figür ayrı testte (figure3d-view.test.tsx); burada yalnız katmana hangi tarif, poz ve SVG yedeğiyle konduğu.
vi.mock("../src/Figure3D.tsx", () => ({
  Figure3D: ({ spec, pose, view, fallback, scale }: { spec: { skin: string }; pose?: Record<string, { rotate: number }>; view: { turn?: number; profile?: boolean }; fallback: unknown; scale: number }) => (
    <div data-figure={spec.skin} data-arm={pose?.["arm-r"]?.rotate} data-turn={view.turn ?? 0} data-profile={String(Boolean(view.profile))} data-scale={scale}>
      {fallback as never}
    </div>
  ),
}));

const { clapClosed, penDown, typingTaps } = await import("../src/gesture-timing.ts");
const { tip } = await import("../src/ik.ts");
const { VectorScene, layoutTexts, closeUpCamera, frameWide, cameraTransform, cameraPoint, namesMatch, faceOnScreen, HOLD_POSE, ARM, fitFace, faceFor, heldFraming, fillWide, jointSafe, wrapTorso, stageFit, tagBounds, contentFit, stanceAt, STANCE, restPoseOf, THINK, armInFront, thinkPoseOf, SCRATCH, POINT } = await import("../src/Vector.tsx");
/** Yerleşmiş katman örneği (kamera testleri). */
const PL = { index: 0, x: 0, y: 0, height: 0, width: 0, scale: 1, z: 0, sitting: false, grounded: true, fixes: [] as string[] };

afterEach(() => {
  cleanup();
  Object.assign(clock, { frame: 0, fps: 30, width: 1920, height: 1080 });
});

const DURATION = 300; // 10 sn @ 30 fps: p = kare / 300, t = kare / 30

const PARTS = Object.keys(RIG.pivots);
const asset = (id: string, kind: "character" | "prop" | "background", svg: string, width: number, height: number, meta: object = {}) =>
  VectorAsset.parse({ id, kind, svg, width, height, meta });

const ASSETS = {
  box: asset("box", "prop", '<svg viewBox="0 0 100 100"><rect id="box" width="100" height="100" fill="#ff0000"/></svg>', 100, 100),
  cup: asset("cup", "prop", '<svg viewBox="0 0 100 100"><rect id="cup" width="100" height="100" fill="#00ff00"/></svg>', 100, 100, { realHeight: 0.3 }),
  chair: asset("chair", "prop", '<svg viewBox="0 0 100 100"><rect id="chair" width="100" height="100" fill="#0000ff"/></svg>', 100, 100, { realHeight: 0.9, surface: 0.5, grounded: true }),
  hero: asset(
    "hero",
    "character",
    `<svg viewBox="0 0 400 800">${PARTS.map((p) => `<g id="${p}"><rect width="10" height="10" fill="#123456"/></g>`).join("")}</svg>`,
    400,
    800,
  ),
  room: asset("room", "background", '<svg viewBox="0 0 1920 1080"><rect id="wall" width="1920" height="1080" fill="#aaaaaa"/></svg>', 1920, 1080),
  map: asset("map", "background", '<svg viewBox="0 0 1920 1080"><path id="route-0" d="M0 0L10 10" stroke="#f00"/><path id="route-1" d="M0 0L9 9"/></svg>', 1920, 1080, {
    exact: true,
    routes: 2,
    labels: [
      { x: 300, y: 200, text: "Türkiye", kind: "country" },
      { x: 500, y: 400, text: "İstanbul", kind: "city", order: 3 },
      { x: 700, y: 500, text: "Sefer", kind: "route", order: 1 },
    ],
  }),
  globe: asset("globe", "background", '<svg viewBox="0 0 1920 1080"><g id="globe-base"><rect id="sky" width="1920" height="1080"/></g><path id="route-0" d="M0 0L10 10"/></svg>', 1920, 1080, {
    exact: true,
    routes: 1,
    labels: [{ x: 960, y: 480, text: "Türkiye", kind: "country" }],
    globe: { lon: 35, lat: 39, cx: 960, cy: 480, r: 370, texture: "<svg/>" },
  }),
  flag: asset("flag", "background", '<svg viewBox="0 0 1920 1080"><rect id="red" width="1920" height="1080" fill="#e30a17"/></svg>', 1920, 1080, { exact: true }),
  broken: asset("broken", "prop", "bu bir svg değil", 100, 100),
  // Tuvali kaplayan duvar öğesi: içerik kadrajı doldurur, geniş çekimde kamera kendiliğinden yaklaşmaz (fillWide).
  panorama: asset("panorama", "prop", '<svg viewBox="0 0 1920 1080"><rect id="panorama" width="1920" height="1080" fill="#999999"/></svg>', 1920, 1080, { grounded: false }),
  longtable: asset("longtable", "prop", '<svg viewBox="0 0 1000 100"><rect id="longtable" width="1000" height="100"/></svg>', 1000, 100, { realHeight: 0.9, grounded: true }),
  // Aynı karakterin ön (kırmızı) ve yan (mavi) çizimi.
  walker: asset("walker", "character", `<svg viewBox="0 0 400 800">${PARTS.map((p) => `<g id="${p}"><rect width="10" height="10" fill="#aa0000"/></g>`).join("")}</svg>`, 400, 800),
  // Adı bilinen karakterler (kalite kapısının kaydı): etiketler adla kişiye bağlanır.
  ada: asset("ada", "character", `<svg viewBox="0 0 400 800">${PARTS.map((p) => `<g id="${p}"><rect width="10" height="10" fill="#335533"/></g>`).join("")}</svg>`, 400, 800, {
    check: { kind: "character", name: "Ada Lovelace", recognizable: 8, passed: true },
  }),
  babbage: asset("babbage", "character", `<svg viewBox="0 0 400 800">${PARTS.map((p) => `<g id="${p}"><rect width="10" height="10" fill="#553333"/></g>`).join("")}</svg>`, 400, 800, {
    check: { kind: "character", name: "Charles Babbage", recognizable: 8, passed: true },
  }),
  // 3D figürlü karakter (SVG de var: kalite kapısı ve WebGL yedeği); yan görünüşü SVG.
  toy: asset("toy", "character", `<svg viewBox="0 0 400 800">${PARTS.map((p) => `<g id="${p}"><rect width="10" height="10" fill="#777777"/></g>`).join("")}</svg>`, 400, 800, {
    figure: { skin: "#f1c7a5", hair: { style: "short", color: "#3a2a20" }, top: { style: "sweater", color: "#5b7fbf" }, bottom: { style: "trousers", color: "#3b3f4a" }, shoes: "#2b2622" },
  }),
  "toy~side": asset("toy~side", "character", `<svg viewBox="0 0 400 800">${PARTS.map((p) => `<g id="${p}"><rect width="10" height="10" fill="#0000aa"/></g>`).join("")}</svg>`, 400, 800),
  // Yüzü ölçülebilen karakter: konuşurken ağzı koddan çizilir (mouthShape).
  talker: asset(
    "talker",
    "character",
    `<svg viewBox="0 0 400 800">${PARTS.filter((p) => !["head", "eyes", "mouth"].includes(p))
      .map((p) => `<g id="${p}"><rect width="10" height="10" fill="#335577"/></g>`)
      .join("")}<g id="head"><circle cx="200" cy="170" r="80" fill="#f2c9a5"/><g id="eyes"><circle cx="180" cy="160" r="6"/><circle cx="220" cy="160" r="6"/></g><g id="mouth"><path d="M185 205 Q200 215 215 205" fill="none" stroke="#3a2020"/></g></g></svg>`,
    400,
    800,
  ),
  // Ağzının ebeveyn matrisi tersinmez (yassı): ağız ölçülür ama koddan çizilemez, çizimin ağzı kalır.
  flat: asset(
    "flat",
    "character",
    `<svg viewBox="0 0 400 800">${PARTS.filter((p) => p !== "mouth" && p !== "head")
      .map((p) => `<g id="${p}"><rect width="10" height="10" fill="#557733"/></g>`)
      .join("")}<g id="head"><circle cx="200" cy="170" r="80"/><g transform="matrix(1 0 0 0 0 205)"><g id="mouth"><rect x="180" y="200" width="40" height="10"/></g></g></g></svg>`,
    400,
    800,
  ),
  "walker~side": asset("walker~side", "character", `<svg viewBox="0 0 400 800">${PARTS.map((p) => `<g id="${p}"><rect width="10" height="10" fill="#0000aa"/></g>`).join("")}</svg>`, 400, 800),
  // İç içe kollu, uzun elli (parmak uçları y 580), yüzü ölçülen karakter; çizimde baş kollardan sonra gelir.
  thinker: asset(
    "thinker",
    "character",
    `<svg viewBox="0 0 400 800"><g id="leg-l"><g id="shin-l"><rect x="165" y="520" width="20" height="260"/></g></g><g id="leg-r"><g id="shin-r"><rect x="215" y="520" width="20" height="260"/></g></g><g id="body"><rect x="150" y="290" width="100" height="240"/></g>${(["l", "r"] as const)
      .map((s) => {
        const x = s === "l" ? 130 : 250;
        return `<g id="arm-${s}"><rect x="${x}" y="290" width="20" height="110"/><g id="forearm-${s}"><rect x="${x}" y="400" width="20" height="90"/><g id="hand-${s}"><rect x="${x}" y="490" width="20" height="90"/></g></g></g>`;
      })
      .join(
        "",
      )}<g id="head"><circle cx="200" cy="170" r="80" fill="#f2c9a5"/><g id="brows"><rect x="175" y="135" width="50" height="4"/></g><g id="eyes"><circle cx="180" cy="160" r="6"/><circle cx="220" cy="160" r="6"/></g><g id="mouth"><path d="M185 205 Q200 215 215 205" fill="none" stroke="#3a2020"/></g></g></svg>`,
    400,
    800,
  ),
};

interface Opts {
  frame?: number;
  palette?: string[];
  lineStyle?: LineStyle;
  texture?: Texture;
  width?: number;
  height?: number;
  shotId?: string;
  speech?: { text: string; startMs: number; endMs: number }[];
  ambience?: string;
  insets?: boolean;
  overlay?: string;
}

function scene(shot: object, o: Opts = {}) {
  Object.assign(clock, { frame: o.frame ?? 0, width: o.width ?? 1920, height: o.height ?? 1080 });
  const visual = TimelineVisual.parse({
    shotId: o.shotId ?? "s1",
    assetUrl: "",
    kind: "motion_graphic",
    fromFrame: 0,
    durationInFrames: DURATION,
    vector: VectorShot.parse(shot),
    ...(o.overlay ? { overlay: o.overlay } : {}),
  });
  const props = {
    visual,
    assets: ASSETS,
    palette: o.palette ?? [],
    ...(o.speech ? { speech: o.speech } : {}),
    ...(o.texture ? { texture: o.texture } : {}),
    ...(o.ambience ? { ambience: o.ambience as never } : {}),
    ...(o.insets === undefined ? {} : { insets: o.insets }),
  };
  return render(o.lineStyle ? <VectorScene {...props} lineStyle={o.lineStyle} /> : <VectorScene {...props} />).container;
}

/** Bir varlığın çizildiği katman kutusu (svg → iç div → katman div). */
function layerBox(c: HTMLElement, id: string, shotId = "s1"): HTMLElement {
  const el = c.querySelector(`[id$="-${id}"]`);
  if (!el || !el.id.startsWith(shotId)) throw new Error(`katman yok: ${id}`);
  return el.closest("svg")!.parentElement!.parentElement as HTMLElement;
}

/** translate(x, y) rotate(r) scale(sx, sy) */
function transformOf(el: HTMLElement) {
  const n = [...el.style.transform.matchAll(/-?[\d.]+(?:e-?\d+)?/g)].map((m) => Number(m[0]));
  return { x: n[0]!, y: n[1]!, rotate: n[2]!, sx: n[3]!, sy: n[4]! };
}

/** İskelet CSS'inden parça pozu. */
function pose(c: HTMLElement | string, part: string, prefix = "s1-0-") {
  const css = typeof c === "string" ? c : (c.querySelector("style")?.textContent ?? "");
  // Ön kolun başındaki isteğe bağlı ölçek, kısalan üst kolun ölçeğini geri alır (undo).
  const m = new RegExp(
    `#${prefix}${part}\\{transform:(?:scale\\((-?[\\d.]+), (-?[\\d.]+)\\) )?translate\\((-?[\\d.]+)px, (-?[\\d.]+)px\\) rotate\\((-?[\\d.]+)deg\\) scale\\((-?[\\d.]+), (-?[\\d.]+)\\)`,
  ).exec(css);
  if (!m) throw new Error(`parça yok: ${part}`);
  const [, ux, uy, tx, ty, rotate, sx, sy] = m.map(Number);
  return { tx: tx!, ty: ty!, rotate: rotate!, sx: sx!, sy: sy!, undo: m[1] === undefined ? undefined : [ux!, uy!] };
}

/** Havadaki tek kutu: yerleşim x=960, alt y=500, 200×200 px. */
const boxShot = (anims: object[], extra: object = {}) => ({ layers: [{ asset: "box", x: 960, y: 500, height: 200, anims, ...extra }] });
const boxAt = (anims: object[], frame: number, extra: object = {}) => {
  const c = scene(boxShot(anims, extra), { frame });
  const el = layerBox(c, "box");
  cleanup();
  return { el, tr: transformOf(el), opacity: Number(el.style.opacity) };
};

describe("vektör sahne: katman animasyonları", () => {
  it("kutuyu yerleşimdeki yerine ve boyuna çizer", () => {
    const { el, tr, opacity } = boxAt([], 0);
    expect([el.style.left, el.style.top, el.style.width, el.style.height]).toEqual(["860px", "300px", "200px", "200px"]);
    expect(tr).toEqual({ x: 0, y: 0, rotate: 0, sx: 1, sy: 1 });
    expect(opacity).toBe(1);
    expect(el.style.filter).toBe("");
  });

  it("fade_in pencereden önce görünmez, ortasında yarı, sonra tam görünür", () => {
    const a = [{ type: "fade_in", start: 0.2, end: 0.4 }];
    expect(boxAt(a, 30).opacity).toBe(0);
    expect(boxAt(a, 90).opacity).toBeCloseTo(0.5);
    expect(boxAt(a, 150).opacity).toBe(1);
  });

  it("fade_out pencereden sonra kaybolur", () => {
    const a = [{ type: "fade_out", start: 0.6, end: 0.8 }];
    expect(boxAt(a, 150).opacity).toBe(1);
    expect(boxAt(a, 210).opacity).toBeCloseTo(0.5);
    expect(boxAt(a, 270).opacity).toBe(0);
  });

  it("katman opaklığı animasyonla çarpılır", () => {
    expect(boxAt([{ type: "fade_in", start: 0.2, end: 0.4 }], 90, { opacity: 0.5 }).opacity).toBeCloseTo(0.25);
  });

  it("slide_in dört yönden kadraj dışından gelir, sonunda yerindedir", () => {
    const at0 = (from?: string) => boxAt([{ type: "slide_in", start: 0, end: 0.5, ...(from ? { from } : {}) }], 0).tr;
    expect(at0().x).toBe(-(960 + 400)); // varsayılan: soldan
    expect(at0("left").x).toBe(-(960 + 400));
    expect(at0("right").x).toBe(1920 - 960 + 400);
    expect(at0("top").y).toBe(-(500 + 400));
    expect(at0("bottom").y).toBe(1080 - 500 + 600);
    expect(boxAt([{ type: "slide_in", start: 0, end: 0.5, from: "top" }], 200).tr).toMatchObject({ x: 0, y: 0 });
  });

  it("pop pencereden önce sıfır boyda, sonunda tam boydadır", () => {
    const a = [{ type: "pop", start: 0.2, end: 0.4 }];
    expect(boxAt(a, 30).tr.sx).toBe(0);
    expect(boxAt(a, 150).tr).toMatchObject({ sx: 1, sy: 1 });
  });

  it("float, sway, pulse ve shake yalnız pencere içinde oynatır", () => {
    const seed = random("s1-0-");
    const t = 60 / 30;
    const win = { start: 0, end: 0.5 };
    expect(boxAt([{ type: "float", ...win }], 60).tr.y).toBeCloseTo(Math.sin(t * 1.6 + seed * 6) * 12);
    expect(boxAt([{ type: "sway", ...win }], 60).tr.rotate).toBeCloseTo(Math.sin(t * 1.3 + seed * 6) * 3);
    expect(boxAt([{ type: "pulse", ...win }], 60).tr.sx).toBeCloseTo(1 + Math.sin(t * 4) * 0.04);
    const shake = boxAt([{ type: "shake", ...win }], 60).tr;
    expect(shake.x).toBeCloseTo(Math.sin(t * 47) * 8);
    expect(shake.rotate).toBeCloseTo(Math.sin(t * 31) * 1.5);
    for (const type of ["float", "sway", "pulse", "shake"]) {
      expect(boxAt([{ type, ...win }], 240).tr).toEqual({ x: 0, y: 0, rotate: 0, sx: 1, sy: 1 });
    }
  });

  it("spin pencere boyunca tam tur döner", () => {
    expect(boxAt([{ type: "spin" }], 150).tr.rotate).toBeCloseTo(180);
    expect(boxAt([{ type: "spin" }], 300).tr.rotate).toBeCloseTo(360);
  });

  it("karakter jestleri (cheer, surprised) nesneyi zıplatmaz", () => {
    expect(boxAt([{ type: "cheer" }], 150).tr).toEqual({ x: 0, y: 0, rotate: 0, sx: 1, sy: 1 });
    expect(boxAt([{ type: "surprised" }], 10).tr).toEqual({ x: 0, y: 0, rotate: 0, sx: 1, sy: 1 });
  });

  it("move hedefe gider; verilmeyen eksen yerinde kalır", () => {
    expect(boxAt([{ type: "move", toX: 1460 }], 300).tr).toMatchObject({ x: 500, y: 0 });
    expect(boxAt([{ type: "move", toY: 600 }], 300).tr).toMatchObject({ x: 0, y: 100 });
    expect(boxAt([{ type: "move", toX: 1460, toY: 600 }], 150).tr).toMatchObject({ x: 250, y: 50 });
  });

  it("walk hedefe giderken adımla sekter (en çok boyunun %1,2'si), bittikten sonra sekmez", () => {
    const ys = [10, 15, 20, 25, 30].map((f) => boxAt([{ type: "walk", toX: 1460 }], f).tr);
    expect(Math.min(...ys.map((tr) => tr.y))).toBeLessThan(-0.5);
    expect(Math.min(...ys.map((tr) => tr.y))).toBeGreaterThanOrEqual(-200 * 0.012 - 1e-9);
    expect(ys.every((tr) => tr.x > 0)).toBe(true);
    expect(boxAt([{ type: "walk", toX: 1460, start: 0, end: 0.5 }], 200).tr).toMatchObject({ x: 500, y: 0 });
    // Hedefsiz yürüyüş yerinde adım atar, pencere bitince durur.
    expect(boxAt([{ type: "walk", start: 0, end: 0.5 }], 200).tr).toMatchObject({ x: 0, y: 0 });
  });

  it("katmana uygulanmayan animasyon (typewriter) yerleşimi değiştirmez", () => {
    expect(boxAt([{ type: "typewriter" }], 150).tr).toEqual({ x: 0, y: 0, rotate: 0, sx: 1, sy: 1 });
  });

  it("flip yatay ölçeği ters çevirir, rotate eklenir", () => {
    expect(boxAt([], 0, { flip: true, rotate: 12 }).tr).toMatchObject({ rotate: 12, sx: -1, sy: 1 });
  });
});

/** Ön planda ayakta duran karakter. */
const heroShot = (layer: object = {}) => ({ layers: [{ asset: "hero", x: 960, depth: 0, ...layer }] });
const heroAt = (frame: number, layer: object = {}, shotId = "s1") => {
  const c = scene(heroShot(layer), { frame, shotId });
  const css = c.querySelector("style")!.textContent!;
  const get = (part: string) => pose(css, part, `${shotId}-0-`);
  const box = layerBox(c, "body", shotId);
  return { get, box, c };
};

describe("vektör sahne: karakter iskeleti", () => {
  it("bütün iskelet parçaları kendi dönme noktasıyla dönüştürülür", () => {
    const { c } = heroAt(0);
    const css = c.querySelector("style")!.textContent!;
    // Bacaklar yalnız yürürken/otururken poz alır.
    for (const [part, [px, py]] of Object.entries(RIG.pivots).filter(([k]) => !/^(leg|shin)-/.test(k))) {
      expect(css).toContain(`#s1-0-${part}{transform:`);
      expect(css).toContain(`transform-origin:${px}px ${py}px;transform-box:view-box}`);
    }
  });

  it("jestler pencerenin ortasında hedef poza ulaşır", () => {
    const at = (type: string) => {
      const r = heroAt(150, { anims: [{ type }] });
      cleanup();
      return r.get;
    };
    let g = at("wave");
    expect(g("arm-r").rotate).toBeCloseTo(-150, 1);
    expect(g("brows").ty).toBeCloseTo(-4, 1);
    g = at("point");
    // Hedef yoksa öne-yana yatay (omuz hizasında).
    expect([g("arm-r").rotate, g("forearm-r").rotate, g("head").rotate, g("eyes").tx]).toEqual([-90, -6, -4, 5]);
    // "s6" tohumunda çene duruşu.
    g = heroAt(150, { anims: [{ type: "think" }] }, "s6").get;
    cleanup();
    // El çizimin çenesinin altına (yüzü ölçülemeyen test kuklasında varsayılan çene), çene hattının biraz el tarafına.
    // Üst kol kameraya uzanarak kısalır (ön kol bu ölçeği dirsekte geri alır), dirsek elin altında göğsün önünde.
    const upper = ARM.upper * g("arm-r").sy;
    expect(g("arm-r").sy).toBeLessThan(0.9);
    expect(g("arm-r").sy).toBeGreaterThanOrEqual(THINK.min);
    expect(g("forearm-r").undo![1]).toBeCloseTo(1 / g("arm-r").sy, 2);
    const [hx, hy] = tip(RIG.pivots["arm-r"], upper, ARM.reach, g("arm-r").rotate, g("forearm-r").rotate);
    expect(hx).toBeCloseTo(200 + 26 * THINK.x, 0);
    expect(hy).toBeCloseTo(242 + THINK.y, 0);
    const elbow = tip(RIG.pivots["arm-r"], upper, 0, g("arm-r").rotate, 0);
    // Ön kol dikeyden THINK.lean kadar dışa yatık (dirsek elin altında, biraz dışında).
    expect((Math.atan2(elbow[0] - hx, elbow[1] - hy) * 180) / Math.PI).toBeCloseTo(THINK.lean, 0);
    // Öbür el bu kolun dirseğini alttan tutar.
    const [lx, ly] = tip(RIG.pivots["arm-l"], ARM.upper, ARM.reach, g("arm-l").rotate, g("forearm-l").rotate);
    expect(lx).toBeCloseTo(elbow[0], 0);
    expect(ly).toBeCloseTo(elbow[1] + THINK.support, 0);
    // Destek kolu kısalmaz.
    expect(g("forearm-l").undo).toBeUndefined();
    expect([g("head").rotate, g("eyes").tx]).toEqual([7, 5]);
    g = at("cheer");
    expect([g("forearm-l").rotate, g("forearm-r").rotate, g("brows").ty, g("mouth").sy]).toEqual([-15, 15, -8, 1.5]);
    g = at("surprised");
    // Şaşkın ağız küçük, dar bir "o": büyük gülümseme sevinç gibi okunuyordu.
    // İrkilme: sağ el göğüste (kısalan ön kol), sol el aşağıda yana açık.
    expect([g("arm-l").rotate, g("forearm-l").rotate, g("forearm-r").rotate, g("forearm-r").sy, g("eyes").sy, g("mouth").sy, g("mouth").sx]).toEqual([22, 38, 134, 0.55, 1.25, 0.3, 0.6]);
    g = at("shrug");
    expect([g("arm-l").rotate, g("arm-l").ty, g("forearm-l").rotate, g("forearm-r").rotate, g("head").rotate]).toEqual([16, -7, 62, -62, -6]);
    const t = 5;
    g = at("explain");
    // Tek başına: baskın el sağdaki; öbür el kalça hizasında küçük eşlik.
    expect(g("forearm-r").rotate).toBeCloseTo(-(60 + Math.sin(t * 3.4) * 12), 1);
    expect(g("forearm-l").rotate).toBeCloseTo(28 + Math.sin(t * 3 + 1) * 8, 1);
    expect(g("brows").ty).toBeCloseTo(-3 + Math.sin(t * 3) * 2, 1);
    // Yerinde yürüyüş (hedefsiz): adımlar rahat tempoda; kalkan bacağın uyluğu kısalır, baldır boyunu korur.
    g = at("walk");
    const s = Math.sin(Math.PI * ((t * 1.3) / 0.7));
    const lift = (k: number) => 1 - 0.3 * Math.max(0, k);
    expect(g("leg-l").sy).toBeCloseTo(lift(s), 2);
    expect(g("leg-r").sy).toBeCloseTo(lift(-s), 2);
    expect(g("shin-l").sy).toBeCloseTo(1 / lift(s), 2);
    // Yer değiştirmeden yürürken yön yok: bacak yana açılmaz.
    expect(g("leg-l").rotate).toBeCloseTo(0, 5);
  });

  it("iş jestleri: klavye, yazı, okuma, gösterme, alkış, eller belde, kollar kavuşuk", () => {
    const at = (type: string) => {
      const r = heroAt(150, { anims: [{ type }] });
      cleanup();
      return r.get;
    };
    const t = 5;
    let g = at("typing");
    // Eller gövdenin önünde yan yana; ön kol kameraya uzandığı için kısalır; parmaklar sırayla iner.
    expect([g("arm-l").rotate, g("arm-r").rotate, g("forearm-l").rotate, g("forearm-r").rotate, g("forearm-r").sy]).toEqual([-8, 8, -47, 47, 0.5]);
    expect(g("hand-l").rotate).toBeCloseTo(-6 + 10 * typingTaps(t)[0], 1);
    expect(g("hand-r").rotate).toBeCloseTo(6 - 10 * typingTaps(t)[1], 1);
    g = at("writing");
    expect(g("forearm-r").rotate).toBeCloseTo(42 + Math.sin(t * 17) * 5 * penDown(t), 1);
    expect([g("forearm-l").rotate, g("forearm-l").sy, g("head").ty]).toEqual([-34, 0.55, 5]);
    g = at("reading");
    expect([g("arm-l").rotate, g("forearm-l").rotate, g("forearm-r").rotate, g("eyes").sy]).toEqual([10, -104, 104, 0.85]);
    expect(g("eyes").tx).toBeCloseTo(Math.sin(t * 2.4) * 4, 1);
    g = at("show");
    expect(g("arm-r").rotate).toBeCloseTo(-132 + Math.sin(t * 2) * 3, 1);
    expect([g("forearm-r").rotate, g("brows").ty, g("mouth").sy]).toEqual([-12, -6, 1.3]);
    g = at("clap");
    expect(g("forearm-r").rotate).toBeCloseTo(121 + 32 * (1 - clapClosed(t)), 1);
    expect(g("forearm-l").rotate).toBeCloseTo(-(121 + 32 * (1 - clapClosed(t))), 1);
    expect([g("arm-l").rotate, g("arm-r").rotate]).toEqual([25, -25]);
    g = at("hands_on_hips");
    expect([g("arm-l").rotate, g("arm-r").rotate, g("forearm-l").rotate, g("forearm-r").rotate]).toEqual([30, -30, -65, 65]);
    g = at("arms_crossed");
    expect([g("arm-l").rotate, g("arm-r").rotate, g("forearm-l").rotate, g("forearm-r").rotate, g("hand-l").rotate, g("brows").ty]).toEqual([-6, 6, -90, 84, -50, 3]);
  });

  it("düşünen el: parmak uçları ağzın altında kalır (uzun elde el aşağı iner), kol çizimde başın önüne alınır", () => {
    // "s6" tohumunda çene duruşu.
    const thinkAt = (layers: object[], frame = 150) => {
      const c = scene({ layers }, { frame, shotId: "s6" });
      const html = c.innerHTML;
      const r = { g: (p: string) => pose(c, p, "s6-0-"), order: (p: string) => html.indexOf(`id="s6-0-${p}"`) };
      return r;
    };
    const f = faceFor(ASSETS.thinker);
    // Parmaklar değme noktasından 68 px öteye uzanıyor: sınır 60.
    expect(f.fingers).toEqual({ l: 60, r: 60 });
    expect(f.lips).toBeCloseTo(210, 0);
    const { g, order } = thinkAt([{ asset: "thinker", x: 960, depth: 0, anims: [{ type: "think" }] }]);
    const [hx, hy] = tip(RIG.pivots["arm-r"], ARM.upper * g("arm-r").sy, ARM.reach, g("arm-r").rotate, g("forearm-r").rotate);
    expect(hx).toBeCloseTo(f.chin[0] + f.jaw * THINK.x, 0);
    expect(hy).toBeCloseTo(f.lips! + THINK.gap + 60, 0);
    expect(hy).toBeGreaterThan(f.chin[1] + THINK.y);
    expect(order("arm-r")).toBeGreaterThan(order("head"));
    expect(order("arm-l")).toBeLessThan(order("head"));
    cleanup();
    // Sağ eli nesne tutarken sol el düşünür: sol kol başın önüne alınır.
    const held = thinkAt([
      { asset: "thinker", x: 960, depth: 0, anims: [{ type: "think" }] },
      { asset: "cup", x: 0, heldBy: 0 },
    ]);
    expect(held.order("arm-l")).toBeGreaterThan(held.order("head"));
    expect(held.order("arm-r")).toBeLessThan(held.order("head"));
    cleanup();
    // Düşünmeyen karakterin çizimine dokunulmaz.
    const still = thinkAt([{ asset: "thinker", x: 960, depth: 0 }]);
    expect(still.order("arm-r")).toBeLessThan(still.order("head"));
  });

  it("armInFront: kol başla aynı ebeveynde değilse ya da zaten sonraysa çizim aynen kalır", () => {
    const g = (id: string, inner = "") => `<g id="p-${id}">${inner}</g>`;
    expect(armInFront(`<svg>${g("arm-r", g("forearm-r"))}<g id="x"/>${g("head")}</svg>`, "p-", "arm-r")).toBe(`<svg><g id="x"/>${g("head")}${g("arm-r", g("forearm-r"))}</svg>`);
    for (const svg of [`<svg>${g("head")}${g("arm-r")}</svg>`, `<svg><g>${g("arm-r")}</g>${g("head")}</svg>`, `<svg>${g("arm-r")}</svg>`, `<svg>${g("head")}</svg>`])
      expect(armInFront(svg, "p-", "arm-r")).toBe(svg);
  });

  it("jest yüzü: ölçülen çene makul bölgedeyse kullanılır, değilse varsayılan; çene hattı yüz genişliğinden (26–42 px)", () => {
    const rest = { l: 22, r: 22 };
    const box = { x: 122, y: 96, w: 156, h: 160 };
    expect(fitFace({})).toEqual({ chin: [200, 242], jaw: 33.6, fingers: rest, head: box });
    expect(fitFace({ chin: [210, 250], head: { x: 0, y: 0, w: 200, h: 10 } })).toEqual({ chin: [210, 250], jaw: 42, fingers: rest, head: box });
    // Ağzın alt kenarı (çenenin üstündeyse ve çene makulse); parmaklar ölçülen kol ucundan, sınırlı.
    const lipsOf = (mouth: { x: number; y: number; w: number; h: number }, chin: [number, number]) => fitFace({ mouth, chin }).lips;
    expect(lipsOf({ x: 180, y: 200, w: 40, h: 10 }, [200, 240])).toBe(210);
    expect(lipsOf({ x: 180, y: 200, w: 40, h: 10 }, [200, 205])).toBeUndefined();
    expect(lipsOf({ x: 180, y: 200, w: 40, h: 10 }, [200, 400])).toBeUndefined();
    expect(fitFace({ hands: { l: 530, r: 700 } }).fingers).toEqual({ l: 18, r: 60 });
    expect(fitFace({ hands: { r: 400 } }).fingers).toEqual({ l: 22, r: 8 });
    expect(fitFace({ chin: [210, 250], head: { x: 0, y: 0, w: 50, h: 10 } }).jaw).toBe(26);
    for (const chin of [[100, 250], [300, 250], [200, 100], [200, 400]] as [number, number][]) expect(fitFace({ chin }).chin).toEqual([200, 242]);
    // Konuşan ağız: başın içinde ve ondan küçükse; çeneye kadar açılabilir, çizgi rengi yoksa koyu kahve.
    const mouth = { x: 180, y: 210, w: 40, h: 10 };
    const frame: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
    const head = { x: 120, y: 90, w: 160, h: 160 };
    expect(fitFace({ mouth, mouthFrame: frame, head, chin: [200, 250], mouthInk: "#111" }).mouth).toEqual({ box: mouth, frame, ink: "#111", drop: 32 });
    expect(fitFace({ mouth, mouthFrame: frame }).mouth).toEqual({ box: mouth, frame, ink: "#2b1d1d", drop: 24 });
    expect(fitFace({ mouth, mouthFrame: frame, chin: [200, 400] }).mouth!.drop).toBe(24);
    expect(fitFace({ mouth, mouthFrame: frame, chin: [200, 216], head: { x: 0, y: 0, w: 400, h: 400 } }).mouth!.drop).toBe(6);
    expect(fitFace({ mouth }).mouth).toBeUndefined();
    for (const m of [
      { x: 0, y: 210, w: 40, h: 10 },
      { x: 300, y: 210, w: 40, h: 10 },
      { x: 180, y: 0, w: 40, h: 10 },
      { x: 180, y: 300, w: 40, h: 10 },
      { x: 150, y: 210, w: 100, h: 10 },
      { x: 180, y: 150, w: 40, h: 70 },
    ])
      expect(fitFace({ mouth: m, mouthFrame: frame, head }).mouth).toBeUndefined();
    expect(fitFace({ mouth: { x: 100, y: 200, w: 120, h: 10 }, mouthFrame: frame }).mouth).toBeUndefined();
    expect(fitFace({ mouth: { x: 180, y: 200, w: 40, h: 80 }, mouthFrame: frame }).mouth).toBeUndefined();
    // Varlık başına bir kez ölçülür; 3D figürün yüzü sabit (SVG yedeği figürle aynı değil).
    expect(faceFor(ASSETS.hero)).toBe(faceFor(ASSETS.hero));
    expect(faceFor(ASSETS.toy)).toEqual({ chin: [200, 242], jaw: 33.6, fingers: rest, head: box });
    // Baş kutusu: ölçülen baş makulse (boyu sınırlar içinde, çeneyi yatayda kapsar, çenenin üstünde başlar) o kullanılır.
    const measured = { x: 110, y: 60, w: 180, h: 200 };
    expect(fitFace({ chin: [200, 250], head: measured }).head).toEqual(measured);
    for (const bad of [
      { x: 110, y: 60, w: 50, h: 200 },
      { x: 110, y: 60, w: 180, h: 50 },
      { x: 0, y: 60, w: 300, h: 200 },
      { x: 110, y: 0, w: 180, h: 320 },
      { x: 210, y: 60, w: 180, h: 200 },
      { x: 10, y: 60, w: 180, h: 200 },
      { x: 110, y: 260, w: 180, h: 200 },
    ])
      expect(fitFace({ chin: [200, 250], head: bad }).head).toEqual(box);
    // Çene makul değilse baş da varsayılan.
    expect(fitFace({ chin: [200, 400], head: measured }).head).toEqual(box);
  });

  it("düşünme duruşu çekim başına seçilir: çene, başını kaşıma, kollar kavuşuk; elde nesneyle kollar kavuşmaz", () => {
    const count = (holding: boolean) => {
      const n = { chin: 0, scratch: 0, ponder: 0 };
      for (let i = 0; i < 400; i++) n[thinkPoseOf(`sh${i}-0-`, holding)]++;
      return n;
    };
    const free = count(false);
    for (const [k, share] of [
      ["chin", 0.4],
      ["scratch", 0.3],
      ["ponder", 0.3],
    ] as const)
      expect(Math.abs(free[k] / 400 - share)).toBeLessThan(0.08);
    const held = count(true);
    expect(held.ponder).toBe(0);
    expect(Math.abs(held.chin / 400 - 0.55)).toBeLessThan(0.08);
    // Aynı tohum hep aynı duruş; varsayılan: elde nesne yok.
    expect(thinkPoseOf("s1-0-")).toBe(thinkPoseOf("s1-0-", false));
    expect([thinkPoseOf("s6-0-"), thinkPoseOf("s1-0-"), thinkPoseOf("s2-0-"), thinkPoseOf("s1-0-", true)]).toEqual(["chin", "scratch", "ponder", "scratch"]);
  });

  it("başını kaşıma: el başın yanına (üst üçte bir) gider, dirsek dışa açılır, bilek aralıklı gidip gelir; kol başın arkasında kalır", () => {
    const box = fitFace({}).head;
    const handAt = (g: (p: string) => { rotate: number; sy: number }, side: "l" | "r") =>
      tip(RIG.pivots[`arm-${side}`], ARM.upper * g(`arm-${side}`).sy, ARM.reach, g(`arm-${side}`).rotate, g(`forearm-${side}`).rotate);
    // "s1" tohumunda kaşıma. Kaşıma dalgasının dışında (sin(t·burst) ≤ 0) bilek durgun: el tam hedefte.
    const period = (2 * Math.PI) / SCRATCH.burst;
    const frame = Math.round(period * 30 * 0.75);
    const r = heroAt(frame, { anims: [{ type: "think", start: 0, end: 1 }] }, "s1");
    cleanup();
    const [hx, hy] = handAt(r.get, "r");
    expect(hx).toBeCloseTo(box.x + box.w * (0.5 + SCRATCH.x / 2), 0);
    expect(hy).toBeCloseTo(box.y + box.h * SCRATCH.y, 0);
    expect(r.get("hand-r").rotate).toBeCloseTo(-SCRATCH.curl, 1);
    // Dirsek omzun dışında (yüzün önünden geçmez); üst kol kısalmaz.
    const elbow = tip(RIG.pivots["arm-r"], ARM.upper, 0, r.get("arm-r").rotate, 0);
    expect(elbow[0]).toBeGreaterThan(RIG.pivots["arm-r"][0] + 40);
    expect(r.get("forearm-r").undo).toBeUndefined();
    expect([r.get("eyes").tx, r.get("eyes").ty, r.get("brows").ty, r.get("mouth").sx]).toEqual([-4, -3, -6, 0.8]);
    // Kaşırken bilek gidip gelir.
    const wrists = [0, 1, 2, 3].map((k) => {
      const g = heroAt(Math.round(period * 30 * 1.25) + k, { anims: [{ type: "think", start: 0, end: 1 }] }, "s1").get;
      cleanup();
      return g("hand-r").rotate;
    });
    expect(Math.max(...wrists) - Math.min(...wrists)).toBeGreaterThan(SCRATCH.rub);
    // Ölçülen başın yanına gider; kol çizimde başın arkasında kalır (öne alınmaz).
    const c = scene({ layers: [{ asset: "thinker", x: 960, depth: 0, anims: [{ type: "think", start: 0, end: 1 }] }] }, { frame });
    const head = faceFor(ASSETS.thinker).head;
    const [mx, my] = handAt((p) => pose(c, p), "r");
    expect(mx).toBeCloseTo(head.x + head.w * (0.5 + SCRATCH.x / 2), 0);
    expect(my).toBeCloseTo(head.y + head.h * SCRATCH.y, 0);
    expect(c.innerHTML.indexOf('id="s1-0-arm-r"')).toBeLessThan(c.innerHTML.indexOf('id="s1-0-head"'));
    cleanup();
    // Sağ eli nesne tutarken sol el başın sol yanını kaşır, dirsek sola açılır; sağ el tutuşta kalır.
    const h = scene({ layers: [{ asset: "hero", x: 960, depth: 0, anims: [{ type: "think", start: 0, end: 1 }] }, { asset: "cup", x: 0, heldBy: 0 }] }, { frame });
    const [lx, ly] = handAt((p) => pose(h, p), "l");
    expect(lx).toBeCloseTo(box.x + box.w * (0.5 - SCRATCH.x / 2), 0);
    expect(ly).toBeCloseTo(box.y + box.h * SCRATCH.y, 0);
    expect(tip(RIG.pivots["arm-l"], ARM.upper, 0, pose(h, "arm-l").rotate, 0)[0]).toBeLessThan(RIG.pivots["arm-l"][0] - 40);
    expect(pose(h, "forearm-r").rotate).toBeCloseTo(-HOLD_POSE.forearm, -1);
  });

  it("kollar kavuşuk düşünme: arms_crossed kolları, baş yatık ve kalkık, gözler yukarıda bir yanda", () => {
    // "s2" tohumunda kollar kavuşuk.
    const g = heroAt(150, { anims: [{ type: "think" }] }, "s2").get;
    cleanup();
    const crossed = heroAt(150, { anims: [{ type: "arms_crossed" }] }, "s2").get;
    cleanup();
    for (const part of ["arm-l", "arm-r", "forearm-l", "forearm-r", "hand-l", "hand-r"]) expect(g(part)).toEqual(crossed(part));
    expect(g("head").ty).toBeCloseTo(-2, 0);
    expect([g("eyes").ty, g("brows").ty, g("mouth").sx]).toEqual([-4, -5, 0.85]);
    expect(Math.abs(g("head").rotate)).toBeGreaterThan(4);
    expect(Math.abs(g("eyes").tx)).toBe(5);
    // Baş, gözlerin baktığı yana yatar; bakış yanı çekime göre değişir.
    expect(Math.sign(g("head").rotate)).toBe(Math.sign(g("eyes").tx));
    const sides = new Set<number>();
    for (const shot of ["s2", "g5"]) {
      const h = heroAt(150, { anims: [{ type: "think" }] }, shot).get;
      cleanup();
      expect(Math.sign(h("head").rotate)).toBe(Math.sign(h("eyes").tx));
      sides.add(Math.sign(h("eyes").tx));
    }
    expect([...sides].sort()).toEqual([-1, 1]);
  });

  it("yürüyüşte adımlar alınan yoldan gelir: yol iki katına çıkınca adım sayısı da iki katına çıkar", () => {
    // Bir bacağın kalkıp indiği her geçiş bir adımdır; geçişleri sayarız. Bir adım ~30 kare, bacak yarısında havada:
    // 3 karede bir bakmak her kalkışı yakalar (her kare 600 sahne render ediyordu, yüklü makinede 30 sn'yi aşıyordu).
    const stepsTo = (toX: number) => {
      let steps = 0;
      let prev = 0;
      for (let f = 0; f <= 300; f += 3) {
        const { get, c: root } = heroAt(f, { anims: [{ type: "walk", toX }] });
        const css = root.querySelector("style")!.textContent!;
        const sy = (part: string) => (css.includes(`s1-0-${part}{`) ? get(part).sy : 1);
        const lifted = sy("leg-l") < 0.97 ? 1 : sy("leg-r") < 0.97 ? 2 : 0;
        if (lifted && lifted !== prev) steps++;
        if (lifted) prev = lifted;
        cleanup();
      }
      return steps;
    };
    const short = stepsTo(960 + 280 * 4); // 4 adımlık yol (0,7 m × 400 px)
    const long = stepsTo(960 - 280 * 8); // 8 adım, sola
    expect(short).toBeGreaterThanOrEqual(3);
    expect(short).toBeLessThanOrEqual(5);
    expect(long).toBeGreaterThanOrEqual(7);
    expect(long).toBeLessThanOrEqual(9);
  });

  it("yürürken gövde gidiş yönüne eğilir, durunca bacaklar iner ve poz almaz", () => {
    const right = transformOf(heroAt(20, { anims: [{ type: "walk", toX: 1500 }] }).box).rotate;
    cleanup();
    const left = transformOf(heroAt(20, { anims: [{ type: "walk", toX: 400 }] }).box).rotate;
    cleanup();
    expect(right).toBeGreaterThan(1.5);
    expect(left).toBeLessThan(-1.5);
    // Kalkan bacak gidiş yönüne açılır; aynalanan çizimde dönüş ters verilir ki ekranda yine gidiş yönüne açılsın.
    // Duruşun bacak eğimi (en çok STANCE.out = 4°) adımın açılmasından (7°) küçüktür: en büyük eğim adımdandır.
    const legTilt = (flip: boolean) => {
      let tilt = 0;
      for (let f = 3; f < 90; f += 3) {
        const { get } = heroAt(f, { anims: [{ type: "walk", toX: 1500 }], flip });
        for (const v of [get("leg-l").rotate, get("leg-r").rotate]) if (Math.abs(v) > Math.abs(tilt)) tilt = v;
        cleanup();
      }
      return tilt;
    };
    expect(legTilt(false)).toBeGreaterThan(0);
    expect(legTilt(true)).toBeLessThan(0);
    // Varınca (pencere sonu) adım biter: bacaklar kalkmaz (uyluk boyu tam), yalnız duruştaki kadar eğik.
    const { get } = heroAt(300, { anims: [{ type: "walk", toX: 1500, end: 0.6 }] });
    for (const leg of ["leg-l", "leg-r"]) {
      expect(get(leg).sy).toBe(1);
      expect(Math.abs(get(leg).rotate)).toBeLessThanOrEqual(STANCE.out);
    }
  });

  it("slide_in ve move ile gelen karakter de yürür (kaymaz)", () => {
    for (const anim of [{ type: "slide_in", from: "right", end: 0.6 }, { type: "move", toX: 1500 }]) {
      const css = heroAt(20, { anims: [anim] }).c.querySelector("style")!.textContent!;
      expect(css).toContain("s1-0-leg-l{");
      cleanup();
    }
  });

  it("surprised karakteri pencere başında bir kez zıplatır ve yere indirir", () => {
    const y = (frame: number) => {
      const r = transformOf(heroAt(frame, { anims: [{ type: "surprised", start: 0.5, end: 1 }] }).box).y;
      cleanup();
      return r;
    };
    // 10 sn'lik çekimde pencere 150. karede başlar; sıçrayış 0,45 sn (~13 kare) sürer.
    expect(y(149)).toBe(0);
    expect(y(157)).toBeLessThan(-10);
    expect(y(170)).toBe(0);
    expect(y(250)).toBe(0);
  });

  it("karakter cheer ile zıplar", () => {
    const t = 150 / 30;
    const tr = transformOf(heroAt(150, { anims: [{ type: "cheer" }] }).box);
    expect(tr.y).toBeCloseTo(-Math.abs(Math.sin(t * 6)) * 18, 1);
    cleanup();
    // Pencereden önce zıplamaz.
    expect(transformOf(heroAt(30, { anims: [{ type: "cheer", start: 0.5 }] }).box).y).toBe(0);
  });

  it("nod: baş öne iner kalkar, gözler ve kaşlar başın içinde biraz daha iner; yana sallanmaz", () => {
    // Kare 144 = 4,8 sn: sin(4,8 × 7) > 0 (iniş).
    const still = heroAt(144).get;
    cleanup();
    const nod = heroAt(144, { anims: [{ type: "nod" }] }).get;
    const down = Math.sin(4.8 * 7);
    expect(nod("head").ty - still("head").ty).toBeCloseTo(4 * down, 1);
    expect(nod("eyes").ty - still("eyes").ty).toBeCloseTo(2 * down, 1);
    expect(nod("brows").ty - still("brows").ty).toBeCloseTo(2 * down, 1);
    expect(nod("head").rotate).toBeCloseTo(still("head").rotate, 5);
    cleanup();
    // Kalkışta (sin < 0) baş yerinde.
    expect(heroAt(150, { anims: [{ type: "nod" }] }).get("head").ty).toBeCloseTo(heroAt(150).get("head").ty, 5);
  });

  it("shake_head: baş iki yana döner, yüz özellikleri başın içinde aynı yöne kayar, kaşlar çatılır", () => {
    const still = heroAt(150).get;
    cleanup();
    const no = heroAt(150, { anims: [{ type: "shake_head" }] }).get;
    const turn = Math.sin(5 * 13);
    expect(no("head").tx - still("head").tx).toBeCloseTo(3 * turn, 1);
    expect(no("head").rotate - still("head").rotate).toBeCloseTo(1.5 * turn, 1);
    expect(no("eyes").tx - still("eyes").tx).toBeCloseTo(4 * turn, 1);
    expect(no("brows").tx - still("brows").tx).toBeCloseTo(3 * turn, 1);
    expect(no("mouth").tx - still("mouth").tx).toBeCloseTo(3 * turn, 1);
    expect(no("brows").ty).toBeCloseTo(2, 1);
  });

  it("talk ağzı açıp kapar; somurtan yüzde ağız ters kalır (kelime zamanı yoksa sabit ritim)", () => {
    const want = 0.35 + Math.abs(Math.sin(5 * 13)) * 0.9;
    expect(heroAt(150, { anims: [{ type: "talk" }] }).get("mouth").sy).toBeCloseTo(want, 2);
    cleanup();
    expect(heroAt(150, { anims: [{ type: "talk" }], expression: "sad" }).get("mouth").sy).toBeCloseTo(-want, 2);
  });

  it("ağzı ölçülemeyen çizimde anlatımın sesine göre ağız ölçeklenir: A çok açık, U dar, sessizlikte kapalı", () => {
    // Kare 150 = 5000 ms.
    const talk = (speech: { text: string; startMs: number; endMs: number }[], layer: object = {}) => {
      const c = scene(heroShot({ anims: [{ type: "talk" }], ...layer }), { frame: 150, speech });
      const { sx, sy } = pose(c, "mouth");
      cleanup();
      return [sx, sy];
    };
    expect(talk([{ text: "aaa", startMs: 4900, endMs: 5300 }])).toEqual([1.05, 1.25]);
    expect(talk([{ text: "uuu", startMs: 4900, endMs: 5300 }])).toEqual([0.55, 0.75]);
    expect(talk([{ text: "bir", startMs: 4000, endMs: 4500 }, { text: "iki", startMs: 5500, endMs: 6000 }])).toEqual([1, 0.35]);
    // Somurtan yüzde eğri ters kalır; şaşkın yüzün dar ağzı konuşurken şekle bırakılır.
    expect(talk([{ text: "aaa", startMs: 4900, endMs: 5300 }], { expression: "sad" })).toEqual([1.05, -1.25]);
    expect(talk([{ text: "aaa", startMs: 4900, endMs: 5300 }], { expression: "surprised" })).toEqual([1.05, 1.25]);
  });

  it("ölçülen ağız konuşurken gizlenir, yerine o anın şekli koddan çizilir; sessizlikte çizimin ağzı görünür", () => {
    const talker = (speech: { text: string; startMs: number; endMs: number }[], layer: object = { anims: [{ type: "talk" }] }) => {
      const c = scene({ layers: [{ asset: "talker", x: 960, depth: 0, ...layer }] }, { frame: 150, speech });
      const css = c.querySelector("style")!.textContent!;
      const out = { css, mouth: pose(css, "mouth"), shapes: [...c.querySelectorAll("[id^='s1-0-viseme-']")].map((g) => `${g.id}:${g.getAttribute("display")}`) };
      cleanup();
      return out;
    };
    const aaa = talker([{ text: "aaa", startMs: 4900, endMs: 5300 }]);
    expect(aaa.css).toContain("#s1-0-mouth{visibility:hidden}#s1-0-viseme-D{display:inline}");
    // Bütün şekiller bir kez, gizli konur (CSS seçer); çizimin ağzı ölçeklenmez.
    expect(aaa.shapes).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"].map((v) => `s1-0-viseme-${v}:none`));
    expect([aaa.mouth.sx, aaa.mouth.sy]).toEqual([1, 1]);
    const silent = talker([{ text: "aaa", startMs: 6000, endMs: 6400 }]);
    expect(silent.css).not.toContain("visibility:hidden");
    expect(silent.shapes).toHaveLength(8);
    // Konuşmayan karaktere şekil konmaz.
    expect(talker([{ text: "aaa", startMs: 4900, endMs: 5300 }], {}).shapes).toEqual([]);
    // Konuşma penceresi dışında (yarıdan az girmiş) çizimin ağzı.
    expect(talker([{ text: "aaa", startMs: 4900, endMs: 5300 }], { anims: [{ type: "talk", start: 0.6, end: 0.9 }] }).css).not.toContain("visibility:hidden");
  });

  it("konuşan ağız: tersinmez ebeveynde çizimin ağzı kalır; 3D figürde ve yürürken yan çizimde şekil konmaz", () => {
    const speech = [{ text: "aaa", startMs: 4900, endMs: 5300 }];
    let c = scene({ layers: [{ asset: "flat", x: 960, depth: 0, anims: [{ type: "talk" }] }] }, { frame: 150, speech });
    expect(c.querySelector("style")!.textContent).not.toContain("visibility:hidden");
    expect(c.querySelector("[id^='s1-0-viseme-']")).toBeNull();
    cleanup();
    c = scene({ layers: [{ asset: "toy", x: 960, depth: 0, anims: [{ type: "talk" }] }] }, { frame: 150, speech });
    expect(c.querySelector("[id^='s1-0-viseme-']")).toBeNull();
    expect([pose(c, "mouth").sx, pose(c, "mouth").sy]).toEqual([1.05, 1.25]);
    cleanup();
  });

  it("konuşurken baş vurguda iner, öbek başında kaşlar kalkar, el vurgulu kelimede en uçta; vurgu yokken el inik", () => {
    // Kare 150 = 5000 ms. "merhaba" 5000'de başlar: öbek başı (güç 1). Uzak konuşmada bu anda vurgu yok.
    const at = (startMs: number, anims: object[] = [{ type: "talk" }]) => {
      const c = scene(heroShot({ anims }), { frame: 150, speech: [{ text: "merhaba", startMs, endMs: startMs + 600 }] });
      const css = c.querySelector("style")!.textContent!;
      cleanup();
      return (part: string) => pose(css, part);
    };
    const beat = at(5000);
    const calm = at(9000);
    const nod = Math.sin((Math.PI * 80) / 380);
    const brow = Math.sin((Math.PI * 80) / 650);
    expect(beat("head").ty - calm("head").ty).toBeCloseTo(nod * 3.5, 1);
    // Kaş öbek başında kalkar; el vurgusu da kaşı 3 px kaldırır.
    expect(beat("brows").ty - calm("brows").ty).toBeCloseTo(-brow * 3.5 - 3, 1);
    expect(beat("head").rotate).toBeCloseTo(calm("head").rotate, 5);
    // Kelime başında el vurgusu tutuluyor: bir kol 62°(+titreme) dışa açık; vurgu yokken kendiliğinden jest yapılmaz.
    const lift = (g: (p: string) => { rotate: number }) => Math.max(Math.abs(g("forearm-r").rotate - calm("forearm-r").rotate), Math.abs(g("forearm-l").rotate - calm("forearm-l").rotate));
    expect(lift(beat)).toBeCloseTo(62 + Math.sin(5 * 5) * 6, 1);
    const still = heroAt(150).get;
    expect(calm("forearm-r").rotate).toBeCloseTo(still("forearm-r").rotate, 5);
    cleanup();
    // Anlatırken baskın el vurgulu kelimede aşağı vurur, arada kalkık durur.
    const explain = [{ type: "explain" }, { type: "talk" }];
    expect(at(5000, explain)("forearm-r").rotate).toBeCloseTo(-(60 + (0.5 - 1.5 * nod) * 12), 1);
    expect(at(9000, explain)("forearm-r").rotate).toBeCloseTo(-(60 + 0.5 * 12), 1);
  });

  it("bilek: boşta ön kolu izler, el sallarken kıvrılır, anlatırken avuç dışa döner, nesne tutan el düz kalır", () => {
    const idle = heroAt(150).get("hand-r").rotate;
    cleanup();
    expect(idle).toBeLessThan(0);
    const waves = [150, 153, 156].map((f) => {
      const r = heroAt(f, { anims: [{ type: "wave" }] }).get("hand-r").rotate;
      cleanup();
      return r;
    });
    expect(Math.max(...waves) - Math.min(...waves)).toBeGreaterThan(10);
    expect(heroAt(150, { anims: [{ type: "explain" }] }).get("hand-r").rotate).toBeLessThan(-10);
    cleanup();
    // Düşünürken parmaklar çeneye doğru döner (ön kolun devamından hafifçe dışa).
    expect(heroAt(150, { anims: [{ type: "think" }] }, "s6").get("hand-r").rotate).toBe(-5);
    cleanup();
    const c = scene({ layers: [{ asset: "hero", x: 960, depth: 0.3 }, { asset: "cup", x: 960, heldBy: 0 }] }, { frame: 150 });
    expect(pose(c, "hand-r").rotate).toBe(0);
  });


  it("jest girerken ön kol üst kolu geriden izler", () => {
    // Pencere 5. sn'de (kare 150) başlar; 2 kare sonra üst kol kalkmaya başlamış, ön kol (0,08 sn gecikme) henüz değil.
    const rest = heroAt(152).get;
    cleanup();
    const g = heroAt(152, { anims: [{ type: "shrug", start: 0.5, end: 1 }] }).get;
    expect(g("arm-l").rotate).not.toBeCloseTo(rest("arm-l").rotate, 2);
    expect(g("forearm-l").rotate).toBeCloseTo(rest("forearm-l").rotate, 2);
  });

  it("pencere dışındaki jest pozu değiştirmez", () => {
    const { get } = heroAt(30, { anims: [{ type: "wave", start: 0.5, end: 1 }] });
    expect(get("arm-r").rotate).toBeGreaterThan(-30);
  });

  it("yüz ifadesi kaş, ağız ve bakışı ayarlar", () => {
    // Kare 0'da kendiliğinden jest/kırpma olabilir; ağız yalnız ifadeye bağlı.
    const mouth = (expression?: string) => {
      const r = heroAt(0, expression ? { expression } : {}).get;
      cleanup();
      return r("mouth").sy;
    };
    expect(mouth()).toBe(1);
    // Şaşkınlık: küçük, dar ağız (gülümseme değil).
    const surprised = heroAt(0, { expression: "surprised" }).get("mouth");
    cleanup();
    expect([surprised.sy, surprised.sx]).toEqual([0.3, 0.6]);
    expect(mouth("happy")).toBe(1.35);
    expect(mouth("sad")).toBe(-0.8);
    expect(mouth("angry")).toBe(-0.45);
    expect(heroAt(0, { expression: "thinking" }).get("eyes").tx).toBe(6);
  });

  it("göz kırpar ve ara ara iki koluyla da kendiliğinden anlatır", () => {
    let blinks = 0;
    let right = 0;
    let left = 0;
    // "g5" tohumunda dinlenme pozu serbest; ilk 6 sn'de bir kırpma, bir sol ve bir sağ kol jesti var.
    for (let f = 0; f < 180; f += 2) {
      const { get } = heroAt(f, {}, "g5");
      if (get("eyes").sy === 0.1) blinks++;
      // Doğal duruşta ön kol ±13° (hafif içe); jestte el dışa açılır: sağdaki ön kol eksiye, soldaki artıya.
      if (get("forearm-r").rotate < -30) right++;
      if (get("forearm-l").rotate > 30) left++;
      cleanup();
    }
    expect(blinks).toBeGreaterThan(0);
    expect(blinks).toBeLessThan(10); // kırpma kısa sürer
    expect(right).toBeGreaterThan(0);
    expect(left).toBeGreaterThan(0);
  });

  it("kolu meşgul eden jest sürerken kendiliğinden el hareketi yapılmaz", () => {
    for (let f = 0; f < 300; f += 3) {
      const { get } = heroAt(f, { anims: [{ type: "nod" }, { type: "think", start: 0, end: 1 }] }, "g1");
      expect(get("forearm-l").rotate).toBeLessThan(30);
      cleanup();
    }
  });

  it("ayaktayken gövde hafifçe salınır; oturacak yer yoksa sit animasyonu yok sayılır (havada çömelmez)", () => {
    expect(transformOf(heroAt(10).box).rotate).not.toBe(0);
    cleanup();
    // Oturuş pozu yok: uyluk kısalmaz (yalnız ayakta duruşun eğimi).
    expect(heroAt(150, { anims: [{ type: "sit" }] }).get("leg-l").sy).toBe(1);
  });

  it("sandalyedeki karakter oturur: salınmaz, ayakları yerde kalacak kadar iner", () => {
    const c = scene({ layers: [{ asset: "chair", x: 960, depth: 0 }, { asset: "hero", x: 960, on: 0 }] }, { frame: 10 });
    const box = layerBox(c, "body");
    const tr = transformOf(box);
    const h = parseFloat(box.style.height);
    expect(tr.rotate).toBe(0);
    expect(tr.y).toBeCloseTo((630 - 520) * (1 - 0.35) * (h / RIG.height));
    expect(pose(c, "leg-r", "s1-1-").sy).toBe(0.35);
    // Oturanda ayakta duruşun bacak eğimi yok.
    expect([pose(c, "leg-l", "s1-1-").rotate, pose(c, "leg-r", "s1-1-").rotate]).toEqual([0, 0]);
  });

  it("ağırlık bir bacakta: karakter başına tohumlu, ~9–14 sn'de bir öbür bacağa yumuşakça geçer", () => {
    const at = (t: number) => stanceAt(t, "s1-0-");
    const series = Array.from({ length: 120 * 30 }, (_, f) => at(f / 30));
    expect(Math.max(...series)).toBe(1);
    expect(Math.min(...series)).toBe(-1);
    // Kare başına değişim geçiş süresinin izin verdiğinden büyük değil (sıçrama yok).
    const step = Math.max(...series.slice(1).map((v, i) => Math.abs(v - series[i]!)));
    expect(step).toBeLessThan((2 / (STANCE.shift * 30)) * 1.6);
    expect(stanceAt(3, "a")).toBe(stanceAt(3, "a"));
    expect(new Set(["a", "b", "c", "d", "e"].map((seed) => Math.sign(stanceAt(0.5, seed)))).size).toBe(2);
  });

  it("dinleyenin dinlenme pozu: bir eli belde (iki yan da), elleri önde kavuşmuş (IK) ya da serbest; konuşan ve tutan serbest", () => {
    // Her durumu veren çekim kimliği (tohum "<çekim>-0-").
    const find = (ok: (seed: string) => boolean) => Array.from({ length: 200 }, (_, i) => `r${i}`).find((id) => ok(`${id}-0-`))!;
    const hip = (side: "l" | "r") => find((sd) => restPoseOf(sd) === "hip" && (random(`${sd}-rh`) < 0.5 ? "l" : "r") === side);
    for (const side of ["l", "r"] as const) {
      const { get } = heroAt(150, {}, hip(side));
      const out = side === "r" ? -1 : 1;
      expect([get(`arm-${side}`).rotate, get(`forearm-${side}`).rotate, get(`hand-${side}`).rotate]).toEqual([out * 30, -out * 65, 0]);
      cleanup();
    }
    const clasped = heroAt(150, {}, find((sd) => restPoseOf(sd) === "clasped")).get;
    for (const [side, x] of [["l", 194], ["r", 206]] as const) {
      const [hx, hy] = tip(RIG.pivots[`arm-${side}`], ARM.upper, ARM.reach, clasped(`arm-${side}`).rotate, clasped(`forearm-${side}`).rotate);
      expect(hx).toBeCloseTo(x, 0);
      expect(hy).toBeCloseTo(470, 0);
    }
    cleanup();
    // Konuşan karakter belde el tutmaz (elleri vurgulara serbest).
    const talker = heroAt(150, { anims: [{ type: "talk" }] }, hip("r")).get;
    expect(talker("arm-r").rotate).not.toBe(-30);
    cleanup();
    expect(find((sd) => restPoseOf(sd) === "relaxed")).toBeDefined();
  });

  it("ayakta duruş: taşıyan bacak içe, gevşek bacak dışa ve dizi bükük; üst gövde taşıyan bacağa, baş öbür yana; gevşek dirsek bükük", () => {
    for (const f of [30, 200]) {
      const { get } = heroAt(f);
      const still = heroAt(f, {}, "s2").get;
      cleanup();
      const k = stanceAt(f / 30, "s1-0-");
      const onL = Math.max(0, k);
      const onR = Math.max(0, -k);
      expect(get("leg-l").rotate).toBeCloseTo(-STANCE.inward * onL + STANCE.out * onR, 1);
      expect(get("leg-r").rotate).toBeCloseTo(STANCE.inward * onR - STANCE.out * onL, 1);
      expect(get("shin-l").rotate).toBeCloseTo(-STANCE.knee * onR, 1);
      expect(get("shin-r").rotate).toBeCloseTo(STANCE.knee * onL, 1);
      // Başka çekimde (başka tohum) aynı karede duruş farklı olabilir; poz biçimi aynı kuralla.
      const k2 = stanceAt(f / 30, "s2-0-");
      expect(still("leg-l").rotate).toBeCloseTo(-STANCE.inward * Math.max(0, k2) + STANCE.out * Math.max(0, -k2), 1);
    }
  });
});

describe("vektör sahne: dikkat (işaret ve bakış)", () => {
  /** Ortadaki karakter ve verilen diğer katmanlar; kare 150'de karakterin iskelet pozu. */
  const withOthers = (hero: object, others: object[], frame = 150) => {
    const c = scene({ layers: [{ asset: "hero", x: 960, depth: 0, ...hero }, ...others] }, { frame });
    const css = c.querySelector("style")!.textContent!;
    cleanup();
    return (part: string) => pose(css, part);
  };
  const point = { anims: [{ type: "point" }] };

  it("give: el, alıcıya doğru bel-göğüs hizasına uzanır (IK); alıcı yoksa sağa; hedef verilmişse o kişiye", () => {
    const give = { anims: [{ type: "give" }] };
    const span = (ARM.upper + ARM.reach) * 0.85;
    const len = Math.hypot(1, 0.5);
    const handAt = (g: (p: string) => { rotate: number }, side: "l" | "r") => tip(RIG.pivots[`arm-${side}`], ARM.upper, ARM.reach, g(`arm-${side}`).rotate, g(`forearm-${side}`).rotate);
    const right = withOthers(give, [{ asset: "walker", x: 1600, depth: 0 }]);
    const [rx, ry] = handAt(right, "r");
    expect(rx).toBeCloseTo(260 + span / len, 0);
    expect(ry).toBeCloseTo(300 + (0.5 * span) / len, 0);
    expect([right("eyes").tx, right("torso").rotate, right("hand-r").rotate]).toEqual([5, 4, -15]);
    const left = withOthers(give, [{ asset: "walker", x: 300, depth: 0 }]);
    expect(handAt(left, "l")[0]).toBeCloseTo(140 - span / len, 0);
    expect(left("eyes").tx).toBe(-5);
    // Yalnızken öne-sağa uzatır ("buyurun").
    expect(handAt(withOthers(give, []), "r")[0]).toBeCloseTo(260 + span / len, 0);
    // Hedef verilmişse yakındaki değil o kişi: soldaki uzaktaki alıcıya sol el.
    const chosen = withOthers({ anims: [{ type: "give", target: 2 }] }, [
      { asset: "walker", x: 1300, depth: 0 },
      { asset: "ada", x: 200, depth: 0 },
    ]);
    expect(handAt(chosen, "l")[0]).toBeCloseTo(140 - span / len, 0);
  });

  it("point yanındaki nesneyi hedefler: sağdaki için sağ kol, soldaki için sol kol omuzdan ona uzanır", () => {
    const right = withOthers(point, [{ asset: "box", x: 1500, y: 300, height: 100 }]);
    expect(right("arm-r").rotate).toBeLessThan(-90); // omuzdan yukarı-sağa
    expect(right("eyes").tx).toBe(5);
    const left = withOthers(point, [{ asset: "box", x: 400, y: 300, height: 100 }]);
    expect(left("arm-l").rotate).toBeGreaterThan(90); // yukarı-sola
    expect(left("head").rotate).toBeGreaterThan(0);
    expect(left("eyes").tx).toBe(-5);
  });

  it("aşağıdaki hedefe aşağı doğru gösterir; aynalanan karakterde de hedef ekranda aynı yandadır", () => {
    const low = withOthers(point, [{ asset: "chair", x: 1500, depth: 0 }]);
    expect(low("arm-r").rotate).toBeGreaterThan(-90);
    expect(low("arm-r").rotate).toBeLessThan(0);
    // Aynalanınca ekranın sağı iskeletin solu olur: sol kol kalkar (çizim aynalandığı için ekranda yine sağa).
    const flipped = withOthers({ ...point, flip: true }, [{ asset: "box", x: 1500, y: 300, height: 100 }]);
    expect(flipped("arm-l").rotate).toBeGreaterThan(90);
  });

  it("yakındaki hedefe dirsek bükülür, parmak ucu nesnenin kenarının önünde durur; çok yakında kol katlanmaz, kişi nesnenin önündeyse düz gösterir", () => {
    // Kahraman x 960, derinlik 0: boy 680 px (k = 0,85), kutusu x 790'dan başlar, üstü y 370. Parmak payı çizimden.
    const fingers = faceFor(ASSETS.hero).fingers.r;
    const rigX = (x: number) => (x - 790) / 0.85;
    const shoulder = RIG.pivots["arm-r"];
    const full = ARM.upper + ARM.reach;
    const handAt = (g: (p: string) => { rotate: number }) => tip(shoulder, ARM.upper, ARM.reach, g("arm-r").rotate, g("forearm-r").rotate);
    // Kutu duvarda (y 600, boy 200): ortası y 500, kişiye bakan kenarı ortadan genişliğin POINT.edge'i kadar.
    const box = (x: number) => [{ asset: "box", x, y: 600, height: 200 }];
    const aim = (x: number) => [rigX(x), (500 - 370) / 0.85] as const;
    const g = withOthers(point, box(1240));
    const [hx, hy] = handAt(g);
    expect(hx).toBeCloseTo(rigX(1240 - 200 * POINT.edge) - (fingers + POINT.gap), 1);
    // El omuzdan hedefin ortasına giden çizgi üzerinde, kol boyundan yakında; dirsek bükük.
    const [ax, ay] = aim(1240);
    expect(Math.atan2(hy - shoulder[1], hx - shoulder[0])).toBeCloseTo(Math.atan2(ay - shoulder[1], ax - shoulder[0]), 3);
    expect(Math.hypot(hx - shoulder[0], hy - shoulder[1])).toBeLessThan(full - 20);
    expect(Math.abs(g("forearm-r").rotate)).toBeGreaterThan(20);
    // Çok yakın: el omuzdan en az min × kol boyu uzakta.
    const [cx, cy] = handAt(withOthers(point, box(1150)));
    expect(Math.hypot(cx - shoulder[0], cy - shoulder[1])).toBeCloseTo(full * POINT.min, 1);
    // Kenar omzun gerisinde (kişi nesnenin önünde): düz kol.
    expect(withOthers(point, box(1080))("forearm-r").rotate).toBe(-6);
    // Uzaktaki hedefe düz kol.
    expect(withOthers(point, box(1700))("forearm-r").rotate).toBe(-6);
    // Tam üstündeki hedef (verilmiş, aynı x): kenar sağda sayılır; kol yukarı kalkar, dirsek bükülmez.
    const above = withOthers({ anims: [{ type: "point", target: 1 }] }, [{ asset: "box", x: 960, y: 300, height: 100 }]);
    expect(above("arm-r").rotate).toBeGreaterThan(90);
    expect(above("forearm-r").rotate).toBe(-6);
  });

  it("target verilmişse en yakını değil o katmanı gösterir; gövdesinin önündeki nesne hedef sayılmaz", () => {
    const others = [
      { asset: "box", x: 1300, y: 300, height: 100 },
      { asset: "cup", x: 300, y: 300, height: 100 },
    ];
    expect(withOthers({ anims: [{ type: "point", target: 2 }] }, others)("arm-l").rotate).toBeGreaterThan(90);
    expect(withOthers(point, others)("arm-r").rotate).toBeLessThan(-90);
    // Tam önündeki nesne atlanır; yazı varsa ona gösterir.
    const c = scene({ layers: [{ asset: "hero", x: 960, depth: 0, ...point }, { asset: "box", x: 980, y: 900, height: 100 }], texts: [{ text: "1923", x: 400, y: 200 }] }, { frame: 150 });
    expect(pose(c, "arm-l").rotate).toBeGreaterThan(90);
  });

  it("gövde, kollar ve baş kalçadan birlikte eğilir: işaret ederken hedefe, şaşırınca geri", () => {
    const right = withOthers(point, [{ asset: "box", x: 1500, y: 300, height: 100 }]);
    expect(right("torso").rotate).toBeGreaterThan(4);
    const left = withOthers(point, [{ asset: "box", x: 400, y: 300, height: 100 }]);
    expect(left("torso").rotate).toBeLessThan(-4);
    const c = scene({ layers: [{ asset: "hero", x: 960, depth: 0.3, anims: [{ type: "surprised" }] }] }, { frame: 150 });
    expect(c.querySelector("style")!.textContent).toContain("transform-origin:200px 520px");
    expect(c.querySelector('[id="s1-0-torso"] > [id="s1-0-body"]')).not.toBeNull();
    expect(pose(c, "torso").rotate).toBeLessThan(-4);
    expect(pose(c, "torso").sy).toBeGreaterThan(1);
    // Yanında biri varken ondan geri çekilir (soldaki kişiden sağa).
    const away = withOthers({ anims: [{ type: "surprised" }] }, [{ asset: "walker", x: 300, depth: 0 }]);
    expect(away("torso").rotate).toBeGreaterThan(4);
  });

  it("üst gövde grubu yalnız kardeş gövde/kol/baş gruplarını sarar; eksik parça, iç içe baş ya da aradaki bacakta dokunulmaz", () => {
    const g = (id: string, inner = "") => `<g id="p-${id}">${inner}</g>`;
    const svg = `<svg>${g("leg-l", g("shin-l"))}${g("body")}${g("arm-l", g("forearm-l"))}${g("arm-r")}<g id="p-x"/>${g("head", g("eyes"))}</svg>`;
    expect(wrapTorso(svg, "p-")).toBe(`<svg>${g("leg-l", g("shin-l"))}<g id="p-torso">${g("body")}${g("arm-l", g("forearm-l"))}${g("arm-r")}<g id="p-x"/>${g("head", g("eyes"))}</g></svg>`);
    for (const bad of [
      `<svg>${g("body")}${g("arm-l")}${g("arm-r")}<g></g></g></svg>`,
      `<svg>${g("body", g("head"))}${g("arm-l")}${g("arm-r")}</svg>`,
      `<svg>${g("body")}${g("leg-r")}${g("arm-l")}${g("arm-r")}${g("head")}</svg>`,
    ])
      expect(wrapTorso(bad, "p-")).toBe(bad);
  });

  it("explain'de baskın el konuşulan kişiye doğru açılır", () => {
    const t = 5;
    const left = withOthers({ anims: [{ type: "explain" }] }, [{ asset: "walker", x: 300, depth: 0 }]);
    expect(left("forearm-l").rotate).toBeCloseTo(60 + Math.sin(t * 3.4) * 12, 1);
    expect(left("forearm-r").rotate).toBeCloseTo(-(28 + Math.sin(t * 3 + 1) * 8), 1);
    const right = withOthers({ anims: [{ type: "explain" }] }, [{ asset: "walker", x: 1600, depth: 0 }]);
    expect(right("forearm-r").rotate).toBeCloseTo(-(60 + Math.sin(t * 3.4) * 12), 1);
  });

  it("aynı karakterin kopyası çizilmez", () => {
    const c = scene({ layers: [{ asset: "hero", x: 600, depth: 0.2 }, { asset: "hero", x: 1400, depth: 0.2 }, { asset: "box", x: 0 }] });
    expect(c.querySelectorAll('[id$="-head"]').length).toBe(1);
    expect(c.querySelector('[id$="-box"]')).not.toBeNull();
  });

  it("sahnede başka karakter varsa gözler çoğunlukla ona döner", () => {
    let toward = 0;
    let away = 0;
    for (let f = 0; f < 300; f += 15) {
      const c = scene({ layers: [{ asset: "hero", x: 600, depth: 0.2 }, { asset: "walker", x: 1400, depth: 0.2 }] }, { frame: f });
      const tx = pose(c, "eyes").tx;
      // Göz kırpma ya da kendiliğinden jest bakışı değiştirmez; sağdaki karaktere bakan göz sağa (artı) kayar.
      if (tx > 2) toward++;
      if (tx < -2) away++;
      cleanup();
    }
    expect(toward).toBeGreaterThan(away);
    expect(toward).toBeGreaterThan(8);
  });
});

describe("vektör sahne: yan görünüş", () => {
  /** Ön görünüşü "hero", yan görünüşü "walker~side" olan karakter (yan çizim mavi). */
  const walkerAt = (frame: number, layer: object, extra: object[] = []) => {
    const c = scene({ layers: [{ asset: "walker", x: 600, depth: 0, ...layer }, ...extra] }, { frame });
    const box = layerBox(c, "body");
    return { c, box, side: box.innerHTML.includes("#0000aa"), tr: transformOf(box), css: c.querySelector("style")!.textContent! };
  };

  it("yürürken yan çizime döner: iskelet yan dönme noktalarıyla pozlanır, bacaklar öne-arkaya salınır", () => {
    const { side, tr, css } = walkerAt(25, { anims: [{ type: "walk", toX: 1500 }] });
    expect(side).toBe(true);
    expect(tr.sx).toBeGreaterThan(0); // sağa giderken çizim olduğu gibi (sağa bakar)
    expect(css).toContain(`#s1-0-head{transform:`);
    expect(css).toContain(`transform-origin:${RIG_SIDE.pivots.head[0]}px ${RIG_SIDE.pivots.head[1]}px`);
    const legs = [pose(css, "leg-l").rotate, pose(css, "leg-r").rotate];
    expect(legs[0]).toBeCloseTo(-legs[1]!, 5);
    expect(pose(css, "eyes").tx).toBe(0);
    cleanup();
  });

  it("yürürken konuşan yan çizime koddan ağız konmaz (yan çizimin ağzı ölçülmez)", () => {
    const { side, c } = walkerAt(25, { anims: [{ type: "walk", toX: 1500 }, { type: "talk" }] });
    expect(side).toBe(true);
    expect(c.querySelector("[id^='s1-0-viseme-']")).toBeNull();
    cleanup();
  });

  it("yerinde yürüyüşte (hedefsiz) yön yoktur: yan çizim katmanın aynalamasını kullanır", () => {
    expect(walkerAt(60, { anims: [{ type: "walk", start: 0, end: 1 }] }).side).toBe(true);
    cleanup();
    expect(walkerAt(60, { anims: [{ type: "walk", start: 0, end: 1 }], flip: true }).tr.sx).toBeLessThan(0);
    cleanup();
  });

  it("sola yürürken çizim aynalanır; durunca ön çizime döner", () => {
    expect(walkerAt(25, { anims: [{ type: "walk", toX: 0 }] }).tr.sx).toBeLessThan(0);
    cleanup();
    const rest = walkerAt(290, { anims: [{ type: "walk", toX: 1000 }] });
    expect(rest.side).toBe(false);
    expect(rest.tr.sx).toBe(1);
    cleanup();
  });

  it("önden yana geçerken çizim yatayda daralır (dönüş); yan görünüş yoksa daralma olmaz", () => {
    // Yürüyüşün ilk kareleri: genlik yarının altında, hâlâ ön çizim ama daralmış.
    let turning: ReturnType<typeof walkerAt> | undefined;
    for (let f = 1; f < 20 && !turning; f++) {
      const r = walkerAt(f, { anims: [{ type: "walk", toX: 1500 }] });
      if (!r.side && r.tr.sx < 0.99) turning = r;
      cleanup();
    }
    expect(turning!.tr.sx).toBeGreaterThanOrEqual(0.6);
    const plain = transformOf(heroAt(25, { anims: [{ type: "walk", toX: 1500 }] }).box);
    expect(plain.sx).toBe(1);
  });

  it("yan görünüşte kol jesti uygulanmaz (kollar yürür), yüz jesti sürer", () => {
    const { css } = walkerAt(25, { anims: [{ type: "walk", toX: 1500 }, { type: "wave" }, { type: "surprised" }, { type: "think" }, { type: "point" }] });
    expect(Math.abs(pose(css, "arm-r").rotate)).toBeLessThan(25);
    expect(pose(css, "mouth").sy).toBeCloseTo(0.3, 1);
    cleanup();
    // Çene duruşunda ("s6") da kol yürür.
    const c = scene({ layers: [{ asset: "walker", x: 600, depth: 0, anims: [{ type: "walk", toX: 1500 }, { type: "think" }] }] }, { frame: 25, shotId: "s6" });
    expect(Math.abs(pose(c, "arm-r", "s6-0-").rotate)).toBeLessThan(25);
    cleanup();
  });

  it("yan görünüşte yürürken tutulan nesne yine elde kalır", () => {
    const c = scene({ layers: [{ asset: "walker", x: 600, depth: 0, anims: [{ type: "walk", toX: 1500 }] }, { asset: "cup", x: 0, heldBy: 0 }] }, { frame: 25 });
    const body = layerBox(c, "body");
    const cup = layerBox(c, "cup");
    const bodyX = parseFloat(body.style.left) + parseFloat(body.style.width) / 2 + transformOf(body).x;
    const cupX = parseFloat(cup.style.left) + parseFloat(cup.style.width) / 2;
    expect(Math.abs(cupX - bodyX)).toBeLessThan(parseFloat(body.style.width) / 2);
  });

  it("oturan karakter yan görünüşe dönmez", () => {
    const c = scene({ layers: [{ asset: "chair", x: 600, depth: 0 }, { asset: "walker", x: 600, on: 0, anims: [{ type: "walk", toX: 1500 }] }] }, { frame: 25 });
    expect(layerBox(c, "body").innerHTML).not.toContain("#0000aa");
  });
});

describe("vektör sahne: bilgi kartı", () => {
  it("sol üst kişiyle doluysa kart sağ üstte, sağa yaslı ve çizgisi sağda; boşsa solda", () => {
    const card = (x: number) => {
      // Yakın çekim: kişinin başı ve kaldırdığı kolları ekranın üst köşesine çıkar. Yerinde yürüdüğü için kamera onu
      // portre kadrajında ortalamaz, yönetmenin kadrajı kalır.
      const camera = { zoomFrom: 2.2, zoomTo: 2.2, panX: 0, focusX: x, focusY: 520 };
      const c = scene({ layers: [{ asset: "hero", x, depth: 0, anims: [{ type: "cheer" }, { type: "walk" }] }], texts: [{ text: "1970", style: "title", x: 0, y: 0 }], camera }, { frame: 60 });
      const el = c.querySelector<HTMLElement>('[data-text="card"]')!;
      const r = { align: el.style.textAlign, left: el.style.left, bar: (el.firstElementChild as HTMLElement).style.borderRight };
      cleanup();
      return r;
    };
    const busy = card(330);
    expect(busy.align).toBe("right");
    expect(busy.left).toBe(`${1920 - 72 - 960}px`);
    expect(busy.bar).toContain("6px solid");
    expect(card(1500)).toMatchObject({ align: "left", left: "72px", bar: "" });
  });
});

describe("vektör sahne: büyütme balonu ve atmosfer katmanı", () => {
  // Duvarı kaplayan öğe: geniş çekim dolu, kamera kendiliğinden yaklaşmaz (fillWide).
  const wall = { asset: "panorama", x: 960, y: 1080, height: 1080 };
  const held = { layers: [{ asset: "hero", x: 1300, depth: 0.5 }, { asset: "cup", x: 0, heldBy: 0 }, wall] };

  it("elde tutulan küçük nesne geniş çekimde yuvarlak pencerede büyük görünür; çizgi nesneye gider; çekim başında yok", () => {
    expect(scene(held, { frame: 0 }).querySelector("[data-callout]")).toBeNull();
    cleanup();
    const c = scene({ ...held, texts: [{ text: "Bardak", x: 400, y: 200, style: "title" }, { text: "Mucit", x: 1300, y: 300, style: "label" }] }, { frame: 150 });
    const box = c.querySelector('[data-callout="cup"]')!;
    expect(box.innerHTML).toContain("#00ff00");
    expect(box.querySelector("line")).not.toBeNull();
    // Kimlikler balona özel önekli: sahnedeki aynı çizimle çakışmaz.
    expect(box.querySelector('[id="s1-co-cup"]')).not.toBeNull();
    // Yazılar balonun üstünde çizilir.
    expect(c.innerHTML.indexOf("data-callout")).toBeLessThan(c.innerHTML.indexOf('data-text="card"'));
    expect(c.querySelector('[data-text="tag"]')).not.toBeNull();
    // Paletin vurgusu koyuysa çizgi okunur sarı.
    cleanup();
    const dark = scene(held, { frame: 150, palette: ["#111111", "#222222", "#333333"] });
    expect(dark.querySelector("[data-callout] line")!.getAttribute("stroke")).toBe("#ffd84d");
  });

  it("yönetmenin seçtiği küçük nesneye de; yakın çekimde, haritada, tahtalı çekimde ve küçük resimde yok", () => {
    expect(scene({ layers: [...boxShot([]).layers, wall], callout: 0 }, { frame: 150 }).querySelector('[data-callout="box"]')).not.toBeNull();
    cleanup();
    expect(scene({ ...held, camera: { zoomFrom: 2, zoomTo: 2.2, focusX: 1300, focusY: 600 } }, { frame: 150 }).querySelector("[data-callout]")).toBeNull();
    cleanup();
    expect(scene({ ...held, background: "map" }, { frame: 150 }).querySelector("[data-callout]")).toBeNull();
    cleanup();
    expect(scene(held, { frame: 150, overlay: "library/math/x.webm" }).querySelector("[data-callout]")).toBeNull();
    cleanup();
    expect(scene(held, { frame: 150, insets: false }).querySelector("[data-callout]")).toBeNull();
  });

  it("konfeti, kıvılcım ve toz karakterlerin arkasında; yağmur önde; ikisi de yazıların altında ve sahne tuvali boyunda", () => {
    const order = (ambience: string) => {
      const c = scene({ ...held, texts: [{ text: "Başlık", x: 400, y: 200, style: "title" }] }, { frame: 150, ambience });
      const html = c.innerHTML;
      const r = { amb: html.indexOf("data-ambience"), layer: html.indexOf('id="s1-0-body"'), text: html.indexOf('data-text="card"'), size: c.querySelector("[data-ambience]")!.getAttribute("data-size") };
      cleanup();
      return r;
    };
    const confetti = order("confetti");
    expect(confetti.amb).toBeLessThan(confetti.layer);
    expect(confetti.size).toBe("1920x1080");
    const rain = order("rain");
    expect(rain.amb).toBeGreaterThan(rain.layer);
    expect(rain.amb).toBeLessThan(rain.text);
  });
});

describe("vektör sahne: 3D figür", () => {
  it("figürlü karakter three.js kuklasıyla, iskelet pozuyla çizilir; SVG yedek olarak içinde, ayak altında temas gölgesi", () => {
    const c = scene({ layers: [{ asset: "toy", x: 960, depth: 0, anims: [{ type: "wave" }] }] }, { frame: 90 });
    const fig = c.querySelector("[data-figure]")!;
    expect(fig.getAttribute("data-figure")).toBe("#f1c7a5");
    // El sallarken sağ kol kalkar: poz figüre de gider.
    expect(Math.abs(Number(fig.getAttribute("data-arm")))).toBeGreaterThan(30);
    expect(fig.innerHTML).toContain("#777777");
    expect(c.querySelector("[data-contact]")).not.toBeNull();
    // Yedek SVG'nin pozu da hazır (WebGL açılamazsa kukla yine oynar).
    expect(pose(c, "arm-r").rotate).toBeCloseTo(Number(fig.getAttribute("data-arm")), 1);
  });

  it("figür tuvalinin keskinliği ekrandaki boyundan: katman boyu × kameranın en büyük zoom'u", () => {
    const at = (camera?: object) => {
      const c = scene({ layers: [{ asset: "toy", x: 960, depth: 0, anims: [{ type: "walk" }] }], ...(camera ? { camera } : {}) }, { frame: 10 });
      const fig = c.querySelector<HTMLElement>("[data-figure]")!;
      const r = { scale: Number(fig.getAttribute("data-scale")), height: parseFloat(fig.parentElement!.style.height) };
      cleanup();
      return r;
    };
    const wide = at({ zoomFrom: 1, zoomTo: 1, panX: 0 });
    expect(wide.scale).toBeCloseTo(wide.height / 800, 5);
    // Varsayılan kamera hafifçe yaklaşır.
    expect(at().scale).toBeGreaterThan(wide.scale);
    expect(at({ zoomFrom: 1, zoomTo: 2, panX: 0, focusX: 960, focusY: 500 }).scale).toBeCloseTo((wide.height * 2) / 800, 5);
  });

  it("oturan figürde temas gölgesi yok", () => {
    const sitting = scene({ layers: [{ asset: "chair", x: 960, depth: 0 }, { asset: "toy", x: 960, on: 0 }] }, { frame: 10 });
    expect(sitting.querySelector("[data-figure]")).not.toBeNull();
    expect(sitting.querySelector("[data-contact]")).toBeNull();
  });

  /** Figürün bu karedeki dönüşü, yan pozu, katmanın aynalaması ve yedek SVG'si. */
  const toyAt = (frame: number, layer: object, asset = "toy") => {
    const c = scene({ layers: [{ asset, x: 600, depth: 0, ...layer }] }, { frame });
    const fig = c.querySelector("[data-figure]")!;
    const box = fig.parentElement as HTMLElement;
    const r = { turn: Number(fig.getAttribute("data-turn")), profile: fig.getAttribute("data-profile") === "true", sx: transformOf(box).sx, side: fig.innerHTML.includes("#0000aa") };
    cleanup();
    return r;
  };

  it("yürüyen figür yan çizim istemeden gidiş yönüne döner: önce kısmen, yarı genlikte tam profil ve yan poz; daralma yok", () => {
    const walk = { anims: [{ type: "walk", toX: 1500 }] };
    const frames = Array.from({ length: 30 }, (_, f) => toyAt(f, walk));
    const partial = frames.find((r) => r.turn > 0 && r.turn < 1)!;
    expect(partial.profile).toBe(false);
    expect(partial.sx).toBe(1);
    expect(toyAt(25, walk)).toEqual({ turn: 1, profile: true, sx: 1, side: true });
    // Sola yürürken: geçişte sola döner, profilde katman aynalanır (figür sağa bakan profilin aynası).
    const left = Array.from({ length: 30 }, (_, f) => toyAt(f, { anims: [{ type: "walk", toX: 0 }] }));
    expect(left.some((r) => r.turn < 0 && r.turn > -1)).toBe(true);
    expect(left.at(-1)).toMatchObject({ turn: 1, profile: true, sx: -1 });
    // Aynalanmış katman sağa yürürken geçişte katmanın kendi soluna döner (ekranda sağa).
    expect(Array.from({ length: 30 }, (_, f) => toyAt(f, { ...walk, flip: true })).some((r) => r.turn < 0 && r.turn > -1)).toBe(true);
    // Yerinde yürüyüşte yön yok: katmanın baktığı yana döner (aynalı katman aynalı kalır).
    expect(toyAt(60, { anims: [{ type: "walk", start: 0, end: 1 }], flip: true })).toMatchObject({ turn: 1, profile: true, sx: -1 });
  });

  it("yan çizimi olmayan figür de döner; yedek SVG ön çizimdir", () => {
    (ASSETS as Record<string, VectorAsset>).toy2 = asset("toy2", "character", ASSETS.toy.svg, 400, 800, ASSETS.toy.meta);
    try {
      expect(toyAt(25, { anims: [{ type: "walk", toX: 1500 }] }, "toy2")).toEqual({ turn: 1, profile: true, sx: 1, side: false });
    } finally {
      delete (ASSETS as Record<string, unknown>).toy2;
    }
  });
});

describe("vektör sahne: elde tutulan nesne", () => {
  const held = (holder: object, cupAnims: object[] = [], frame = 150) => {
    const c = scene({ layers: [{ asset: "hero", x: 960, depth: 0, ...holder }, { asset: "cup", x: 0, heldBy: 0, anims: cupAnims }] }, { frame });
    const cup = layerBox(c, "cup");
    const r = { left: parseFloat(cup.style.left), top: parseFloat(cup.style.top), width: parseFloat(cup.style.width) };
    cleanup();
    return r;
  };

  it("give: tutan sağ el soldaki alıcıya da uzanır (gövdenin önünden); nesne elle birlikte alıcıya gider", () => {
    const at = (anims: object[]) => {
      const c = scene({ layers: [{ asset: "hero", x: 960, depth: 0, anims }, { asset: "cup", x: 0, heldBy: 0 }, { asset: "walker", x: 300, depth: 0 }] }, { frame: 150 });
      const r = { left: parseFloat(layerBox(c, "cup").style.left), arm: pose(c, "arm-r").rotate, forearmL: pose(c, "forearm-l").rotate };
      cleanup();
      return r;
    };
    const rest = at([]);
    const give = at([{ type: "give" }]);
    expect(give.left).toBeLessThan(rest.left - 100);
    // Sağ kol sola (saat yönünde, artı) döner; sol kol jest yapmaz.
    expect(give.arm).toBeGreaterThan(20);
    expect(give.forearmL).toBeCloseTo(rest.forearmL, 0);
  });

  it("nesne tutan karakter sol eliyle düşünür: nesne yüze kalkmaz", () => {
    const c = scene({ layers: [{ asset: "hero", x: 960, depth: 0, anims: [{ type: "think" }] }, { asset: "cup", x: 0, heldBy: 0 }] }, { frame: 150, shotId: "s6" });
    const at = (part: string) => pose(c, part, "s6-0-");
    // "s6" tohumunda çene duruşu. Sol el çenenin altına (varsayılan çene, sol tarafından), üst kol kısalarak; baş sola,
    // ele yaslanır.
    const [hx, hy] = tip(RIG.pivots["arm-l"], ARM.upper * at("arm-l").sy, ARM.reach, at("arm-l").rotate, at("forearm-l").rotate);
    expect(hx).toBeCloseTo(200 - 26 * THINK.x, 0);
    expect(hy).toBeCloseTo(242 + THINK.y, 0);
    expect(at("head").rotate).toBeLessThan(0);
    expect(at("forearm-r").rotate).toBeCloseTo(-HOLD_POSE.forearm, -1);
    expect(at("forearm-r").undo).toBeUndefined();
    cleanup();
    // Nesne yüze kalkmaz (gövde yalnız duruş ve düşünme kadar eğilir).
    expect(Math.abs(held({ anims: [{ type: "think" }] }).top - held({}).top)).toBeLessThan(12);
  });

  it("show nesneyi elle birlikte başın üstüne kaldırır; reading göğsün önüne, gövdenin ortasına getirir", () => {
    const rest = held({});
    const shown = held({ anims: [{ type: "show" }] });
    expect(shown.top).toBeLessThan(rest.top - 100);
    const read = held({ anims: [{ type: "reading" }] });
    // Elde tutulan nesne yandan (HOLD_POSE) gövdenin ortasına gelir.
    expect(Math.abs(read.left + read.width / 2 - 960)).toBeLessThan(Math.abs(rest.left + rest.width / 2 - 960));
    // Ön kol kameraya uzanıp kısaldığı için el dirseğe yakın: nesne gövdenin sağ yarısında kalır, öbür yana geçmez.
    expect(read.left + read.width / 2).toBeGreaterThan(960);
  });

  it("nesne tutan karakter nesneyi gösterir: ön kol kalkar, kendiliğinden jest sol elle yapılır", () => {
    for (let frame = 0; frame < 300; frame += 7) {
      const c = scene({ layers: [{ asset: "hero", x: 960, depth: 0 }, { asset: "cup", x: 0, heldBy: 0 }] }, { frame });
      expect(pose(c, "arm-r").rotate).toBeCloseTo(-HOLD_POSE.arm, -1);
      expect(pose(c, "forearm-r").rotate).toBeCloseTo(-HOLD_POSE.forearm, -1);
      cleanup();
    }
    // Nesne gövdenin üst yarısında, kalçada sarkmaz.
    const c = scene({ layers: [{ asset: "hero", x: 960, depth: 0 }, { asset: "cup", x: 0, heldBy: 0 }] }, { frame: 150 });
    const hero = layerBox(c, "body");
    const cup = layerBox(c, "cup");
    const heroTop = parseFloat(hero.style.top);
    const cupMid = parseFloat(cup.style.top) + parseFloat(cup.style.height) / 2;
    expect(cupMid).toBeLessThan(heroTop + parseFloat(hero.style.height) * 0.6);
    cleanup();
  });

  it("nesne tutanın elini izler: el kalkınca nesne de yükselir", () => {
    const down = held({});
    const up = held({ anims: [{ type: "wave" }] });
    expect(up.top).toBeLessThan(down.top - 100);
  });

  it("aynalanan karakterde el, karakterin ekseninde simetrik yerdedir", () => {
    const a = held({ anims: [{ type: "point" }] });
    const b = held({ anims: [{ type: "point" }], flip: true });
    expect(a.left + a.width / 2 + (b.left + b.width / 2)).toBeCloseTo(2 * 960, 0);
    expect(a.top).toBeCloseTo(b.top);
  });

  it("nesnenin kendi yer değiştiren animasyonları yok sayılır (hareketi tutandan gelir)", () => {
    expect(held({}, [{ type: "move", toX: 100, toY: 100 }])).toEqual(held({}));
    for (const type of ["float", "sway", "shake", "slide_in", "walk"]) expect(held({}, [{ type }])).toEqual(held({}));
  });

  it("tutan yürürken nesne elde kalır", () => {
    for (const frame of [60, 150, 240]) {
      const c = scene({ layers: [{ asset: "hero", x: 600, depth: 0, anims: [{ type: "walk", toX: 1300 }] }, { asset: "cup", x: 0, heldBy: 0 }] }, { frame });
      const hero = layerBox(c, "body");
      const cup = layerBox(c, "cup");
      const heroX = parseFloat(hero.style.left) + parseFloat(hero.style.width) / 2 + transformOf(hero).x;
      const cupX = parseFloat(cup.style.left) + parseFloat(cup.style.width) / 2;
      // Sağ el gövde ekseninden en çok yarım gövde genişliği uzaktadır.
      expect(Math.abs(cupX - heroX)).toBeLessThan(parseFloat(hero.style.width) / 2);
      cleanup();
    }
  });

  it("oturan karakterin eli de aşağı iner", () => {
    const c = scene(
      { layers: [{ asset: "chair", x: 960, depth: 0 }, { asset: "hero", x: 960, on: 0 }, { asset: "cup", x: 0, heldBy: 1 }] },
      { frame: 150 },
    );
    const hero = layerBox(c, "body");
    const cup = layerBox(c, "cup");
    const heroTop = parseFloat(hero.style.top) + transformOf(hero).y;
    const heroH = parseFloat(hero.style.height);
    const cupMid = parseFloat(cup.style.top) + parseFloat(cup.style.height) / 2;
    // Elin olduğu yer gövdenin orta bölümünde (ayak hizasının üstünde).
    expect(cupMid).toBeGreaterThan(heroTop + heroH * 0.3);
    expect(cupMid).toBeLessThan(heroTop + heroH * 0.9);
  });

  it("karakter olmayan tutan yok sayılır, nesne kendi yerinde kalır", () => {
    const c = scene({ layers: [{ asset: "box", x: 400, y: 500, height: 200 }, { asset: "cup", x: 1200, y: 400, height: 100, heldBy: 0 }] });
    expect(layerBox(c, "cup").style.left).toBe("1150px");
  });
});

describe("vektör sahne: yerçekimi", () => {
  /** Yerde duran sandalye (derinlikle yerleşir). */
  const chairAt = (anims: object[], frame: number) => {
    const c = scene({ layers: [{ asset: "chair", x: 960, depth: 0.3, anims }] }, { frame });
    const tr = transformOf(layerBox(c, "chair"));
    cleanup();
    return tr;
  };

  it("yerdeki nesne dikeyde hareket etmez: toY yok sayılır, yalnız yatay hedef kalır", () => {
    // Bölüm verisi: at ve araba "toY: 0" ile ekranın tepesine uçuyordu.
    expect(chairAt([{ type: "move", toY: 0 }], 300)).toMatchObject({ x: 0, y: 0 });
    expect(chairAt([{ type: "move", toX: 1460, toY: 0 }], 300)).toMatchObject({ x: 500, y: 0 });
  });

  it("yerdeki nesne süzülmez; yukarıdan/aşağıdan kayarak gelen yerinde belirir", () => {
    expect(chairAt([{ type: "float" }], 60)).toMatchObject({ x: 0, y: 0 });
    const slid = (from: string) => {
      const c = scene({ layers: [{ asset: "chair", x: 960, depth: 0.3, anims: [{ type: "slide_in", from, end: 0.5 }] }] }, { frame: 75 });
      const el = layerBox(c, "chair");
      cleanup();
      return { tr: transformOf(el), opacity: Number(el.style.opacity) };
    };
    for (const from of ["top", "bottom"]) {
      const r = slid(from);
      expect(r.tr).toMatchObject({ x: 0, y: 0 });
      expect(r.opacity).toBeCloseTo(0.5);
    }
    // Yandan gelen yine kayar.
    expect(slid("left").tr.x).toBeLessThan(0);
  });

  it("havadaki nesne süzülür ve dikeyde hareket edebilir", () => {
    expect(boxAt([{ type: "float" }], 60).tr.y).not.toBe(0);
    expect(boxAt([{ type: "move", toY: 600 }], 300).tr.y).toBe(100);
  });
});

describe("vektör sahne: yazılar", () => {
  const textAt = (text: object, frame = 150, palette: string[] = [], o: Opts = {}) => {
    const c = scene({ texts: [{ x: 960, y: 300, ...text }] }, { frame, palette, ...o });
    const el = c.querySelector("[data-text]") as HTMLElement;
    const r = { el, shown: el.querySelector("span")?.textContent ?? null, color: el.style.color };
    cleanup();
    return r;
  };

  it("başlık beyaz, açık renk korunur, koyu renk beyaza döner", () => {
    expect(textAt({ text: "Başlık", style: "title" }).color).toBe("white");
    expect(textAt({ text: "Renkli", color: "#ffd84d" }).color).toBe("#ffd84d");
    expect(textAt({ text: "Koyu", color: "#000000" }).color).toBe("white");
  });

  it("sayılar paletin vurgu rengiyle, vurgu koyuysa sarıyla yazılır", () => {
    expect(textAt({ text: "42", style: "number" }, 150, ["#000", "#111", "#aaffaa"]).color).toBe("#aaffaa");
    expect(textAt({ text: "42", style: "number" }, 150, ["#000", "#111", "#202020"]).color).toBe("#ffd84d");
    expect(textAt({ text: "42", style: "number" }).color).toBe("#ffd84d");
  });

  it("typewriter metni harf harf yazar; boşken plaka çizilmez", () => {
    expect(textAt({ text: "abcdefgh", anims: [{ type: "typewriter" }] }, 0).shown).toBeNull();
    // Doğal hızda (saniyede 16 harf): pencere bütün çekim olsa da 8 harf yarım saniyede (15 kare) yazılır, sonra durur.
    expect(textAt({ text: "abcdefgh", anims: [{ type: "typewriter" }] }, 7).shown).toBe("abcd");
    expect(textAt({ text: "abcdefgh", anims: [{ type: "typewriter" }] }, 150).shown).toBe("abcdefgh");
    // Pencere doğal süreden kısaysa pencereye sığar.
    expect(textAt({ text: "abcdefgh", anims: [{ type: "typewriter", start: 0, end: 0.02 }] }, 3).shown).toBe("abcd");
  });

  it("kinetic (GSAP): plaka soldan açılır, kelimeler maskenin altından sırayla yükselir, sonunda özgün hal", () => {
    const at = (frame: number, anims: object[] = [{ type: "kinetic", start: 0.1, end: 0.5 }], text = "Altair 8800 doğdu") => {
      const c = scene({ texts: [{ x: 960, y: 300, text, style: "title", anims }] }, { frame });
      const plate = c.querySelector("[data-text] > span") as HTMLElement | null;
      const words = [...(plate?.querySelectorAll<HTMLElement>("[data-word] > span") ?? [])];
      const r = { clip: plate?.style.clipPath, text: plate?.textContent, opacity: words.map((w) => w.style.opacity), masks: plate?.querySelectorAll("[data-word]").length };
      cleanup();
      return r;
    };
    // Pencereden önce plaka kapalı, kelimeler görünmez; metin bozulmadan kelimelere bölünür.
    expect(at(0)).toEqual({ clip: "inset(0% 100% 0% 0%)", text: "Altair 8800 doğdu", opacity: ["0", "0", "0"], masks: 3 });
    // Doğal hızın 1,25 katı (~0,9 sn, 28 kare): açılırken plaka açık, ilk kelime son kelimeden önde.
    const mid = at(46);
    expect(mid.clip).toBe("inset(0% 0% 0% 0%)");
    expect(Number(mid.opacity[0])).toBeGreaterThan(Number(mid.opacity[2]));
    // Pencere (kare 30–150) bitmeden yazı yerine oturur ve öyle kalır: karelerin çoğunda yarım yazı görünmüyordu.
    expect(at(90)).toMatchObject({ clip: "inset(0% 0% 0% 0%)", opacity: ["1", "1", "1"] });
    expect(at(300)).toMatchObject({ clip: "inset(0% 0% 0% 0%)", opacity: ["1", "1", "1"] });
    // Kinetik olmayan yazı bölünmez, plakasına dokunulmaz.
    expect(at(0, [])).toEqual({ clip: "", text: "Altair 8800 doğdu", opacity: [], masks: 0 });
    // Daktiloyla birlikte: yazı boşken plaka yok, harfler geldikçe kurulur.
    const typed = [{ type: "typewriter", start: 0, end: 0.5 }, { type: "kinetic", start: 0, end: 0.5 }];
    expect(at(0, typed).text).toBeUndefined();
    expect(at(300, typed)).toMatchObject({ text: "Altair 8800 doğdu", opacity: ["1", "1", "1"] });
  });

  it("count_up sayıyı biçimini koruyarak sıfırdan sayar", () => {
    // Sayaç en çok 2,2 sn (66 kare) sürer: kare 33'te ease-out(0,5) = 0,875.
    const up = (text: string, frame = 33) => textAt({ text, anims: [{ type: "count_up" }] }, frame).shown;
    expect(up("60.000 $")).toBe("52.500 $");
    expect(up("1971")).toBe("1725");
    expect(up("3.14")).toBe("2.75");
    expect(up("%1,5 büyüme")).toBe("%1,3 büyüme");
    expect(up("1.000.000.")).toBe("875.000.");
    expect(up("sayı yok")).toBe("sayı yok");
    expect(up("60.000 $", 300)).toBe("60.000 $");
  });

  it("kişi etiketi kendi yerinde, kadraj içine alınır; bilgi kartı her zaman sol üstte (dikeyde içeride)", () => {
    // Kenar sınırı yazının genişliğiyle: "kenar" ≈ 5 × 40 × 0,55 = 110 px, yarısı + plaka payı 75 px, kenardan 24 px.
    const tag = textAt({ text: "kenar", x: 10 }).el;
    expect(tag.dataset.text).toBe("tag");
    expect(parseFloat(tag.style.left) + 450).toBeCloseTo(24 + 75);
    expect(tag.style.fontSize).toBe("40px");
    expect(parseFloat(textAt({ text: "kenar", x: 1910 }).el.style.left) + 450).toBeCloseTo(1920 - 24 - 75);
    // Uzun etiketin yarısı kutu genişliğiyle sınırlıdır.
    expect(parseFloat(textAt({ text: "x".repeat(60), x: 10 }).el.style.left)).toBeCloseTo(24 + 450 + 20 - 450);
    const card = textAt({ text: "1923, Ankara", style: "title", x: 1500, y: 700 }).el;
    expect(card.dataset.text).toBe("card");
    expect(card).toMatchObject({ style: expect.objectContaining({ left: "72px", top: "64px", textAlign: "left" }) });
    expect(card.querySelector("span")!.style.borderLeft).toContain("6px solid");
    expect(textAt({ text: "1923", style: "number" }, 150, [], { width: 1080, height: 1920 }).el.style.left).toBe("300px");
  });

  describe("kişi etiketi kişiye bağlıdır", () => {
    // Kamera yönetmeninki kalsın (boş geniş çekim yaklaşması etiket konumlarını değiştirmesin).
    const FULL = { asset: "panorama", x: 960, y: 1080, height: 1080 };
    const tagOf = (c: HTMLElement, text: string) => [...c.querySelectorAll<HTMLElement>("[data-text=tag]")].find((el) => el.textContent === text);
    const centre = (el: HTMLElement) => [parseFloat(el.style.left) + 450, parseFloat(el.style.top)] as const;

    it("adı geçen kişinin kafasının üstüne gider (yönetmenin noktası uzakta olsa da)", () => {
      const c = scene({
        layers: [FULL, { asset: "ada", x: 500, depth: 0.3 }, { asset: "babbage", x: 1400, depth: 0.3 }],
        texts: [{ text: "Babbage", style: "label", x: 400, y: 200 }],
      }, { frame: 150 });
      const tag = tagOf(c, "Babbage")!;
      expect(centre(tag)[0]).toBeCloseTo(1400, -2);
      cleanup();
    });

    it("adı eşleşmeyen etiket yakındaki kafaya bağlanır; yakında kimse yoksa yönetmenin noktasında kalır", () => {
      const near = scene({ layers: [FULL, { asset: "hero", x: 700, depth: 0.3 }], texts: [{ text: "işçi", style: "label", x: 820, y: 330 }] }, { frame: 150 });
      expect(centre(tagOf(near, "işçi")!)[0]).toBeCloseTo(700, -2);
      cleanup();
      // İki kafa yakınsa en yakını seçilir.
      const two = scene(
        { layers: [FULL, { asset: "hero", x: 700, depth: 0.3 }, { asset: "walker", x: 1000, depth: 0.3 }], texts: [{ text: "işçi", style: "label", x: 950, y: 330 }] },
        { frame: 150 },
      );
      expect(centre(tagOf(two, "işçi")!)[0]).toBeCloseTo(1000, -2);
      cleanup();
      const far = scene({ layers: [FULL, { asset: "hero", x: 300, depth: 0.3 }], texts: [{ text: "değirmen", style: "label", x: 1500, y: 300 }] }, { frame: 150 });
      // Noktası kamerayla taşınır (varsayılan hafif zoom), kişiye bağlanmaz.
      const [fx, fy] = centre(tagOf(far, "değirmen")!);
      expect(fx).toBeCloseTo(1500, -2);
      expect(fy).toBeCloseTo(300, -2);
      cleanup();
    });

    it("kafanın hemen üstünde durur ve kişi yürüdükçe onunla gider", () => {
      const at = (frame: number) => {
        const c = scene({ layers: [{ asset: "ada", x: 500, depth: 0.3, anims: [{ type: "walk", toX: 1300 }] }], texts: [{ text: "Ada", style: "label", x: 500, y: 200 }] }, { frame });
        const r = centre(tagOf(c, "Ada")!);
        cleanup();
        return r;
      };
      expect(at(280)[0] - at(5)[0]).toBeGreaterThan(600);
      const c = scene({ layers: [FULL, { asset: "ada", x: 960, depth: 0.3 }], texts: [{ text: "Ada", style: "label", x: 960, y: 100 }] }, { frame: 0 });
      const box = layerBox(c, "body");
      // Kafanın tepesi kutunun tepesinden %10 aşağıda: etiket çizilen kafanın hemen üstünde, kutunun boşluğunda asılı değil.
      const top = parseFloat(box.style.top) + transformOf(box).y + parseFloat(box.style.height) * 0.1;
      const [, y] = centre(tagOf(c, "Ada")!);
      expect(y).toBeLessThan(top);
      expect(y).toBeGreaterThan(top - 60);
      cleanup();
    });

    it("kamera yaklaşınca etiket kafayla birlikte ekranda yer değiştirir", () => {
      const shot = (zoom: number) => ({
        layers: [FULL, { asset: "ada", x: 600, depth: 0.3 }],
        texts: [{ text: "Ada", style: "label", x: 600, y: 300 }],
        camera: { zoomFrom: zoom, zoomTo: zoom, panX: 0, focusX: 960, focusY: 540 },
      });
      const wide = scene(shot(1), { frame: 150 });
      const a = centre(tagOf(wide, "Ada")!);
      cleanup();
      const close = scene(shot(1.4), { frame: 150 });
      const b = centre(tagOf(close, "Ada")!);
      cleanup();
      // Odak (960, 540) yerinde kalır: soldaki kafa daha sola, yukarıdaki daha yukarı kayar.
      expect(b[0]).toBeCloseTo(960 + (a[0] - 960) * 1.4, -1);
      expect(b[1]).toBeLessThan(a[1]);
    });

    it("yüzü kadraj dışında kalan kişinin etiketi gösterilmez", () => {
      // Yakın çekim (1.6) sağ altta: soldaki kişi ekranın dışına çıkar (geniş çekim onu kadrajda tutardı).
      const c = scene(
        { layers: [{ asset: "ada", x: 200, depth: 0.3 }], texts: [{ text: "Ada", style: "label", x: 200, y: 300 }], camera: { zoomFrom: 1.6, zoomTo: 1.6, panX: 0, focusX: 1900, focusY: 1000 } },
        { frame: 150 },
      );
      expect(tagOf(c, "Ada")).toBeUndefined();
      cleanup();
      expect(faceOnScreen([500, -20], [500, 700])).toBe(true); // baş tepesi kesik, yüz görünüyor
      expect(faceOnScreen([500, -200], [500, 500])).toBe(false);
      expect(faceOnScreen([-10, 300], [-10, 900])).toBe(false);
      expect(faceOnScreen([1930, 300], [1930, 900])).toBe(false);
      expect(faceOnScreen([500, 1100], [500, 1600])).toBe(false);
    });

    it("çekimde olmayan karakterin adını taşıyan etiket gösterilmez", () => {
      const c = scene({ layers: [{ asset: "ada", x: 600, depth: 0.3 }], texts: [{ text: "Charles Babbage", style: "label", x: 1300, y: 300 }] }, { frame: 150 });
      expect(tagOf(c, "Charles Babbage")).toBeUndefined();
      cleanup();
    });

    it("gizlenen etiket iki yazılık sınırdan yer kapmaz", () => {
      const texts = [
        { text: "Charles Babbage", style: "label", x: 1300, y: 300 },
        { text: "1843", style: "title", x: 0, y: 0 },
        { text: "Ada Lovelace", style: "label", x: 600, y: 300 },
      ];
      const c = scene({ layers: [{ asset: "ada", x: 600, depth: 0.3 }], texts }, { frame: 150 });
      expect(tagOf(c, "Ada Lovelace")).toBeDefined();
      expect(c.querySelector('[data-text="card"]')!.textContent).toContain("1843");
      cleanup();
    });

    it("namesMatch: biri ötekini içerir, çok kısa adlar eşleşmez", () => {
      expect(namesMatch("Charles Babbage", "babbage")).toBe(true);
      expect(namesMatch("Jobs", "Steve Jobs")).toBe(true);
      expect(namesMatch("Ada Lovelace", "Babbage")).toBe(false);
      expect(namesMatch("Al", "Al")).toBe(false);
    });

    it("cameraPoint cameraTransform ile aynı dönüşümü uygular", () => {
      const cam = { zoomFrom: 1, zoomTo: 2, panX: 0.4, focusX: 400, focusY: 300 };
      const [x, y] = cameraPoint(cam, 1, true, [100, 50]);
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\) translateX\((-?[\d.]+)%\)/.exec(cameraTransform(cam, 1, true))!;
      const [tx, ty, sc, pan] = m.slice(1).map(Number) as [number, number, number, number];
      expect(x).toBeCloseTo(tx + sc * (100 + (pan / 100) * 1920));
      expect(y).toBeCloseTo(ty + sc * 50);
    });
  });

  it("yazı animasyonu uygulanır (fade_in)", () => {
    expect(textAt({ text: "x", anims: [{ type: "fade_in", start: 0.6, end: 1 }] }).el.style.opacity).toBe("0");
  });

  it("kart satırları alt alta; kartla örtüşen etiket kartın altında, birbirine binmez, alt sınırı aşınca birlikte yukarı kayar", () => {
    const t = (o: object) => VectorShot.shape.texts.parse([{ text: "Ad", x: 960, y: 300, ...o }])[0]!;
    // İki kart satırı: birincil (başlık) üstte, ikincil (alt başlık) hemen altında.
    const [title, sub] = layoutTexts([t({ text: "1923", style: "title" }), t({ text: "Ankara", style: "subtitle" })]);
    expect(title).toMatchObject({ card: true, x: 72, y: 64, size: 64 });
    expect(sub).toMatchObject({ card: true, size: 44 });
    expect(sub!.y).toBeCloseTo(64 + 64 * 1.15 + 64 * 0.3 + 12);
    // Kartın altına itilen etiket (yatayda kartla örtüşüyor).
    const [card, tag] = layoutTexts([t({ text: "Ali", x: 200, y: 70 }), t({ text: "1923", style: "title" })]);
    expect(card!.card).toBe(true);
    expect(tag!.y).toBeGreaterThan(64 + 64 * 1.15);
    // Alt sınırı aşan iki etiket birlikte yukarı kayar.
    const [a, b] = layoutTexts([t({ y: 800 }), t({ y: 800 })]);
    expect(b!.y + (40 * 1.15) / 2).toBeCloseTo(800);
    expect(b!.y - a!.y).toBeCloseTo(40 * 1.15 + 24);
    // Uzun yazı iki satıra sığana dek küçülür.
    const [long] = layoutTexts([t({ text: "x".repeat(200), style: "title" })]);
    expect(long!.size).toBeLessThan(64);
  });

  it("dikey videoda kişi etiketi tuvalin görünen kısmında ve sağdaki platform düğmelerinin solunda kalır", () => {
    // 9:16: sahne 0,73125 ölçekle, x -162'den başlar; görünen tuval ~221..1698, düğme şeridi tuvalde ~1493'ten sonra.
    expect(stageFit(1080, 1920)).toBeCloseTo(0.73125);
    expect(stageFit(1920, 1080)).toBe(1);
    const b = tagBounds(1080, 1920);
    expect(b.left).toBeCloseTo(162 / 0.73125);
    expect(b.right).toBeCloseTo((1080 - 150 + 162) / 0.73125);
    expect(tagBounds(1920, 1080)).toEqual({ left: 0, right: 1920 });
    expect(tagBounds(1080, 1080)).toEqual({ left: 0, right: 1920 });
    const t = VectorShot.shape.texts.parse([{ text: "Bill Gates", x: 1650, y: 400 }])[0]!;
    const [wide] = layoutTexts([t]);
    const [tall] = layoutTexts([t], true, undefined, b);
    expect(wide!.x).toBe(1650);
    expect(tall!.x).toBeLessThan(b.right - 100);
    const [left] = layoutTexts([{ ...t, x: 100 }], true, undefined, b);
    expect(left!.x).toBeGreaterThan(b.left + 100);
  });
});

describe("vektör sahne: arka plan, harita ve kadraj", () => {
  const bgDiv = (c: HTMLElement, id: string) => c.querySelector(`[id="s1-bg-${id}"]`)!.closest("svg")!.parentElement as HTMLElement;

  it("çizilmiş arka plan soluklaştırılır, kök svg kutuyu dolduracak şekilde ayarlanır", () => {
    const c = scene({ background: "room" });
    const div = bgDiv(c, "wall");
    expect(div.style.filter).toBe("saturate(0.78) contrast(0.86) brightness(0.94)");
    const svg = div.querySelector("svg")!;
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid slice");
    expect(svg.getAttribute("width")).toBe("100%");
  });

  it("gerçek veriden üretilen bayrak olduğu gibi gösterilir, etiket/rota yoksa üst katman boştur", () => {
    const c = scene({ background: "flag" }, { lineStyle: "flat" });
    expect(bgDiv(c, "red").style.filter).toBe("");
    expect(c.querySelector("style")).toBeNull();
    expect(bgDiv(c, "red").innerHTML).toContain('fill="#e30a17"');
  });

  it("harita rotaları sırayla çizilir, etiketler sırayla belirir", () => {
    const at = (frame: number) => {
      const c = scene({ background: "map" }, { frame });
      const css = c.querySelector("style")!.textContent!;
      const offset = (i: number) => Number(new RegExp(`#s1-bg-route-${i}\\{stroke-dashoffset:([\\d.]+)\\}`).exec(css)![1]);
      const labels = [...c.querySelectorAll("div")].filter((d) => d.style.whiteSpace === "nowrap").map((d) => d.textContent);
      cleanup();
      return { r0: offset(0), r1: offset(1), labels };
    };
    const start = at(0);
    expect(start).toEqual({ r0: 1, r1: 1, labels: [] });
    const mid = at(120); // p = 0,4
    expect(mid.r0).toBeLessThan(mid.r1);
    expect(mid.r1).toBeLessThan(1);
    expect(mid.labels).toEqual(["Türkiye", "İstanbul"]);
    const end = at(300);
    expect(end).toEqual({ r0: 0, r1: 0, labels: ["Türkiye", "İstanbul", "Sefer"] });
  });

  it("küre haritası 3D çizilir: SVG tabanı gizlenir, rota ve etiketler küre durunca oynar", () => {
    const at = (frame: number) => {
      const c = scene({ background: "globe" }, { frame });
      const css = [...c.querySelectorAll("style")].map((st) => st.textContent).join("");
      const out = {
        globe: c.querySelector("[data-globe]")!.getAttribute("data-globe"),
        opacity: Number(bgDiv(c, "sky").style.opacity),
        route: Number(/#s1-bg-route-0\{stroke-dashoffset:([\d.]+)\}/.exec(css)![1]),
        hidden: css.includes("#s1-bg-globe-base{display:none}"),
        labels: [...c.querySelectorAll("div")].filter((d) => d.style.whiteSpace === "nowrap").map((d) => d.textContent),
      };
      cleanup();
      return out;
    };
    // p = 0,2: küre hâlâ dönüyor; harita katmanı görünmez.
    expect(at(60)).toEqual({ globe: "35|0.2|s1", opacity: 0, route: 1, hidden: true, labels: [] });
    // p = 0,5: küre durdu; katman görünür, rota çiziliyor, ülke adı çıktı.
    const mid = at(150);
    expect(mid.opacity).toBe(1);
    expect(mid.route).toBeGreaterThan(0);
    expect(mid.route).toBeLessThan(1);
    expect(mid.labels).toEqual(["Türkiye"]);
    expect(at(300).route).toBe(0);
    // Düz haritada 3D küre yok.
    const flat = scene({ background: "map" });
    expect(flat.querySelector("[data-globe]")).toBeNull();
    expect(bgDiv(flat, "route-0").style.opacity).toBe("");
  });

  it("draw_on: nesne konturdan çizilerek belirir, bitince özgün haline döner; animasyonsuz katman işaretlenmez", () => {
    const shot = { layers: [{ asset: "box", x: 600, depth: 0.4, anims: [{ type: "draw_on", start: 0.2, end: 0.6 }] }, { asset: "cup", x: 1200, depth: 0.4 }] };
    const at = (frame: number) => {
      const c = scene(shot, { frame });
      const box = layerBox(c, "box");
      const out = {
        marked: box.querySelector("[data-draw]")?.getAttribute("data-draw"),
        css: box.querySelector("style")?.textContent ?? "",
        cup: layerBox(c, "cup").querySelector("[data-draw]"),
      };
      cleanup();
      return out;
    };
    const before = at(0);
    expect(before.marked).toBe("s1-0-d0");
    expect(before.cup).toBeNull();
    expect(before.css).toContain('[data-draw="s1-0-d0"]{fill-opacity:0.000;stroke-dasharray:400.00 400.00;stroke-dashoffset:400.00');
    // p = 0,4: pencerenin yarısı; kare (400 birim) %62,5 çizilmiş, dolgu henüz yok.
    expect(at(120).css).toContain("stroke-dashoffset:150.00");
    expect(at(240).css).toBe("");
  });

  it("etiket türüne göre biçimlenir", () => {
    const c = scene({ background: "map" }, { frame: 300 });
    const byText = (t: string) => [...c.querySelectorAll("div")].find((d) => d.textContent === t && d.style.whiteSpace === "nowrap") as HTMLElement;
    expect(byText("Türkiye").style.textTransform).toBe("uppercase");
    expect(byText("İstanbul").style.color).toBe("#1f2430");
    expect(byText("Sefer").style.color).toBe("#fff");
    expect(byText("Sefer").style.left).toBe("700px");
  });

  it("bozuk varlık atlanır, sahnenin geri kalanı çizilir", () => {
    const c = scene({ layers: [{ asset: "broken", x: 300, y: 500, height: 100 }, { asset: "box", x: 960, y: 500, height: 200 }] });
    expect(layerBox(c, "box")).toBeTruthy();
    expect(c.innerHTML).not.toContain("bu bir svg değil");
  });

  it("arka plan yoksa paletten degrade; palet yoksa varsayılan renkler", () => {
    const root = (palette: string[]) => {
      const el = scene({}, { palette }).firstElementChild as HTMLElement;
      cleanup();
      return el.style.background;
    };
    expect(root([])).toContain("#1d2433");
    expect(root(["#101010", "#202020"])).toContain("#101010");
  });

  it("sketch çizgi stili titreşim filtresini ekler ve katmanlara uygular", () => {
    const c = scene(boxShot([]), { lineStyle: "sketch" });
    expect(c.querySelector("filter#ys-sketch feTurbulence, filter#ys-sketch feturbulence")).toBeTruthy();
    expect(layerBox(c, "box").style.filter).toBe("url(#ys-sketch)");
  });

  it("kamera odak noktasına doğru yakınlaşır; ışık havası uygulanır", () => {
    const c = scene({ camera: { zoomFrom: 1, zoomTo: 1.2, focusX: 300, focusY: 200 }, mood: "night" }, { frame: 300 });
    // Odak noktası ekranda yerinde kalır: kayma = odak × (1 − zoom).
    const cam = [...c.querySelectorAll("div")].find((d) => d.style.transform.includes("scale(1.2)")) as HTMLElement;
    expect(cam.style.transform).toBe("translate(-60px, -40px) scale(1.2) translateX(0%)");
    expect(cam.style.transformOrigin).toMatch(/^0(px)? 0(px)?$/);
    expect([...c.querySelectorAll("div")].some((d) => d.style.mixBlendMode === "multiply")).toBe(true);
  });

  it("odak verilmezse kadraj merkezine yakınlaşır", () => {
    const c = scene({});
    expect([...c.querySelectorAll("div")].some((d) => d.style.transform.startsWith("translate(-0px, -0px) scale(1)") || d.style.transform.startsWith("translate(0px, 0px) scale(1)"))).toBe(true);
  });

  it("geniş çekim kenardaki kişiyi kesmez: odak kayar, sığmazsa zoom azalır; yakın çekime ve sığana dokunmaz", () => {
    const person = (x: number, i = 0) => ({ ...PL, index: i, x, y: 900, width: 200, height: 500 });
    // Ekranda görünen tuval aralığı (cameraPoint'in tersi) her iki uçta da kişiyi içermeli.
    const visible = (cam: Parameters<typeof frameWide>[0], k: number) => {
      const [a] = cameraPoint(cam, k, false, [0, 0]);
      const [b] = cameraPoint(cam, k, false, [1920, 0]);
      const per = (b - a) / 1920;
      return [-a / per, (1920 - a) / per] as const;
    };
    const cam = { zoomFrom: 1.1, zoomTo: 1.3, panX: 0.5, focusX: 960, focusY: 540 };
    const out = frameWide(cam, [person(600), person(1800, 1)]);
    expect(out).toMatchObject({ panX: 0, zoomTo: 1.3 });
    for (const k of [0, 1]) {
      const [l, r] = visible(out, k);
      expect(l).toBeLessThanOrEqual(500 + 1);
      expect(r).toBeGreaterThanOrEqual(1900 - 1);
    }
    // Kafa üst kenarda kesiliyorsa odak aşağı iner.
    const high = frameWide({ ...cam, panX: 0, focusY: 1000 }, [{ ...person(960), y: 600 }]);
    expect(high.focusY).toBeLessThan(1000);
    // Çok geniş grup: zoom sığacak kadar azalır; iki kenara değen grupta 1'e iner.
    expect(frameWide(cam, [person(200), person(1700, 1)]).zoomTo).toBeCloseTo(1920 / 1700);
    expect(frameWide(cam, [person(50), person(1880, 1)])).toMatchObject({ zoomFrom: 1, zoomTo: 1, focusX: 960 });
    // Dokunulmayanlar: zaten sığan, yakın çekim, zoom'suz, boş.
    const fits = { zoomFrom: 1, zoomTo: 1.1, panX: 0, focusX: 960, focusY: 540 };
    expect(frameWide(fits, [person(960)])).toBe(fits);
    for (const c of [{ ...cam, zoomTo: 1.6 }, { ...cam, zoomFrom: 1, zoomTo: 1 }]) expect(frameWide(c, [person(1850)])).toBe(c);
    expect(frameWide(cam, [])).toBe(cam);
    // Odaksız kamera da düzeltilir.
    expect(frameWide({ zoomFrom: 1.2, zoomTo: 1.2, panX: 0 }, [person(1850)]).focusX).toBeGreaterThan(960);
  });

  it("boş geniş çekim içeriğe yaklaşır: kişi dizden kesilebilir, nesne altyazı bandına inmez, kafa üst kenara yapışmaz", () => {
    const man = (x: number) => ({ ...PL, x, y: 950, width: 280, height: 560 });
    const isMan = (pl: { height: number }) => pl.height === 560;
    const cam = { zoomFrom: 1.1, zoomTo: 1.3, panX: 0.2, focusX: 960, focusY: 540 };
    const out = fillWide(cam, [man(800), man(1200)], isMan)!;
    expect(out.centre).toBe(true);
    expect(out.cam).toMatchObject({ panX: 0, focusX: 1000, zoomTo: 1.8 });
    expect(out.cam.zoomFrom).toBeCloseTo((1.1 * 1.8) / 1.3);
    const screen = (y: number) => 540 + (y - out.cam.focusY!) * 1.8;
    expect(screen(950 - 560)).toBeGreaterThanOrEqual(0.08 * 1080 - 0.5);
    expect(screen(950 - 560 * 0.3)).toBeLessThanOrEqual(1080);
    // Yerdeki nesne bütün kalır, tabanı altyazı bandının üstünde.
    const box = { ...PL, x: 1100, y: 950, width: 120, height: 120 };
    const withBox = fillWide({ ...cam, zoomTo: 1.1 }, [man(800), box], isMan)!;
    const z = withBox.cam.zoomTo;
    expect(540 + (950 - withBox.cam.focusY!) * z).toBeLessThanOrEqual(0.8 * 1080 + 0.5);
    // Yakın çekim, boş sahne ve az kazanç: dokunulmaz.
    expect(fillWide({ ...cam, zoomTo: 1.6 }, [man(800)], isMan)).toBeUndefined();
    expect(fillWide(cam, [], isMan)).toBeUndefined();
    expect(fillWide({ ...cam, zoomTo: 1.75 }, [man(800)], isMan)).toBeUndefined();
    expect(fillWide(cam, [{ ...PL, x: 960, y: 1080, width: 1920, height: 1080 }], isMan)).toBeUndefined();
  });

  it("ayakta duran eklem yerinden kesilmez: ayaklar kadrajda ya da kesim uyluk ortasının üstünde, en az kaydırmayla", () => {
    const man = { ...PL, x: 960, y: 1000, width: 300, height: 600 };
    // 1,25 zoom, sabit odak: kadraj 108–972, ayakkabılar 28 px kesik. Ayaklar (kare boyunun %1'i payla) kadraja girer.
    const cam = { zoomFrom: 1.25, zoomTo: 1.25, panX: 0, focusX: 960, focusY: 540 };
    expect(jointSafe(cam, false, [man], []).focusY).toBe(724);
    // Ortalanan kamerada odak kadrajın ortasıdır.
    expect(jointSafe(cam, true, [man], []).focusY).toBe(580);
    // Ayaklar tuvalin dibindeyse kadraja giremez: kesim uyluk ortasına çıkar (kafa yine kadrajda).
    const low = { ...man, y: 1078 };
    expect(jointSafe(cam, false, [low], []).focusY).toBe(260);
    // Bütün görünen yerdeki nesne kesilecekse ve başka çare yoksa kamera olduğu gibi kalır.
    const box = { ...PL, x: 1300, y: 960, width: 100, height: 100 };
    expect(jointSafe(cam, false, [low], [box])).toBe(cam);
    // Zaten bütün kalan nesne kısıt değildir.
    expect(jointSafe(cam, false, [low], [{ ...box, y: 1000 }]).focusY).toBe(260);
    // Uygun kadraj, kadraj dışındaki kişi, zoom 1, kişisiz sahne: dokunulmaz.
    for (const [c, people] of [
      [{ ...cam, focusY: 900 }, [man]],
      [cam, [{ ...man, x: -500 }]],
      [{ ...cam, zoomFrom: 1, zoomTo: 1 }, [man]],
      [cam, []],
    ] as const)
      expect(jointSafe(c, false, [...people], [])).toBe(c);
    // Boyu kadraja sığmayan kişi: ne ayak ne uyluk kuralı sağlanır, kamera kalır.
    expect(jointSafe(cam, false, [{ ...man, y: 1078, height: 1000 }], [])).toBe(cam);
  });

  it("fillWide'ın orta planı baldırdan kesmez: sahnede ayaklar kadraja girer", () => {
    const man = (x: number) => ({ ...PL, x, y: 950, width: 280, height: 560 });
    const out = fillWide({ zoomFrom: 1.1, zoomTo: 1.3, panX: 0.2, focusX: 960, focusY: 540 }, [man(800), man(1200)], () => true)!;
    const bottom = (c: { focusY?: number }) => c.focusY! + 540 / 1.8;
    // fillWide yalnız dizin üstünü kadrajda tutar: kesim baldırda kalıyordu.
    expect((950 - bottom(out.cam)) / 560).toBeGreaterThan(0.05);
    const safe = jointSafe(out.cam, true, [man(800), man(1200)], []);
    expect(bottom(safe)).toBeGreaterThanOrEqual(950 + 0.01 * 600);
  });

  it("üstünde bir şey duran masa kişi gibi alttan kesilebilir: masa başındaki kişiye yaklaşılır (Bilgisayarlar s4-sh4)", () => {
    const ada = { ...PL, index: 0, x: 960, y: 936, width: 264, height: 528 };
    const desk = { ...PL, index: 1, x: 960, y: 978, width: 327, height: 298 };
    const article = { ...PL, index: 2, x: 1000, y: 695, width: 78, height: 105, on: 1 };
    const isAda = (pl: { index: number }) => pl.index === 0;
    const cam = { zoomFrom: 1, zoomTo: 1.25, panX: 0, focusX: 960, focusY: 600 };
    const out = fillWide(cam, [ada, desk, article], isAda)!;
    expect(out.cam.zoomTo).toBeGreaterThan(1.25 * 1.1);
    // Masanın üst yarısı kadrajda; tabanı kesilebilir.
    expect(540 + (978 - 298 * 0.5 - out.cam.focusY!) * out.cam.zoomTo).toBeLessThanOrEqual(1080 + 0.5);
    // Üstünde bir şey yoksa masa küçük nesne gibi bütün kalmalı: yaklaşma değmez.
    expect(fillWide(cam, [ada, desk], isAda)).toBeUndefined();
  });

  it("yaklaşmaya değmeyen ama bir yana yığılmış içerik yönetmenin zoom'uyla ortalanır (Microsoft s8-sh5)", () => {
    // Soldaki kişi ve ortadaki küçük cihaz: yaklaşma 1,3 → ~1,42, kazanç eşiğin altında.
    const man = { ...PL, x: 450, y: 951, width: 298, height: 595 };
    const box = { ...PL, x: 1000, y: 902, width: 126, height: 53 };
    const isMan = (pl: { height: number }) => pl.height === 595;
    const cam = { zoomFrom: 1.1, zoomTo: 1.3, panX: 0, focusX: 960, focusY: 600 };
    const out = fillWide(cam, [man, box], isMan)!;
    expect(out.centre).toBe(true);
    expect(out.cam).toMatchObject({ zoomFrom: 1.1, zoomTo: 1.3, panX: 0, focusX: (301 + 1063) / 2 });
    // Kafa üst kenara, cihaz altyazı bandına değmez.
    expect(540 + (951 - 595 - out.cam.focusY!) * 1.3).toBeGreaterThanOrEqual(0.08 * 1080 - 0.5);
    expect(540 + (902 - out.cam.focusY!) * 1.3).toBeLessThanOrEqual(0.8 * 1080 + 0.5);
    // Zaten ortadaysa, kamera kayıyorsa ya da odaksız kamerada içerik ortadaysa dokunulmaz.
    expect(fillWide({ ...cam, focusX: 682 }, [man, box], isMan)).toBeUndefined();
    expect(fillWide({ ...cam, panX: 0.3 }, [man, box], isMan)).toBeUndefined();
    expect(fillWide({ zoomFrom: 1.1, zoomTo: 1.3, panX: 0 }, [{ ...man, x: 820 }, { ...box, x: 1100 }], isMan)).toBeUndefined();
  });

  it("sahnede boş geniş çekim yaklaşır; sahneye yürüyen biri varsa yaklaşmaz", () => {
    const zoomOf = (layers: object[]) => {
      const c = scene({ layers, camera: { zoomFrom: 1.1, zoomTo: 1.1, panX: 0, focusX: 960, focusY: 540 } }, { frame: 150 });
      const t = [...c.querySelectorAll("div")].map((d) => d.style.transform).find((tr) => tr.includes("scale(") && tr.includes("translateX("))!;
      cleanup();
      return Number(/scale\(([\d.]+)\)/.exec(t)![1]);
    };
    expect(zoomOf([{ asset: "hero", x: 800, depth: 0.5 }, { asset: "hero", x: 1100, depth: 0.5 }])).toBeGreaterThan(1.3);
    expect(zoomOf([{ asset: "hero", x: 800, depth: 0.5 }, { asset: "walker", x: 1100, depth: 0.5, anims: [{ type: "walk", toX: 1400 }] }])).toBeCloseTo(1.1);
  });

  it("sahnede geniş çekim kenardaki karakteri kadrajda tutar; sahneye yürüyen ve büyük nesne hesaba katılmaz", () => {
    const zoomOf = (layers: object[]) => {
      // Tuvali kaplayan panorama: boş geniş çekim yaklaşması (fillWide) devreye girmez, burada frameWide sınanır.
      const c = scene({ layers: [{ asset: "panorama", x: 960, y: 1080, height: 1080 }, ...layers], camera: { zoomFrom: 1.2, zoomTo: 1.2, panX: 0, focusX: 960, focusY: 540 } }, { frame: 150 });
      const t = [...c.querySelectorAll("div")].map((d) => d.style.transform).find((tr) => tr.includes("scale(") && tr.includes("translateX("))!;
      cleanup();
      return t;
    };
    const plain = zoomOf([{ asset: "hero", x: 960, depth: 0.3 }]);
    expect(zoomOf([{ asset: "hero", x: 1880, depth: 0.3 }])).not.toBe(plain);
    expect(zoomOf([{ asset: "hero", x: 960, depth: 0.3 }, { asset: "hero", x: 1880, depth: 0.3, anims: [{ type: "walk", toX: 1200 }] }])).toBe(plain);
    expect(zoomOf([{ asset: "hero", x: 960, depth: 0.3 }, { asset: "longtable", x: 1700, depth: 0.3 }])).toBe(plain);
  });

  it("masadaki nesneye yakın çekimde masasındaki kişinin başı da kadrajda kalır; uzaktaki kişi değil (Bilgisayarlar s4-sh5)", () => {
    const desk = { ...PL, index: 0, x: 960, y: 978, width: 327, height: 298, grounded: true };
    const article = { ...PL, index: 1, x: 1050, y: 695, width: 78, height: 105, grounded: true, on: 0 };
    const ada = { ...PL, index: 2, x: 900, y: 936, width: 264, height: 528, grounded: true, on: 4 };
    const steam = { ...PL, index: 3, x: 1450, y: 680, width: 230, height: 192, grounded: false };
    const person = (pl: { index: number }) => pl.index !== 2 && pl.index !== 5;
    const cam = { zoomFrom: 1.2, zoomTo: 1.5, panX: 0, focusX: 1000, focusY: 600 };
    const out = closeUpCamera(cam, [desk, article, ada, steam], false, person);
    // Kişinin başı (900 ± 66) kadrajın içinde: grup soldan onun başıyla başlar.
    expect(out.cam.focusX).toBeCloseTo((900 - 66 + 1450 + 115) / 2);
    const left = out.cam.focusX! - 1920 / 2 / out.cam.zoomTo;
    expect(left).toBeLessThanOrEqual(900 - 66);
    // Uzaktaki kişi (masanın yanında değil) kadrajı genişletmez.
    const far = { ...ada, index: 5, x: 200 };
    expect(closeUpCamera(cam, [desk, article, far, steam], false, person).cam.focusX).toBeCloseTo((1011 + 1565) / 2);
  });

  it("kişi yakın çekimi belden yukarı: kafa üstte küçük payla, kesim belde; oturan biraz aşağıda, yanındaki de kadrajda", () => {
    const man = { ...PL, index: 0, x: 960, y: 951, width: 289, height: 578 };
    const isMan = (pl: { index: number }) => pl.index <= 1;
    // Yönetmen 1,4 → 1,8 kafanın üstündeki duvara odaklanmış: kişi tam boy, kadrajın dibinde kalıyordu.
    const cam = { zoomFrom: 1.4, zoomTo: 1.8, panX: 0.1, focusX: 960, focusY: 400 };
    const out = closeUpCamera(cam, [man], false, () => false, isMan);
    expect(out.centre).toBe(true);
    // Kafa (kutunun %10 altı) ile bel (alttan %44) arası kadrajın %93'ünü doldurmak 3,78 ister; tavan 3,2.
    expect(out.cam).toMatchObject({ panX: 0, focusX: 960, zoomTo: 3.2 });
    expect(out.cam.zoomFrom).toBeCloseTo((1.4 * 3.2) / 1.8, 5);
    const view = 1080 / 3.2;
    const top = 951 - 578 * 0.9;
    expect(out.cam.focusY).toBeCloseTo(top - 0.07 * view + view / 2, 5);
    // Oturan kişi render'da aşağı iner (SIT_DROP): kadraj da onunla iner.
    const sat = closeUpCamera(cam, [{ ...man, sitting: true }], false, () => false, isMan).cam;
    expect(sat.focusY! - out.cam.focusY!).toBeCloseTo((110 * 0.65 * 578) / 800, 5);
    // Kadrajdaki ikinci kişi de çerçevelenir.
    const two = closeUpCamera(cam, [man, { ...man, index: 1, x: 1200 }], false, () => false, isMan).cam;
    expect(two.focusX).toBeCloseTo((960 - 289 * 0.35 + 1200 + 289 * 0.35) / 2, 5);
    // Uzaktaki ikinci kişiyle yaklaşma kazancı küçük: yönetmenin kadrajı kalır.
    const far = { zoomFrom: 2.2, zoomTo: 2.2, panX: 0, focusX: 1150, focusY: 500 };
    expect(closeUpCamera(far, [man, { ...man, index: 1, x: 1450 }], false, () => false, isMan).cam).toBe(far);
    // Kadrajdaki büyük duvar panosu da sığmalı: belden yukarı yaklaşılamaz.
    const board = { ...PL, index: 2, x: 1300, y: 500, width: 500, height: 400, grounded: false };
    expect(closeUpCamera(cam, [man, board], false, (pl) => pl.index === 2, isMan).cam.zoomTo).toBeLessThanOrEqual(1.8);
    // Elde/masada anlatılan nesne varsa özne odur (eski yol); kişi sayılmayan özne de.
    expect(closeUpCamera(cam, [man], false).cam).toBe(cam);
  });

  it("yakın çekimde özne çok küçükse zoom büyür ve özne ortalanır; büyük özne ve harita çekimi olduğu gibi", () => {
    const tiny = { ...PL, width: 40, height: 30, x: 1500, y: 900, grounded: true };
    const wall = { ...PL, index: 1, width: 40, height: 40, x: 960, y: 560, grounded: false };
    const cam = { zoomFrom: 1.6, zoomTo: 1.9, panX: 0, focusX: 960, focusY: 540 };
    // Duvardaki öğe odağa daha yakın ama yerdeki nesne özne seçilir.
    const out = closeUpCamera(cam, [tiny, wall], false);
    expect(out.centre).toBe(true);
    expect(out.cam).toMatchObject({ focusX: 1500, focusY: 885 });
    expect(out.cam.zoomTo).toBeCloseTo(3.2);
    expect(out.cam.zoomFrom).toBeCloseTo((1.6 * 3.2) / 1.9);
    expect(cameraTransform(out.cam, 1, true)).toBe("translate(-3840px, -2292px) scale(3.2) translateX(0%)");
    // Köşedeki özne ortalanamaz: kamera tuvalin dışını göstermez, kenara dayanır.
    expect(cameraTransform({ ...out.cam, focusX: 1900, focusY: 1070 }, 1, true)).toBe("translate(-4224px, -2376px) scale(3.2) translateX(0%)");
    // Odak verilmezse merkeze en yakın yerdeki nesne seçilir.
    const near = { ...tiny, index: 2, x: 1000, y: 600 };
    expect(closeUpCamera({ zoomFrom: 1.6, zoomTo: 1.9, panX: 0 }, [tiny, near], false).cam).toMatchObject({ focusX: 1000, focusY: 585 });
    expect(closeUpCamera({ zoomFrom: 1.6, zoomTo: 1.9, panX: 0 }, [near, tiny], false).cam).toMatchObject({ focusX: 1000 });
    // Masadaki küçük nesne masadan uzakta olsa da özne odur; üstünde bir şey duran masa özne olmaz.
    const table = { ...PL, index: 3, width: 300, height: 180, x: 960, y: 860, grounded: true };
    const ipod = { ...tiny, index: 4, x: 820, y: 680, on: 3 };
    expect(closeUpCamera({ ...cam, focusY: 700 }, [table, ipod], false).cam).toMatchObject({ focusX: 820, focusY: 665, zoomTo: 3.2 });
    // Aynı masadaki iki nesne birlikte kadrajlanır: odak ikisinin ortası, ikisi de kadraja sığar.
    const iphone = { ...ipod, index: 5, x: 1120 };
    const pair = closeUpCamera({ ...cam, focusY: 700 }, [table, ipod, iphone], false).cam;
    expect(pair).toMatchObject({ focusX: 970, focusY: 665, zoomTo: 3.2 });
    const wide = closeUpCamera({ ...cam, focusY: 700 }, [table, ipod, { ...iphone, x: 1700 }], false).cam;
    // Çok geniş grup: yönetmenin zoom'u küçültülmez, yalnız grup ortalanır.
    expect(wide).toMatchObject({ focusX: 1260, zoomTo: 1.9 });
    // Yalnız havada öğe varsa o özne olur; zoom tavandaysa yalnız odak düzelir.
    expect(closeUpCamera({ ...cam, zoomFrom: 3.2, zoomTo: 3.2 }, [wall], false).cam).toMatchObject({ zoomTo: 3.2, focusX: 960, focusY: 540 });
    for (const keep of [
      closeUpCamera(cam, [{ ...tiny, height: 400 }], false),
      closeUpCamera(cam, [tiny], true),
      closeUpCamera({ ...cam, zoomFrom: 1, zoomTo: 1.2 }, [tiny], false),
      closeUpCamera(cam, [], false),
    ])
      expect(keep).toEqual({ cam: expect.objectContaining({ zoomTo: keep.cam.zoomTo }), centre: false });
    // Büyük nesne kadraja sığmıyorsa (yerdeki ekran alt kenarda): odak nesneye taşınır, gerekirse zoom azalır;
    // karakter bilerek kesilir, kadraja sığan nesneye dokunulmaz.
    const all = () => true;
    const screen = { ...PL, width: 300, height: 260, x: 960, y: 1060, grounded: true };
    const moved = closeUpCamera({ ...cam, focusY: 400 }, [screen], false, all);
    expect(moved).toEqual({ cam: { ...cam, panX: 0, focusX: 960, focusY: 930 }, centre: true });
    const huge = closeUpCamera(cam, [{ ...screen, width: 1600, height: 900, y: 1000 }], false, all).cam;
    expect(huge.zoomTo).toBeCloseTo(1.08);
    expect(huge.zoomFrom).toBe(1);
    expect(closeUpCamera({ ...cam, focusY: 400 }, [screen], false).centre).toBe(false);
    expect(closeUpCamera(cam, [{ ...screen, y: 700 }], false, all)).toEqual({ cam, centre: false });
    // Yönetmenin kadrajında görünen öteki nesne (anlatılan logo) küçük özneye yaklaşınca dışarıda kalmaz.
    const gavel = { ...tiny, x: 960, y: 600 };
    const logo = { ...PL, index: 6, width: 300, height: 300, x: 1400, y: 500, grounded: false };
    const both = closeUpCamera({ ...cam, focusX: 1100, focusY: 600 }, [gavel, logo], false, all).cam;
    expect(both.focusX).toBe(1245);
    expect(both.focusY).toBe(400);
    expect(closeUpCamera({ ...cam, focusX: 1100, focusY: 600 }, [gavel, { ...logo, x: 1900, y: 100 }], false, all).cam.focusX).toBe(960);
    // Özne yeterince büyük ve kadrajda, ama duvardaki büyük dergi kapağı taşıyor: kapak sığacak kadar uzaklaşılır.
    const altair = { ...PL, index: 7, width: 130, height: 70, x: 1100, y: 600, grounded: true };
    const cover = { ...PL, index: 8, width: 1500, height: 620, x: 960, y: 640, grounded: false };
    const out2 = closeUpCamera({ ...cam, focusX: 960, focusY: 600, zoomTo: 2 }, [altair, cover], false, all);
    expect(out2).toMatchObject({ centre: true, cam: { focusX: 960, focusY: 330, zoomFrom: 1 } });
    expect(out2.cam.zoomTo).toBeCloseTo(1.152);
    // Elde tutulan nesne kişiden önce özne olur; ince uzun nesnede ölçü alanın karekökü (bant "büyük" sayılmasın).
    // Tutanın başı da kadrajda kalır (baş 350–470, bant 620–660): yüz göz hizasından kesilmez.
    const person = { ...PL, index: 9, width: 300, height: 600, x: 900, y: 950, grounded: true };
    const tape = { ...PL, index: 10, width: 240, height: 40, x: 1050, y: 660, grounded: false, heldBy: 9 };
    const thing = (pl: { index: number }) => pl.index !== 9;
    const insert = closeUpCamera({ ...cam, focusX: 900, focusY: 600 }, [person, tape], false, thing);
    expect(insert).toMatchObject({ centre: true, cam: { focusX: 997.5, focusY: 505 } });
    expect(insert.cam.zoomTo).toBeCloseTo((0.8 * 1080) / 310);
    // Tutan yönetmenin kadrajında değilse yalnız nesne kadrajlanır.
    const alone = closeUpCamera({ ...cam, focusX: 1050, focusY: 300 }, [{ ...person, y: 1900 }, { ...tape, y: 300 }], false, thing);
    expect(alone.cam).toMatchObject({ focusX: 1050, focusY: 280 });
    // Yönetmenin kadrajı dışındaki nesne özneyi kişiden almaz.
    expect(closeUpCamera({ ...cam, focusX: 300, focusY: 600 }, [{ ...person, x: 300 }, { ...tape, x: 1900, y: 100 }], false, thing).cam.focusX).toBe(300);
    // Okunur boydaki nesneye yaklaşılmaz.
    expect(closeUpCamera({ ...cam, focusX: 900, focusY: 600 }, [person, { ...tape, width: 300, height: 300, y: 800 }], false, thing).centre).toBe(false);
    // Odaksız kamera merkezden yaklaşır; tuvalden küçük zoom'da da ortada kalır.
    expect(cameraTransform({ zoomFrom: 0.5, zoomTo: 0.5, panX: 0 }, 0, true)).toBe("translate(480px, 270px) scale(0.5) translateX(0%)");
  });

  it("kadraj için elde tutulan nesne tutuş duruşundaki elin altına konur (render ile aynı), aynalıda öbür yana", () => {
    const holder = { ...PL, width: 200, height: 400, x: 900, y: 900 };
    const cup = { ...PL, index: 1, width: 40, height: 40, x: 900, y: 780, grounded: false, heldBy: 0 };
    const layers = [VectorLayer.parse({ asset: "ali", x: 900 }), VectorLayer.parse({ asset: "cup", x: 900, heldBy: 0 })];
    const [same, held] = heldFraming([holder, cup], layers);
    expect(same).toBe(holder);
    expect(held!.x).not.toBe(900);
    expect(held!.y).toBeLessThan(900);
    const [, mirrored] = heldFraming([holder, cup], [{ ...layers[0]!, flip: true }, layers[1]!]);
    expect(mirrored!.x - 900).toBeCloseTo(-(held!.x - 900), 0);
  });

  it("dikey kadrajda sahne 1,3 kat yakın çekimle ortalanır, boşluğu bulanık arka plan doldurur", () => {
    const c = scene({ background: "room" }, { width: 1080, height: 1920 });
    const fit = (1080 / 1920) * 1.3;
    const box = [...c.querySelectorAll("div")].find((d) => d.style.transformOrigin === "0 0" || d.style.transformOrigin === "0px 0px") as HTMLElement;
    expect(box.style.transform).toBe(`scale(${fit})`);
    expect(parseFloat(box.style.left)).toBeCloseTo((1080 - 1920 * fit) / 2);
    expect(parseFloat(box.style.top)).toBeCloseTo((1920 - 1080 * fit) / 2);
    expect(c.querySelector('[id="s1-bd-wall"]')!.closest("svg")!.parentElement!.style.filter).toContain("blur(28px)");
  });

  it("dikeyde iki kenara yerleşmiş kişiler kesilmesin diye sahne küçülür; ortadaki içerikte, yakın çekimde ve tahtalı çekimde ölçek aynı", () => {
    const base = (1080 / 1920) * 1.3;
    const scale = (c: HTMLElement) => {
      const box = [...c.querySelectorAll("div")].find((d) => d.style.transformOrigin === "0 0" || d.style.transformOrigin === "0px 0px") as HTMLElement;
      return Number(/scale\(([\d.]+)\)/.exec(box.style.transform)![1]);
    };
    const tall = { width: 1080, height: 1920 };
    // Farklı derinlikte: konuşma mesafesine çekilmezler.
    const spread = [
      { asset: "ada", x: 150 },
      { asset: "babbage", x: 1770, depth: 0.6 },
    ];
    const fit = scale(scene({ background: "room", layers: spread }, tall));
    expect(fit).toBeLessThan(base);
    expect(fit).toBeGreaterThanOrEqual(1080 / 1920);
    // Kişiler görünen bandın içinde: sahnenin sol kenarı ekranda kişinin solunda.
    const left = (1080 - 1920 * fit) / 2;
    expect(left + (150 - 100) * fit).toBeGreaterThan(-1);
    const centred = [
      { asset: "ada", x: 800 },
      { asset: "babbage", x: 1120 },
    ];
    expect(scale(scene({ background: "room", layers: centred }, tall))).toBeCloseTo(base);
    expect(scale(scene({ background: "room", layers: spread, camera: { zoomFrom: 2, zoomTo: 2 } }, tall))).toBeCloseTo(base);
    // Yatay kadrajda dokunulmaz.
    expect(scene({ background: "room", layers: spread }).querySelector('[style*="scale(0."]')).toBeNull();
  });

  it("contentFit: içerik yoksa ya da bantta ise ölçek aynı; taşan içerik kadar küçülür, en çok tuvalin tamamı", () => {
    const base = (1080 / 1920) * 1.3;
    expect(contentFit(1080, base, [])).toBe(base);
    expect(contentFit(1080, base, [700, 1200])).toBe(base);
    expect(contentFit(1080, base, [100, 1800])).toBeCloseTo(1080 / (2 * (860 + 30)));
    // Tuvalin dışı tuval kenarı sayılır; tuvalin tamamından küçük olmaz.
    expect(contentFit(1080, base, [-500, 2400])).toBe(1080 / 1920);
    expect(tagBounds(1080, 1920, 1080 / 1920)).toEqual({ left: 0, right: (1080 - 150) / (1080 / 1920) });
  });

  it("stil dokusu sahnenin üstünde, yazıların altında resim olarak biner; dokusuz pakette katman yok", () => {
    const c = scene({ background: "room", texts: [{ text: "1923", x: 960, y: 200 }] }, { texture: "watercolor" });
    const img = c.querySelector('img[data-texture="watercolor"]') as HTMLImageElement;
    expect(img.getAttribute("src")!.startsWith("data:image/svg+xml;charset=utf-8,%3Csvg")).toBe(true);
    expect(decodeURIComponent(img.getAttribute("src")!)).toContain('id="s1-tex-wash"');
    expect(Number(img.style.opacity)).toBeCloseTo(textureLayer("watercolor")!.opacity);
    // Yazı katmanı dokudan sonra gelir: dokunun altında kalmaz.
    // En içteki yazı kutusu (dış kaplar da aynı metni taşır).
    const text = [...c.querySelectorAll("div")].filter((d) => d.textContent === "1923").at(-1)!;
    expect(img.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(scene({ background: "room" }).querySelector("img[data-texture]")).toBeNull();
  });

  it("kare kadrajda büyütme yapılmaz; arka plan yoksa bulanık kopya da yoktur", () => {
    const c = scene({}, { width: 1080, height: 1080 });
    const box = [...c.querySelectorAll("div")].find((d) => d.style.transformOrigin === "0 0" || d.style.transformOrigin === "0px 0px") as HTMLElement;
    expect(box.style.transform).toBe(`scale(${1080 / 1920})`);
    expect(c.querySelector('[id^="s1-bd-"]')).toBeNull();
  });
});

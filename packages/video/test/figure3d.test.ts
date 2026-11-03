import { FigureSpec, RIG, type RigPart } from "@ys/core";
import { Box3, BufferGeometry, DoubleSide, Material, Mesh, Vector3, type MeshPhysicalMaterial } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFigure, faceDepth, poseFigure } from "../src/figure3d.ts";

// Gerçek three: geometri kurmak WebGL istemez; dünya konumları ve sınır kutusu hesaplanabilir.
const BASE: FigureSpec = FigureSpec.parse({
  skin: "#f1c7a5",
  hair: { style: "short", color: "#3a2a20" },
  top: { style: "sweater", color: "#5b7fbf" },
  bottom: { style: "trousers", color: "#3b3f4a" },
  shoes: "#2b2622",
});
const spec = (over: Partial<FigureSpec>): FigureSpec => ({ ...BASE, ...over });
const meshes = (f: ReturnType<typeof buildFigure>) => {
  const out: Mesh[] = [];
  f.root.traverse((o) => o instanceof Mesh && out.push(o));
  return out;
};
const colors = (f: ReturnType<typeof buildFigure>) => new Set(meshes(f).map((m) => `#${(m.material as MeshPhysicalMaterial).color.getHexString()}`));

afterEach(() => vi.restoreAllMocks());

describe("3D figür: iskelet", () => {
  it("her parçanın dönme noktası kukla tuvalindeki yerinde (X = x − 200, Y = 800 − y)", () => {
    const f = buildFigure(BASE);
    f.root.updateMatrixWorld(true);
    for (const [name, part] of Object.entries(f.parts)) {
      const [x, y] = RIG.pivots[(name === "torso" ? "body" : name) as RigPart];
      const at = part.getWorldPosition(new Vector3());
      expect([at.x, at.y], name).toEqual([x - 200, 800 - y]);
    }
  });

  it("ayakkabı tabanı zeminde; figür tuvalin içinde ve önü +Z", () => {
    const f = buildFigure(BASE);
    const box = new Box3().setFromObject(f.root, true);
    expect(box.min.y).toBeGreaterThan(-1);
    expect(box.min.y).toBeLessThan(3);
    expect(box.max.y).toBeLessThan(800);
    expect(box.max.y).toBeGreaterThan(680);
    expect(Math.max(-box.min.x, box.max.x)).toBeLessThan(200);
    // Yüz kameraya (+Z) bakar.
    f.root.updateMatrixWorld(true);
    expect(f.parts.eyes.children[0]!.getWorldPosition(new Vector3()).z).toBeGreaterThan(50);
  });

  it("yüz parçaları kafa yüzeyine oturur", () => {
    expect(faceDepth(0, 74)).toBeCloseTo(76 * 0.94);
    expect(faceDepth(0, 300)).toBe(0);
    expect(faceDepth(27, 80)).toBeLessThan(faceDepth(0, 80));
  });
});

describe("3D figür: tarif", () => {
  it("varsayılanlar şemadan doldurulur (sakal yok, gözlük yok); tarif geçersizse kurulmaz", () => {
    const raw = { skin: "#f1c7a5", hair: { style: "bald", color: "#000000" }, top: { style: "tshirt", color: "#ffffff" }, bottom: { style: "shorts", color: "#222222" }, shoes: "#111111" };
    const plain = meshes(buildFigure(raw as FigureSpec)).length;
    expect(meshes(buildFigure(spec({ ...raw, beard: "full", glasses: true } as Partial<FigureSpec>))).length).toBeGreaterThan(plain);
    expect(() => buildFigure({ ...BASE, skin: "red" })).toThrow();
  });

  it("bütün saç, sakal, üst ve alt seçenekleri kurulur", () => {
    const counts = new Map<string, number>();
    for (const style of FigureSpec.shape.hair.shape.style.options) counts.set(`hair:${style}`, meshes(buildFigure(spec({ hair: { style, color: "#3a2a20" } }))).length);
    for (const beard of FigureSpec.shape.beard.unwrap().options) counts.set(`beard:${beard}`, meshes(buildFigure(spec({ beard }))).length);
    for (const style of FigureSpec.shape.top.shape.style.options) counts.set(`top:${style}`, meshes(buildFigure(spec({ top: { style, color: "#c9694a" } }))).length);
    for (const style of FigureSpec.shape.bottom.shape.style.options) counts.set(`bottom:${style}`, meshes(buildFigure(spec({ bottom: { style, color: "#4a5a78" } }))).length);
    // Kel kafada saç yok, kıvırcıkta toplar var; sakal ve bıyık parça ekler.
    expect(counts.get("hair:bald")!).toBeLessThan(counts.get("hair:short")!);
    expect(counts.get("hair:curly")!).toBeGreaterThan(counts.get("hair:short")! + 10);
    expect(counts.get("beard:stubble")).toBe(counts.get("beard:none")! + 1);
    expect(counts.get("beard:full")).toBe(counts.get("beard:none")! + 2);
    expect(counts.get("top:dress")).toBe(counts.get("top:sweater")! + 1);
    expect(counts.get("bottom:skirt")).toBe(counts.get("bottom:trousers")! + 1);
  });

  it("renkler giysiye göre: tişörtte ön kol, şortta baldır tendir; yelekte kollar iç gömlek; kelde kaş kahve", () => {
    const tee = colors(buildFigure(spec({ top: { style: "tshirt", color: "#c9694a" }, bottom: { style: "shorts", color: "#4a5a78" } })));
    expect(tee.has("#c9694a") && tee.has("#4a5a78") && tee.has("#f1c7a5")).toBe(true);
    const vest = buildFigure(spec({ top: { style: "vest", color: "#c9694a", inner: "#f4efe4" } }));
    expect(colors(vest).has("#f4efe4")).toBe(true);
    // Önü açık yelek kabuğu iki yüzlü çizilir (içi boşluktan görünür).
    expect(meshes(vest).some((m) => (m.material as Material).side === DoubleSide)).toBe(true);
    expect(colors(buildFigure(spec({ top: { style: "jacket", color: "#222831" } }))).has("#f3efe6")).toBe(true);
    expect(colors(buildFigure(spec({ top: { style: "hoodie", color: "#e2b54a" } }))).has("#f3efe6")).toBe(true);
    expect(colors(buildFigure(spec({ top: { style: "dress", color: "#3f9c8a" } }))).has("#3f9c8a")).toBe(true);
    expect(colors(buildFigure(spec({ hair: { style: "bald", color: "#000000" } }))).has("#5b4636")).toBe(true);
  });

  it("yüzey: mat, kil ve parlak malzemeler; aynı renk ve yüzey bir malzemeyi paylaşır; kirli sakal yarı saydam", () => {
    const rough = (finish: FigureSpec["finish"]) => (meshes(buildFigure(spec({ finish })))[0]!.material as MeshPhysicalMaterial);
    expect(rough("matte")).toMatchObject({ roughness: 0.62, clearcoat: 0 });
    expect(rough("clay").roughness).toBe(0.92);
    expect(rough("glossy").clearcoat).toBe(1);
    const legs = meshes(buildFigure(BASE)).filter((m) => (m.material as MeshPhysicalMaterial).color.getHexString() === "3b3f4a");
    expect(new Set(legs.map((m) => m.material)).size).toBe(1);
    const stubble = meshes(buildFigure(spec({ beard: "stubble" }))).find((m) => (m.material as Material).transparent)!;
    expect((stubble.material as Material).opacity).toBe(0.4);
  });

  it("köşeli yüzey (low-poly): az yüzlü geometri ve düz gölge", () => {
    const vertices = (f: ReturnType<typeof buildFigure>) => meshes(f).reduce((n, m) => n + m.geometry.getAttribute("position").count, 0);
    const smoothFig = buildFigure(BASE);
    const faceted = buildFigure(spec({ finish: "faceted" }));
    expect(vertices(faceted)).toBeLessThan(vertices(smoothFig) / 4);
    expect((meshes(faceted)[0]!.material as MeshPhysicalMaterial).flatShading).toBe(true);
    expect((meshes(smoothFig)[0]!.material as MeshPhysicalMaterial).flatShading).toBe(false);
  });

  it("yapı: geniş yapılı figür daha geniş", () => {
    const width = (build: FigureSpec["build"]) => {
      const box = new Box3().setFromObject(buildFigure(spec({ build })).parts.body);
      return box.max.x - box.min.x;
    };
    expect(width("slim")).toBeLessThan(width("average"));
    expect(width("broad")).toBeGreaterThan(width("average"));
  });

  it("dispose bütün geometri ve malzemeleri bırakır", () => {
    const geo = vi.spyOn(BufferGeometry.prototype, "dispose");
    const mat = vi.spyOn(Material.prototype, "dispose");
    const f = buildFigure(spec({ beard: "stubble" }));
    const all = meshes(f);
    f.dispose();
    expect(geo).toHaveBeenCalledTimes(all.length);
    expect(mat).toHaveBeenCalledTimes(new Set(all.map((m) => m.material)).size);
  });
});

describe("3D figür: poz", () => {
  it("dönüş ekranda saat yönü artı (three'de −z), öteleme y aşağı, ölçek dönme noktasında; verilmeyen parça dinlenir", () => {
    const f = buildFigure(BASE);
    const [hx, hy] = f.parts["arm-r"].userData.rest as [number, number];
    poseFigure(f, { "arm-r": { rotate: 90, sx: 1.2, sy: 1, tx: 4, ty: 10 }, "leg-r": { rotate: 0, sx: 1, sy: 0.5, tx: 0, ty: 0 }, mouth: { rotate: 0, sx: 1, sy: -0.8, tx: 0, ty: 0 } });
    expect(f.parts["arm-r"].rotation.z).toBeCloseTo(-Math.PI / 2);
    expect([f.parts["arm-r"].position.x, f.parts["arm-r"].position.y]).toEqual([hx + 4, hy - 10]);
    expect([f.parts["arm-r"].scale.x, f.parts["arm-r"].scale.y]).toEqual([1.2, 1]);
    // Kısalan uyluk ezilmez, kameraya döner (önden boyu sy kat).
    expect(f.parts["leg-r"].scale.y).toBe(1);
    expect(f.parts["leg-r"].rotation.x).toBeCloseTo(-Math.acos(0.5));
    expect(f.parts.mouth.scale.y).toBe(-0.8);
    // Ekranda saat yönü: aşağı sarkan sağ kol 90° dönünce el omzun soluna (gövdeye doğru) kalkar; SVG kuklasıyla aynı.
    f.root.updateMatrixWorld(true);
    const hand = f.parts["hand-r"].getWorldPosition(new Vector3());
    const shoulder = f.parts["arm-r"].getWorldPosition(new Vector3());
    expect(hand.x).toBeLessThan(shoulder.x);
    poseFigure(f, {});
    expect(f.root.rotation.y).toBe(0);
    expect(f.parts["arm-r"].rotation.z).toBeCloseTo(0);
    expect([f.parts["arm-r"].position.x, f.parts["arm-r"].position.y]).toEqual([hx, hy]);
    expect(f.parts.mouth.scale.y).toBe(1);
  });

  it("kısalan ön kol ve uyluk ezilmez, kameraya döner (gerçek boyu korunur); oturan figürün baldırı yine dik iner", () => {
    const f = buildFigure(BASE);
    const at = (o: { getWorldPosition: (v: Vector3) => Vector3 }) => o.getWorldPosition(new Vector3());
    poseFigure(f, {});
    f.root.updateMatrixWorld(true);
    const rest = { elbow: at(f.parts["forearm-r"]), wrist: at(f.parts["hand-r"]), hip: at(f.parts["leg-l"]), knee: at(f.parts["shin-l"]) };
    const fore = rest.elbow.distanceTo(rest.wrist);
    const thigh = rest.hip.distanceTo(rest.knee);
    // Alkış/klavye: ön kol yarı boy görünür, el kameraya gelir; uzuv ezilmez.
    poseFigure(f, { "forearm-r": { rotate: 30, sx: 1, sy: 0.5, tx: 0, ty: 0 } });
    f.root.updateMatrixWorld(true);
    expect(f.parts["forearm-r"].scale.y).toBe(1);
    const [elbow, wrist] = [at(f.parts["forearm-r"]), at(f.parts["hand-r"])];
    expect(elbow.distanceTo(wrist)).toBeCloseTo(fore, 3);
    expect(Math.hypot(wrist.x - elbow.x, wrist.y - elbow.y)).toBeCloseTo(fore * 0.5, 3);
    expect(wrist.z).toBeGreaterThan(elbow.z + fore * 0.8);
    // Oturuş: uyluk kameraya döner (önden boyu 0,35 kat), baldır uyluğun ölçeğini geri alan 1/0,35 ile tam boy dik iner.
    poseFigure(f, { "leg-l": { rotate: 0, sx: 1, sy: 0.35, tx: 0, ty: 0 }, "shin-l": { rotate: 0, sx: 1, sy: 1 / 0.35, tx: 0, ty: 0 } });
    f.root.updateMatrixWorld(true);
    expect([f.parts["leg-l"].scale.y, f.parts["shin-l"].scale.y]).toEqual([1, 1]);
    const [hip, knee, ankle] = [at(f.parts["leg-l"]), at(f.parts["shin-l"]), f.parts["shin-l"].localToWorld(new Vector3(0, -100, 0))];
    expect(hip.distanceTo(knee)).toBeCloseTo(thigh, 3);
    expect(Math.hypot(knee.x - hip.x, knee.y - hip.y)).toBeCloseTo(thigh * 0.35, 3);
    expect(knee.z).toBeGreaterThan(hip.z + thigh * 0.9);
    // Baldır dik: ayak dizin altında, aynı derinlikte.
    expect([ankle.x - knee.x, ankle.z - knee.z].map((v) => Math.round(v))).toEqual([0, 0]);
    expect(ankle.y).toBeLessThan(knee.y - 99);
  });

  it("kısalan üst kol (sy < 1) kameraya döner: dirsek öne gelir, önden boyu sy kat; ön kol ön düzlemde kendi boyunda kalır", () => {
    const f = buildFigure(BASE);
    const at = (o: { getWorldPosition: (v: Vector3) => Vector3 }) => o.getWorldPosition(new Vector3());
    const rest = (() => {
      poseFigure(f, {});
      f.root.updateMatrixWorld(true);
      return { shoulder: at(f.parts["arm-r"]), elbow: at(f.parts["forearm-r"]), wrist: at(f.parts["hand-r"]) };
    })();
    poseFigure(f, { "arm-r": { rotate: 30, sx: 1, sy: 0.6, tx: 0, ty: 0 }, "forearm-r": { rotate: 120, sx: 1, sy: 1, tx: 0, ty: 0 } });
    expect(f.parts["arm-r"].rotation.order).toBe("ZXY");
    expect(f.parts["arm-r"].rotation.x).toBeCloseTo(-Math.acos(0.6));
    expect(f.parts["arm-r"].scale.y).toBe(1);
    expect(f.parts["forearm-r"].rotation.x).toBeCloseTo(Math.acos(0.6));
    f.root.updateMatrixWorld(true);
    const shoulder = at(f.parts["arm-r"]);
    const elbow = at(f.parts["forearm-r"]);
    const wrist = at(f.parts["hand-r"]);
    const upper = rest.shoulder.distanceTo(rest.elbow);
    // Önden (x, y) boyu sy kat; dirsek kameraya (+z) gelir.
    expect(Math.hypot(elbow.x - shoulder.x, elbow.y - shoulder.y)).toBeCloseTo(upper * 0.6, 3);
    expect(elbow.z).toBeGreaterThan(shoulder.z + upper * 0.7);
    // Ön kol ön düzlemde (z sabit), boyu aynı; ekranda üst kola göre 120° dönmüş: toplam 150°.
    expect(wrist.z).toBeCloseTo(elbow.z, 3);
    expect(wrist.distanceTo(elbow)).toBeCloseTo(rest.wrist.distanceTo(rest.elbow), 3);
    const angle = (Math.atan2(-(wrist.x - elbow.x), -(wrist.y - elbow.y)) * 180) / Math.PI;
    expect(angle).toBeCloseTo(150, 3);
  });

  it("profil: figür sağa döner, ekranda saat yönü öne-arkaya salınımdır (ayak geriye, sola gider), yatay öteleme ileri", () => {
    const f = buildFigure(BASE);
    const at = (o: { getWorldPosition: (v: Vector3) => Vector3 }) => o.getWorldPosition(new Vector3());
    poseFigure(f, { "leg-r": { rotate: 30, sx: 1, sy: 1, tx: 0, ty: 0 }, head: { rotate: 0, sx: 1, sy: 1, tx: 12, ty: 0 } }, { turn: 1, profile: true });
    f.root.updateMatrixWorld(true);
    // Yüz sağda (boynun önünde).
    expect(at(f.parts.eyes.children[0]!).x).toBeGreaterThan(at(f.parts.head).x + 40);
    expect(at(f.parts["shin-r"]).x).toBeLessThan(at(f.parts["leg-r"]).x - 30);
    expect(at(f.parts.head).x).toBeCloseTo(12);
    // Kısmi dönüş: yalnız gövde döner, poz önden bakıştaki gibi uygulanır.
    poseFigure(f, { "leg-r": { rotate: 30, sx: 1, sy: 1, tx: 0, ty: 0 } }, { turn: -0.5 });
    expect(f.root.rotation.y).toBeCloseTo(-Math.PI / 4);
    expect(f.parts["leg-r"].rotation.x).toBeCloseTo(0);
    expect(f.parts["leg-r"].rotation.z).toBeCloseTo(-Math.PI / 6);
  });
});

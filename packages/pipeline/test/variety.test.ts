import { VectorShot } from "@ys/core";
import { describe, expect, it } from "vitest";
import { assignReverseViews, REVERSE, reverseCandidates, shotSize, varyShotSizes } from "../src/variety.ts";

const isCharacter = (id: string) => id.startsWith("c");
const shot = (camera: object, layers: object[] = [{ asset: "c1", x: 700 }, { asset: "c2", x: 1100, anims: [{ type: "talk" }] }], extra: object = {}) => ({
  vector: VectorShot.parse({ background: "room", layers, camera: { panX: 0, ...camera }, ...extra }),
});

describe("çekim boyu çeşitliliği", () => {
  it("çekim boyu zoom'un büyüğünden: geniş, orta, yakın", () => {
    expect(shotSize({ zoomFrom: 1, zoomTo: 1.2, panX: 0 })).toBe("wide");
    expect(shotSize({ zoomFrom: 1.3, zoomTo: 1.25, panX: 0 })).toBe("medium");
    expect(shotSize({ zoomFrom: 1.6, zoomTo: 1.5, panX: 0 })).toBe("close");
  });

  it("aynı odada aynı kişilerin aynı boydaki ardışık çekiminde ikincinin boyu bir adım değişir", () => {
    const wide = [shot({ zoomFrom: 1, zoomTo: 1.1 }), shot({ zoomFrom: 1.05, zoomTo: 1.15, focusY: 600 })];
    expect(varyShotSizes(wide, isCharacter)).toBe(1);
    // Geniş → orta: kişilerin ortasına; odak yüksekliği kalır.
    expect(wide[1]!.vector.camera).toMatchObject({ zoomFrom: 1.3, zoomTo: 1.4, focusX: 900, focusY: 600 });
    // Orta → yakın: konuşan kişiye.
    const medium = [shot({ zoomFrom: 1.3, zoomTo: 1.4 }), shot({ zoomFrom: 1.3, zoomTo: 1.4 })];
    varyShotSizes(medium, isCharacter);
    expect(medium[1]!.vector.camera).toMatchObject({ zoomFrom: 1.7, zoomTo: 1.85, focusX: 1100 });
    // Yakın → orta. Hareketsiz tek kişide yakın çekimin öznesi ilk kişi.
    const close = [shot({ zoomFrom: 1.8, zoomTo: 2 }, [{ asset: "c1", x: 500 }]), shot({ zoomFrom: 1.7, zoomTo: 1.9 }, [{ asset: "c1", x: 500 }])];
    varyShotSizes(close, isCharacter);
    expect(close[1]!.vector.camera).toMatchObject({ zoomFrom: 1.25, zoomTo: 1.35, focusX: 500 });
    const lone = [shot({ zoomFrom: 1.3, zoomTo: 1.4 }, [{ asset: "c1", x: 500 }, { asset: "desk", x: 900 }]), shot({ zoomFrom: 1.3, zoomTo: 1.4 }, [{ asset: "c1", x: 500 }])];
    varyShotSizes(lone, isCharacter);
    expect(lone[1]!.vector.camera.focusX).toBe(500);
    // Değişen çekim bir sonrakiyle yeniden karşılaştırılır: üç geniş art arda → geniş, orta, geniş.
    const three = [shot({ zoomFrom: 1, zoomTo: 1.1 }), shot({ zoomFrom: 1, zoomTo: 1.1 }), shot({ zoomFrom: 1, zoomTo: 1.1 })];
    expect(varyShotSizes(three, isCharacter)).toBe(1);
    expect(three.map((s) => shotSize(s.vector.camera))).toEqual(["wide", "medium", "wide"]);
  });

  it("farklı oda, farklı kişiler, farklı boy, kayan kamera, tahta, kişisiz ve vektörsüz çekim dokunulmaz", () => {
    const base = { zoomFrom: 1, zoomTo: 1.1 };
    const cases = [
      [shot(base), shot(base, undefined, { background: "street" })],
      [shot(base), shot(base, [{ asset: "c1", x: 700 }])],
      [shot(base), shot({ zoomFrom: 1.3, zoomTo: 1.4 })],
      [shot(base), shot({ ...base, panX: 0.5 })],
      [shot(base), shot(base, undefined, { math: { steps: ["a=b"] } })],
      [shot(base, [{ asset: "desk", x: 900 }]), shot(base, [{ asset: "desk", x: 900 }])],
      [shot(base), shot(base, undefined, { background: undefined })],
      [{}, shot(base)],
    ];
    for (const list of cases) expect(varyShotSizes(list as { vector?: VectorShot }[], isCharacter)).toBe(0);
  });
});

describe("ters açı ataması", () => {
  const at = (background?: string) => (background === undefined ? {} : { vector: VectorShot.parse({ ...(background ? { background } : {}), layers: [] }) });

  it("aday: en az minShots çekimde ve en az bir kez art arda; en çok kullanılandan, en çok max", () => {
    const run = (id: string, n: number) => Array.from({ length: n }, () => at(id));
    // a 7 (ters açı kimliği asıl odaya sayılır), b 6, c 6; d ve x dörder kez ve hiç art arda değil; e 2.
    const shots = [...run("a", 6), at("a~rev"), ...run("b", 6), ...run("c", 6), ...Array.from({ length: 8 }, (_, i) => at(i % 2 ? "d" : "x")), ...run("e", 2), at(), at("")];
    expect(REVERSE).toEqual({ minShots: 6, max: 3 });
    expect(reverseCandidates(shots)).toEqual(["a", "b", "c"]);
    expect(reverseCandidates([...shots, ...run("f", 9)])).toEqual(["f", "a", "b"]);
  });

  it("aynı odada art arda gelenlerin ikincisi, dördüncüsü… ters açıdan; hazır olmayan oda ve önceki atama geri alınır", () => {
    const shots = [at("a"), at("a"), at("a~rev"), at("b"), at("b"), at(), at("a"), at("a")];
    expect(assignReverseViews(shots, new Set(["a"]))).toBe(3);
    expect(shots.map((s) => s.vector?.background)).toEqual(["a", "a~rev", "a", "b", "b", undefined, "a", "a~rev"]);
    // Oda artık hazır değil (ters açı reddedildi): bütün atamalar geri alınır.
    expect(assignReverseViews(shots, new Set())).toBe(2);
    expect(shots.map((s) => s.vector?.background)).toEqual(["a", "a", "a", "b", "b", undefined, "a", "a"]);
  });

  it("çekim boyu çeşitliliği ters açıyı aynı oda sayar", () => {
    const pair = [shot({ zoomFrom: 1, zoomTo: 1.1 }), shot({ zoomFrom: 1.05, zoomTo: 1.15 }, undefined, { background: "room~rev" })];
    expect(varyShotSizes(pair, isCharacter)).toBe(1);
  });
});

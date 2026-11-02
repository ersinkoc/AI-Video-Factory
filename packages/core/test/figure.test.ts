import { describe, expect, it } from "vitest";
import { FigureSpec } from "../src/figure.ts";
import { VectorAssetMeta } from "../src/vector.ts";

describe("3D figür tarifi", () => {
  const spec = { skin: "#f1c7a5", hair: { style: "curly", color: "#1f1812" }, top: { style: "hoodie", color: "#e2b54a" }, bottom: { style: "trousers", color: "#2f3b52" }, shoes: "#f2f2f2" };

  it("eksik seçenekler varsayılanla dolar: sakal yok, gözlük yok, orta yapı, mat yüzey", () => {
    expect(FigureSpec.parse(spec)).toMatchObject({ beard: "none", glasses: false, build: "average", finish: "matte" });
  });

  it("renkler #rrggbb; bilinmeyen saç ya da giysi reddedilir", () => {
    expect(FigureSpec.safeParse({ ...spec, skin: "peach" }).success).toBe(false);
    expect(FigureSpec.safeParse({ ...spec, hair: { style: "mohawk", color: "#000000" } }).success).toBe(false);
    expect(FigureSpec.safeParse({ ...spec, top: { style: "armor", color: "#000000" } }).success).toBe(false);
  });

  it("varlık bilgisinde isteğe bağlı", () => {
    expect(VectorAssetMeta.parse({}).figure).toBeUndefined();
    expect(VectorAssetMeta.parse({ figure: spec }).figure?.finish).toBe("matte");
  });
});

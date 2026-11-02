import { describe, expect, it } from "vitest";
import { LineStyle } from "../src/vector.ts";
import { STYLE_PACKS, styleFromPack, stylePackOf } from "../src/styles.ts";
import { Texture, textureLayer } from "../src/texture.ts";

describe("stil paketleri", () => {
  it("en az 20 paket, kimlikler benzersiz, renkler geçerli, çizgi stili bilinen", () => {
    expect(STYLE_PACKS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(STYLE_PACKS.map((p) => p.id)).size).toBe(STYLE_PACKS.length);
    expect(new Set(STYLE_PACKS.map((p) => p.artStyle)).size).toBe(STYLE_PACKS.length);
    for (const p of STYLE_PACKS) {
      expect(p.palette.length, p.id).toBeGreaterThanOrEqual(3);
      for (const c of p.palette) expect(c, p.id).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(LineStyle.safeParse(p.lineStyle).success, p.id).toBe(true);
      expect(p.name.tr && p.name.en && p.designNotes && p.suits, p.id).toBeTruthy();
      expect(Texture.safeParse(p.texture).success, p.id).toBe(true);
    }
    // Dokular paketleri ayırır: çoğu pakette bir doku var.
    expect(STYLE_PACKS.filter((p) => p.texture !== "none").length).toBeGreaterThanOrEqual(STYLE_PACKS.length / 2);
  });

  it("doku katmanı: her tür tuvali kaplayan SVG ve saydamlık; tanımlar önekli; none katmansız", () => {
    expect(textureLayer("none")).toBeUndefined();
    for (const kind of Texture.options.filter((k) => k !== "none")) {
      const layer = textureLayer(kind, "x1")!;
      expect(layer.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"'), kind).toBe(true);
      expect(layer.svg, kind).toContain('id="x1-');
      expect(layer.svg, kind).not.toMatch(/id="(?!x1-)/);
      expect(layer.opacity, kind).toBeGreaterThan(0);
      expect(layer.opacity, kind).toBeLessThanOrEqual(1);
    }
    expect(textureLayer("paper")!.svg).toContain('id="ys-tex-fib"');
  });

  it("paketin stil kitabı paket kimliğini ve tasarımcı notlarını taşır", () => {
    const style = styleFromPack(stylePackOf("noir")!);
    expect(style).toMatchObject({ pack: "noir", artStyle: "film noir illustration in high contrast" });
    expect(style.designNotes).toContain("red accent");
    expect(stylePackOf("yok")).toBeUndefined();
  });
});

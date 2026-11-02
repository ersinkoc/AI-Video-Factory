import { Timeline, VectorAsset } from "@ys/core";
import { describe, expect, it } from "vitest";
import { thumbnailShot, thumbnailTitle, thumbnailTitleSize } from "../src/thumbnail.ts";

const asset = (id: string, kind: "character" | "prop" | "background", meta: object = {}) => VectorAsset.parse({ id, kind, svg: "<svg/>", width: 10, height: 10, meta });
const ASSETS = { hero: asset("hero", "character"), ada: asset("ada", "character"), cup: asset("cup", "prop"), map: asset("map", "background", { exact: true }), room: asset("room", "background") };
const shot = (shotId: string, fromFrame: number, layers: { asset: string; x: number }[], background = "room") => ({
  shotId,
  assetUrl: "",
  kind: "motion_graphic",
  fromFrame,
  durationInFrames: 100,
  vector: { background, layers },
});
const tl = (visuals: object[]) => Timeline.parse({ episodeId: "e", lang: "tr", durationInFrames: 1000, visuals, audio: [], vectorAssets: ASSETS });

describe("küçük resim çekimi", () => {
  it("kişisi ve nesnesi olan dolu sahne seçilir; harita geri düşer; başlık kişinin karşı yanında", () => {
    const pick = thumbnailShot(
      tl([
        shot("bos", 0, [{ asset: "cup", x: 900 }]),
        shot("harita", 100, [{ asset: "hero", x: 300 }, { asset: "ada", x: 500 }, { asset: "cup", x: 700 }], "map"),
        shot("dolu", 200, [{ asset: "hero", x: 1400 }, { asset: "cup", x: 900 }, { asset: "yok", x: 1 }]),
      ]),
    );
    expect(pick).toEqual({ shotId: "dolu", side: "left" });
    // Kişi solda: başlık sağa; aynı kişinin kopyası iki kez sayılmaz.
    expect(thumbnailShot(tl([shot("a", 0, [{ asset: "hero", x: 400 }, { asset: "hero", x: 500 }])]))).toEqual({ shotId: "a", side: "right" });
    // Kişisiz sahnede başlık sağda (ortadan hesap).
    expect(thumbnailShot(tl([shot("a", 0, [{ asset: "cup", x: 400 }])]))!.side).toBe("right");
  });

  it("eşit puanda videonun ~%40'ına en yakın çekim", () => {
    const same = (id: string, from: number) => shot(id, from, [{ asset: "hero", x: 500 }]);
    expect(thumbnailShot(tl([same("a", 0), same("b", 350), same("c", 800)]))!.shotId).toBe("b");
  });

  it("vektör yoksa ortadaki durağan kare; yalnız klip varsa küçük resim yok", () => {
    const still = (shotId: string, fromFrame: number) => ({ shotId, assetUrl: `${shotId}.png`, kind: "still_motion", fromFrame, durationInFrames: 100 });
    expect(thumbnailShot(tl([still("a", 0), still("b", 350), still("d", 900), { shotId: "c", assetUrl: "c.mp4", kind: "ai_clip", fromFrame: 400, durationInFrames: 100 }]))).toEqual({ shotId: "b", side: "left" });
    expect(thumbnailShot(tl([{ shotId: "c", assetUrl: "c.mp4", kind: "ai_clip", fromFrame: 0, durationInFrames: 100 }]))).toBeUndefined();
    expect(thumbnailShot(Timeline.parse({ episodeId: "e", lang: "tr", durationInFrames: 10, visuals: [], audio: [] }))).toBeUndefined();
  });
});

describe("küçük resim metni", () => {
  it("bölünmüş başlıktan en kısa anlamlı parça; bölünmemiş başlık olduğu gibi", () => {
    expect(thumbnailTitle("Elinde Olmayan Bir Programı Satan Şirket: Microsoft Nasıl Trilyon Dolarlık Oldu?")).toBe("Microsoft Nasıl Trilyon Dolarlık Oldu?");
    expect(thumbnailTitle("Google | Bir Arama Motorunun Hikâyesi")).toBe("Bir Arama Motorunun Hikâyesi");
    expect(thumbnailTitle("Apple - Garajdan Dünyaya")).toBe("Garajdan Dünyaya");
    expect(thumbnailTitle("  DNA ve Genetiğin Hikâyesi ")).toBe("DNA ve Genetiğin Hikâyesi");
    // Tek kelimelik parça seçilmez.
    expect(thumbnailTitle("Atari: Video Oyunları Nasıl Doğdu")).toBe("Video Oyunları Nasıl Doğdu");
    expect(thumbnailTitle("Pong")).toBe("Pong");
    expect(thumbnailTitle("Kısa Başlık: Arkasından gelen uzun açıklama cümlesi")).toBe("Kısa Başlık");
  });

  it("yazı boyu uzunlukla küçülür", () => {
    expect([thumbnailTitleSize("x".repeat(10)), thumbnailTitleSize("x".repeat(20)), thumbnailTitleSize("x".repeat(40)), thumbnailTitleSize("x".repeat(60))]).toEqual([120, 96, 78, 64]);
  });
});

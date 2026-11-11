import { fontFamily, TYPOGRAPHY_PAIRS, type Timeline } from "@ys/core";
import { TypographyFonts } from "./TypographyFonts.tsx";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { THUMB, thumbnailTitleSize, type ThumbnailSide } from "./thumbnail.ts";
import { readable, VectorScene } from "./Vector.tsx";

export type ThumbnailProps = { timeline: Timeline; shotId: string; side: ThumbnailSide; title: string };

/**
 * YouTube küçük resmi (1280×720): bölümün dolu bir çekimi arka plan, üstünde iri, kalın, kenar çizgili başlık ve
 * paletin vurgu renginde çizgi. Çekimin kendi yazıları (bilgi kartı, etiket) çizilmez; başlık kişinin karşı yanında
 * (kişiler iki yandaysa altta). Başlık büyük harfe çevrilmez: Türkçe kural İngilizce marka adını bozuyordu ("MİCROSOFT").
 * Kare çekimin %80'inden alınır (giriş animasyonları bitmiş, kamera yaklaşmış).
 */
export function Thumbnail({ timeline, shotId, side, title }: ThumbnailProps) {
  const visual = timeline.visuals.find((v) => v.shotId === shotId);
  const accent = readable(timeline.palette[2]) ?? "#ffd84d";
  const text = title;
  const bottom = side === "bottom";
  const align = bottom ? "center" : side;
  const size = thumbnailTitleSize(text);
  return (
    <AbsoluteFill style={{ background: "#111" }}>
      <TypographyFonts key={timeline.typography?.pair ?? "legacy"} selection={timeline.typography} />
      {visual?.vector ? (
        <VectorScene
          visual={{ ...visual, overlay: undefined, vector: { ...visual.vector, texts: [] } }}
          assets={timeline.vectorAssets}
          palette={timeline.palette}
          lineStyle={timeline.lineStyle}
          texture={timeline.texture}
          typography={timeline.typography}
          insets={false}
        />
      ) : (
        visual && <Img src={staticFile(visual.assetUrl)} style={{ width: "100%", height: "100%", objectFit: visual.fit ?? "cover" }} />
      )}
      {/* Yazının altındaki yan koyulaşır: başlık her arka planda okunur. */}
      <AbsoluteFill style={{ background: `linear-gradient(${bottom ? 0 : side === "left" ? 90 : 270}deg, rgba(0,0,0,0.78), rgba(0,0,0,0.45) 38%, rgba(0,0,0,0) 62%)` }} />
      <div
        data-title=""
        style={{
          position: "absolute",
          ...(bottom ? { left: 56, right: 56 } : { [side]: 56, maxWidth: THUMB.width * 0.56 }),
          bottom: bottom ? 48 : 72,
          textAlign: align,
          fontFamily: timeline.typography ? fontFamily(TYPOGRAPHY_PAIRS[timeline.typography.pair].heading) : "Inter, 'Noto Sans', 'Segoe UI', sans-serif",
          fontSize: size,
          fontWeight: timeline.typography ? TYPOGRAPHY_PAIRS[timeline.typography.pair].heading.weight : 900,
          lineHeight: 1.02,
          letterSpacing: -1,
          color: "white",
          WebkitTextStroke: `${Math.round(size / 24)}px #0b0b0f`,
          paintOrder: "stroke fill",
          textShadow: "0 6px 24px rgba(0,0,0,0.6)",
        }}
      >
        {text}
        <div style={{ height: 14, width: 180, marginTop: 22, background: accent, borderRadius: 7, marginLeft: align === "left" ? 0 : "auto", marginRight: align === "center" ? "auto" : 0 }} />
      </div>
    </AbsoluteFill>
  );
}

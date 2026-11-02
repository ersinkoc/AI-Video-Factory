import type { Timeline } from "@ys/core";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { THUMB, thumbnailTitleSize } from "./thumbnail.ts";
import { readable, VectorScene } from "./Vector.tsx";

export type ThumbnailProps = { timeline: Timeline; shotId: string; side: "left" | "right"; title: string };

/**
 * YouTube küçük resmi (1280×720): bölümün dolu bir çekimi arka plan, üstünde iri, kalın, kenar çizgili başlık ve
 * paletin vurgu renginde çizgi. Çekimin kendi yazıları (bilgi kartı, etiket) çizilmez; başlık kişinin karşı yanında.
 * Kare çekimin %80'inden alınır (giriş animasyonları bitmiş, kamera yaklaşmış).
 */
export function Thumbnail({ timeline, shotId, side, title }: ThumbnailProps) {
  const visual = timeline.visuals.find((v) => v.shotId === shotId);
  const accent = readable(timeline.palette[2]) ?? "#ffd84d";
  const text = title.toLocaleUpperCase(timeline.lang);
  const size = thumbnailTitleSize(text);
  return (
    <AbsoluteFill style={{ background: "#111" }}>
      {visual?.vector ? (
        <VectorScene visual={{ ...visual, overlay: undefined, vector: { ...visual.vector, texts: [] } }} assets={timeline.vectorAssets} palette={timeline.palette} lineStyle={timeline.lineStyle} />
      ) : (
        visual && <Img src={staticFile(visual.assetUrl)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      )}
      {/* Yazının altındaki yan koyulaşır: başlık her arka planda okunur. */}
      <AbsoluteFill style={{ background: `linear-gradient(${side === "left" ? 90 : 270}deg, rgba(0,0,0,0.78), rgba(0,0,0,0.45) 38%, rgba(0,0,0,0) 62%)` }} />
      <div
        data-title=""
        style={{
          position: "absolute",
          [side]: 56,
          bottom: 72,
          maxWidth: THUMB.width * 0.56,
          textAlign: side,
          fontFamily: "Inter, 'Noto Sans', 'Segoe UI', sans-serif",
          fontSize: size,
          fontWeight: 900,
          lineHeight: 1.02,
          letterSpacing: -1,
          color: "white",
          WebkitTextStroke: `${Math.round(size / 24)}px #0b0b0f`,
          paintOrder: "stroke fill",
          textShadow: "0 6px 24px rgba(0,0,0,0.6)",
        }}
      >
        {text}
        <div style={{ height: 14, width: 180, marginTop: 22, background: accent, borderRadius: 7, marginLeft: side === "right" ? "auto" : 0 }} />
      </div>
    </AbsoluteFill>
  );
}

import { MATH_BOARD, VERTICAL_SAFE, type Timeline } from "@ys/core";
import { useMemo, type ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Ambience } from "./Ambience.tsx";
import { captionPages, cutLook, cutsOf, type Cut } from "./cut.ts";
import { stageFit, VectorScene } from "./Vector.tsx";

export type EpisodeProps = { timeline: Timeline };

type Visual = Timeline["visuals"][number];

/** http(s) ise olduğu gibi, değilse render klasörünün public/ dizininden. */
const src = (url: string) => (/^https?:\/\//.test(url) ? url : staticFile(url));

function StillMotion({ visual }: { visual: Visual }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = visual;
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const motion = visual.motion ?? { type: "ken_burns" as const, zoomFrom: 1, zoomTo: 1.12, panX: 0 };
  // zoomFrom > zoomTo ise geri çekilme. Kaydırma, büyütmenin açtığı payı aşmasın diye ölçekle sınırlı.
  const scale = motion.type === "none" ? 1 : motion.zoomFrom + (motion.zoomTo - motion.zoomFrom) * progress;
  const panX = (motion.panX * (progress - 0.5) * (scale - 1) * 100) / scale;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={src(visual.assetUrl)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translateX(${panX}%)`,
        }}
      />
      <Ambience kind={visual.ambience} seed={visual.shotId} />
    </AbsoluteFill>
  );
}

function Clip({ visual }: { visual: Visual }) {
  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={src(visual.assetUrl)}
        muted
        playbackRate={visual.playbackRate}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </AbsoluteFill>
  );
}

/**
 * Manim tahtası: koyu yarı saydam panelde saydam klip (formül/grafik). Ekrana sabittir (kamera hareketi uygulanmaz),
 * yatayda ortada, bilgi kartının altında ve altyazı bandının üstünde; dikey videoda sahneyle birlikte ölçeklenir.
 */
function MathBoard({ url }: { url: string }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const k = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  // Tahta sahne tuvalinde (1920×1080) tanımlı; sahne gibi ölçeklenip ortalanır (dikeyde sahneyle hizalı kalır).
  const fit = stageFit(width, height);
  const ox = (width - 1920 * fit) / 2;
  const oy = (height - 1080 * fit) / 2;
  return (
    <div
      data-board=""
      style={{
        position: "absolute",
        left: ox + MATH_BOARD.x * fit,
        top: oy + MATH_BOARD.y * fit,
        width: MATH_BOARD.width * fit,
        height: MATH_BOARD.height * fit,
        borderRadius: 18,
        background: "rgba(14,18,26,0.93)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "0 18px 50px rgba(0,0,0,0.35)",
        opacity: k,
        transform: `scale(${0.96 + 0.04 * k})`,
      }}
    >
      <OffthreadVideo src={src(url)} transparent muted style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

/**
 * Çekim bir öncekinin üstüne geçişiyle biner (cut.ts cutsOf: sahne içinde çapraz geçiş, sahne değişince silinme, kayma,
 * daire ya da yakınlaşma). İlk çekimde geçiş yok: video siyahtan açılmasın, ilk kare dolu olsun (Shorts/Reels küçük resmi ve
 * otomatik oynatma ilk kareyi gösterir). Geçiş hızlıyken hareket bulanıklığı alır (cut.ts cutLook); yatay bulanıklığın SVG
 * filtresi çekime özel kimlikle yanına konur.
 */
export function CutIn({ children, cut, id = "cut" }: { children: ReactNode; cut?: Cut; id?: string }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  if (!cut) return <AbsoluteFill>{children}</AbsoluteFill>;
  const at = (f: number) => interpolate(f, [0, cut.frames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", ...(cut.kind === "dissolve" ? {} : { easing: Easing.inOut(Easing.cubic) }) });
  const q = at(frame);
  const { style, sigmaX } = cutLook(cut, q, q - at(frame - 1), width, height);
  const filter = `${id}-mb`;
  return (
    <>
      <AbsoluteFill style={sigmaX > 0 ? { ...style, filter: `url(#${filter})` } : style}>{children}</AbsoluteFill>
      {sigmaX > 0 && (
        <svg width={0} height={0} style={{ position: "absolute" }}>
          <filter id={filter} x="-10%" y="0%" width="120%" height="100%">
            <feGaussianBlur stdDeviation={`${sigmaX.toFixed(1)} 0`} />
          </filter>
        </svg>
      )}
    </>
  );
}

function Captions({ captions }: { captions: Timeline["captions"] }) {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const nowMs = (frame / fps) * 1000;

  const pages = useMemo(() => captionPages(captions), [captions]);

  const page = pages.find((p) => nowMs >= p.startMs && nowMs < p.startMs + p.durationMs);
  if (!page) return null;
  // Dikeyde altyazı platformun alt arayüzünün üstünde ve sağdaki düğmelerden uzakta (ortalı, iki yandan eşit pay).
  const tall = height > width;

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: tall ? VERTICAL_SAFE.bottom + 20 : 90 }}>
      <div
        style={{
          maxWidth: tall ? width - 2 * (VERTICAL_SAFE.right + 10) : "80%",
          textAlign: "center",
          fontFamily: "Inter, 'Noto Sans', 'Segoe UI', sans-serif",
          fontSize: 54,
          fontWeight: 800,
          lineHeight: 1.25,
          color: "white",
          textShadow: "0 3px 12px rgba(0,0,0,0.85)",
          whiteSpace: "pre-wrap",
        }}
      >
        {page.tokens.map((t) => {
          const active = nowMs >= t.fromMs && nowMs < t.toMs;
          return (
            <span key={t.fromMs} style={{ color: active ? "#FFD84D" : "white" }}>
              {t.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/**
 * Bölümün ses izi (seslendirme, müzik, efekt). Render önbelleği sesi ayrıca bundan render eder ("EpisodeAudio"
 * kompozisyonu): görüntüsüz kare değerlendirmesi çok hafif, miks bölümünkiyle aynı.
 */
export function EpisodeAudio({ timeline }: EpisodeProps) {
  return (
    <>
      {timeline.audio.map((a, i) => (
        <Sequence key={`${a.role}-${i}`} from={a.fromFrame} durationInFrames={a.durationInFrames} name={a.role}>
          <Audio src={src(a.assetUrl)} volume={a.volume} />
        </Sequence>
      ))}
    </>
  );
}

export function Episode({ timeline }: EpisodeProps) {
  const cuts = useMemo(() => cutsOf(timeline.visuals, timeline.episodeId), [timeline.visuals, timeline.episodeId]);
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {timeline.visuals.map((v, i) => {
        // Her çekim bir sonrakinin geçişi boyunca onun altında sürer (son çekim uzamaz).
        const duration = v.durationInFrames + (cuts[i + 1]?.frames ?? 0);
        return (
          <Sequence key={v.shotId} from={v.fromFrame} durationInFrames={duration} name={v.shotId}>
            <CutIn cut={cuts[i]} id={v.shotId}>
              {v.kind === "motion_graphic" && v.vector ? (
                <AbsoluteFill>
                  {/* Atmosfer sahnenin içinde çizilir: yazıların, balonun ve formül tahtasının altında kalır. */}
                  <VectorScene
                    visual={v}
                    assets={timeline.vectorAssets}
                    palette={timeline.palette}
                    lineStyle={timeline.lineStyle}
                    texture={timeline.texture}
                    speech={timeline.speech}
                    ambience={v.ambience}
                  />
                  {v.overlay && <MathBoard url={v.overlay} />}
                </AbsoluteFill>
              ) : v.kind === "still_motion" ? (
                <StillMotion visual={v} />
              ) : (
                <Clip visual={v} />
              )}
            </CutIn>
          </Sequence>
        );
      })}

      <EpisodeAudio timeline={timeline} />

      {timeline.captions.length > 0 && <Captions captions={timeline.captions} />}
    </AbsoluteFill>
  );
}

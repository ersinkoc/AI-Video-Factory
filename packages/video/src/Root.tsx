import { FigureSpec, type Timeline } from "@ys/core";
import { Composition } from "remotion";
import { Episode, EpisodeAudio, type EpisodeProps } from "./Episode.tsx";
import { FIGURE_PREVIEW, FigurePreview, type FigurePreviewProps } from "./FigurePreview.tsx";
import { Thumbnail, type ThumbnailProps } from "./Thumbnail.tsx";
import { THUMB } from "./thumbnail.ts";

const PLACEHOLDER: Timeline = {
  episodeId: "placeholder",
  lang: "tr",
  fps: 30,
  width: 1920,
  height: 1080,
  durationInFrames: 90,
  visuals: [],
  audio: [],
  captions: [],
  speech: [],
  vectorAssets: {},
  palette: [],
  lineStyle: "outline",
  texture: "none",
};

const PLACEHOLDER_FIGURE = FigureSpec.parse({
  skin: "#f1c7a5",
  hair: { style: "short", color: "#3a2a20" },
  top: { style: "sweater", color: "#5b7fbf" },
  bottom: { style: "trousers", color: "#3b3f4a" },
  shoes: "#2b2622",
});

export function Root() {
  return (
    <>
      <Composition
        id="Episode"
        component={Episode}
        defaultProps={{ timeline: PLACEHOLDER } satisfies EpisodeProps}
        // Süre ve çözünürlük timeline'dan gelir.
        calculateMetadata={({ props }) => ({
          durationInFrames: props.timeline.durationInFrames,
          fps: props.timeline.fps,
          width: props.timeline.width,
          height: props.timeline.height,
        })}
        durationInFrames={PLACEHOLDER.durationInFrames}
        fps={PLACEHOLDER.fps}
        width={PLACEHOLDER.width}
        height={PLACEHOLDER.height}
      />
      <Composition
        id="EpisodeAudio"
        component={EpisodeAudio}
        defaultProps={{ timeline: PLACEHOLDER } satisfies EpisodeProps}
        // Bölümle aynı süre ve kare hızı: ses izi görüntü parçalarıyla hizalı.
        calculateMetadata={({ props }) => ({
          durationInFrames: props.timeline.durationInFrames,
          fps: props.timeline.fps,
          width: props.timeline.width,
          height: props.timeline.height,
        })}
        durationInFrames={PLACEHOLDER.durationInFrames}
        fps={PLACEHOLDER.fps}
        width={PLACEHOLDER.width}
        height={PLACEHOLDER.height}
      />
      <Composition
        id="Thumbnail"
        component={Thumbnail}
        defaultProps={{ timeline: PLACEHOLDER, shotId: "", side: "left", title: "" } satisfies ThumbnailProps}
        // Süre seçilen çekimin süresi: kare çekimin içinden alınır (yazı ve kamera animasyonları o ana göre).
        calculateMetadata={({ props }) => ({
          durationInFrames: props.timeline.visuals.find((v) => v.shotId === props.shotId)?.durationInFrames ?? 1,
          fps: props.timeline.fps,
          width: THUMB.width,
          height: THUMB.height,
        })}
        durationInFrames={1}
        fps={PLACEHOLDER.fps}
        width={THUMB.width}
        height={THUMB.height}
      />
      <Composition
        id="Figure"
        component={FigurePreview}
        defaultProps={{ figure: PLACEHOLDER_FIGURE } satisfies FigurePreviewProps}
        durationInFrames={1}
        fps={PLACEHOLDER.fps}
        width={FIGURE_PREVIEW.width}
        height={FIGURE_PREVIEW.height}
      />
    </>
  );
}

import type { FigureSpec } from "@ys/core";
import { AbsoluteFill } from "remotion";
import { Figure3D, FIGURE_VIEW } from "./Figure3D.tsx";
import type { FigurePart, PartPose } from "./figure3d.ts";

export type FigurePreviewProps = {
  figure: FigureSpec;
};

/** Önizleme tuvali: kukla tuvali (400×800) ve figürün kenar payı; figür render'daki kutusuyla aynı yerde. */
export const FIGURE_PREVIEW = {
  width: Math.round(400 * (1 + 2 * FIGURE_VIEW.padX)),
  height: Math.round(800 * (1 + FIGURE_VIEW.padTop + FIGURE_VIEW.padBottom)),
} as const;

const arm = (rotate: number): PartPose => ({ rotate, sx: 1, sy: 1, tx: 0, ty: 0 });
/** Rahat duruş: kollar gövdeden biraz açık, dirsekler hafif bükük. */
const REST: Partial<Record<FigurePart, PartPose>> = { "arm-l": arm(6), "arm-r": arm(-6), "forearm-l": arm(-8), "forearm-r": arm(8) };

/** 3D figürün Stüdyo önizlemesi: saydam zeminde, hacmi görünsün diye hafif dönük (üç çeyrek bakışa yakın). */
export function FigurePreview({ figure }: FigurePreviewProps) {
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 400 * FIGURE_VIEW.padX, top: 800 * FIGURE_VIEW.padTop, width: 400, height: 800 }}>
        <Figure3D spec={figure} pose={REST} view={{ turn: 0.18 }} />
      </div>
    </AbsoluteFill>
  );
}

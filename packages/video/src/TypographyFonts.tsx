import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import { fontAlias, fontAsset, TYPOGRAPHY_PAIRS, type Typography } from "@ys/core";

const loads = new Map<string, Promise<void>>();
export function loadTypography(selection: Typography): Promise<void> {
  const cached = loads.get(selection.pair);
  if (cached) return cached;
  const pair = TYPOGRAPHY_PAIRS[selection.pair];
  const task = Promise.all([pair.heading, pair.body].flatMap((face) => (["latin", "latin-ext"] as const).map(async (subset) => {
    const font = new FontFace(fontAlias(face, subset), `url(${JSON.stringify(staticFile(fontAsset(face, subset)))}) format("woff")`, { weight: String(face.weight), style: "normal" });
    document.fonts.add(await font.load());
  }))).then(() => undefined);
  loads.set(selection.pair, task);
  return task;
}

/** A selected pair must be loaded before any frame can be captured; failures stop the render. */
export function TypographyFonts({ selection }: { selection?: Typography }) {
  const [handle] = useState(() => selection ? delayRender(`Loading typography: ${selection.pair}`) : undefined);
  useEffect(() => {
    if (!selection || handle === undefined) return;
    let mounted = true;
    void loadTypography(selection).then(() => continueRender(handle), (error) => {
      continueRender(handle);
      if (mounted) cancelRender(new Error(`Typography could not load: ${String(error)}`));
    });
    return () => { mounted = false; };
  }, [selection?.pair, handle]);
  return null;
}

import { Application, Graphics } from "pixi.js";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { drawShapes, particleFrame, type ParticleKind, type Pen } from "./particles.ts";

/**
 * Parçacıklı atmosferi PixiJS (WebGL) ile çizer. Pixi'nin kendi saati kapalıdır: her Remotion karesinde sahne
 * `particleFrame`'den yeniden çizilir ve elle render edilir, kare yalnız zamana bağlıdır. Pixi hazırlanana kadar render
 * bekletilir; WebGL açılamazsa katman boş kalır (atmosfer yüzünden bölüm render'ı düşmesin).
 */
export function PixiParticles({ kind, seed, size }: { kind: ParticleKind; seed: string; size?: readonly [number, number] }) {
  const frame = useCurrentFrame();
  const config = useVideoConfig();
  const { fps } = config;
  // Vektör sahnede katman 1920×1080 sahne tuvalinin içindedir (dikey videoda da): parçacıklar o boyda hesaplanır.
  const [width, height] = size ?? [config.width, config.height];
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState<{ app: Application; pen: Graphics }>();
  const [handle] = useState(() => delayRender(`pixi ${kind}`));

  useEffect(() => {
    const app = new Application();
    let live = true;
    let started = false;
    app
      .init({
        canvas: canvas.current!,
        width,
        height,
        backgroundAlpha: 0,
        antialias: true,
        autoStart: false,
        sharedTicker: false,
        preference: "webgl",
        preserveDrawingBuffer: true,
        resolution: 1,
      })
      .then(
        () => {
          started = true;
          if (!live) {
            app.destroy();
            return;
          }
          const pen = new Graphics();
          app.stage.addChild(pen);
          setReady({ app, pen });
        },
        () => continueRender(handle),
      );
    return () => {
      live = false;
      if (started) app.destroy();
    };
  }, [width, height, handle]);

  useLayoutEffect(() => {
    if (!ready) return;
    const f = particleFrame(kind, seed, frame / fps, width, height);
    ready.pen.blendMode = f.blend;
    drawShapes(ready.pen as unknown as Pen, f.shapes);
    ready.app.render();
    continueRender(handle);
  }, [ready, kind, seed, frame, fps, width, height, handle]);

  return <canvas ref={canvas} width={width} height={height} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
}

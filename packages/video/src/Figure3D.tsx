import type { FigureSpec } from "@ys/core";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { continueRender, delayRender } from "remotion";
import {
  DirectionalLight,
  HemisphereLight,
  NeutralToneMapping,
  OrthographicCamera,
  PCFShadowMap,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { buildFigure, poseFigure, type Figure, type FigurePart, type FigureView, type PartPose } from "./figure3d.ts";

/**
 * Çizim alanı: kukla tuvali (400×800) ve kol kaldırınca, eğilince taşan kısım için kenar payı. Tuval katman kutusundan
 * bu oranda büyük konur; figür kutunun içinde SVG kuklasıyla aynı yerde durur.
 */
export const FIGURE_VIEW = { padX: 0.15, padTop: 0.06, padBottom: 0.02, px: 1.6, maxPx: 3 } as const;
const VIEW_W = 400 * (1 + 2 * FIGURE_VIEW.padX);
const VIEW_H = 800 * (1 + FIGURE_VIEW.padTop + FIGURE_VIEW.padBottom);

interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: OrthographicCamera;
  figure: Figure;
}

/**
 * 3D figürün three.js ile çizimi: yumuşak ışıklı (gökyüzü/zemin ışığı, sol üst-önden ana ışık, arkadan kenar ışığı,
 * kendi gölgesi) şeffaf bir tuval. Ortografik kamera kukla tuvaliyle birebir hizalıdır: elde tutulan nesneler, etiketler
 * ve kamera hesapları SVG kuklasıyla aynı kalır. three'nin kendi döngüsü yok, her Remotion karesinde elle çizilir. WebGL
 * açılamazsa karakterin SVG çizimi gösterilir (`fallback`): karakter kaybolmaz, render düşmez.
 */
export function Figure3D({
  spec,
  pose,
  view,
  fallback,
  scale = 0,
}: {
  spec: FigureSpec;
  pose?: Partial<Record<FigurePart, PartPose>>;
  /** Yürürken yana dönüş ve yan poz. */
  view?: FigureView;
  fallback?: ReactNode;
  /**
   * Ekranda kukla tuvalinin bir pikseli kaç piksel (katman boyu × kamera zoom'u / 800). Tuval en az FIGURE_VIEW.px
   * çözünürlükte, yakın çekimde ekran kadar (en çok maxPx) çizilir: 3,2 zoom'da sabit tuval büyütülüp bulanıklaşıyordu.
   */
  scale?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [stage, setStage] = useState<Stage>();
  const [failed, setFailed] = useState(false);
  const [handle] = useState(() => delayRender("figure"));
  // Tuval keskinliği ~%10 adımlarla: kamera zoom'u kare kare değişse de renderer yeniden kurulmaz (zoom çekimin en büyüğü).
  const px = Math.min(FIGURE_VIEW.maxPx, Math.max(FIGURE_VIEW.px, Math.ceil(scale * 10) / 10));

  useEffect(() => {
    if (failed) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas: canvas.current!, antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch {
      setFailed(true);
      continueRender(handle);
      return;
    }
    renderer.setPixelRatio(1);
    renderer.setSize(Math.round(VIEW_W * px), Math.round(VIEW_H * px), false);
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NeutralToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;

    const scene = new Scene();
    const left = -VIEW_W / 2;
    const bottom = -800 * FIGURE_VIEW.padBottom;
    const camera = new OrthographicCamera(left, -left, bottom + VIEW_H, bottom, 1, 3000);
    camera.position.z = 1200;

    // Stüdyo ışığı: sıcak ana ışık sol üst-önden (yumuşak gölge), soğuk kenar ışığı sağ arkadan, gökyüzü/zemin dolgusu.
    const key = new DirectionalLight(0xfff1e2, 2.6);
    key.position.set(-420, 1100, 900);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 6;
    key.shadow.bias = -0.0015;
    Object.assign(key.shadow.camera, { left: -360, right: 360, top: 520, bottom: -520, near: 100, far: 3200 });
    key.target.position.set(0, 400, 0);
    const rim = new DirectionalLight(0xd6e6ff, 1.6);
    rim.position.set(700, 600, -900);
    const fill = new DirectionalLight(0xffe4ec, 0.45);
    fill.position.set(600, 300, 800);
    const figure = buildFigure(spec);
    scene.add(new HemisphereLight(0xffffff, 0xb8a493, 1.25), key, key.target, rim, fill, figure.root);
    setStage({ renderer, scene, camera, figure });
    return () => {
      figure.dispose();
      renderer.dispose();
    };
  }, [spec, handle, failed, px]);

  useLayoutEffect(() => {
    if (!stage) return;
    poseFigure(stage.figure, pose ?? {}, view);
    stage.renderer.render(stage.scene, stage.camera);
    continueRender(handle);
  }, [stage, pose, view?.turn, view?.profile, handle]);

  if (failed) return fallback;
  const { padX, padTop, padBottom } = FIGURE_VIEW;
  return (
    <canvas
      ref={canvas}
      style={{
        position: "absolute",
        left: `${-padX * 100}%`,
        top: `${-padTop * 100}%`,
        width: `${(1 + 2 * padX) * 100}%`,
        height: `${(1 + padTop + padBottom) * 100}%`,
      }}
    />
  );
}

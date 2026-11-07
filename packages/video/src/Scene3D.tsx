import type { SceneThree } from "@ys/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";
import { WebGLRenderer } from "three";
import { createScene3D } from "./scene3d.ts";

export function Scene3D({ spec, time, progress }: { spec: SceneThree; time: number; progress: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [handle] = useState(() => delayRender(`3D ${spec.preset}`));
  const [world, setWorld] = useState<{ model: ReturnType<typeof createScene3D>; renderer: WebGLRenderer }>();
  useEffect(() => {
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas: canvas.current!, alpha: true, antialias: true, preserveDrawingBuffer: true });
    } catch (error) {
      cancelRender(new Error(`Cannot render 3D illustration ${spec.preset}: ${String(error)}`));
      return;
    }
    renderer.setPixelRatio(1);
    renderer.setSize(Math.ceil(spec.size), Math.ceil(spec.size), false);
    renderer.setClearColor(0, 0);
    const model = createScene3D(spec);
    setWorld({ model, renderer });
    return () => {
      model.dispose();
      renderer.dispose();
    };
  }, [spec]);
  useLayoutEffect(() => {
    if (!world) return;
    world.model.sample(time, progress);
    world.renderer.render(world.model.scene, world.model.camera);
    continueRender(handle);
  }, [world, time, progress, handle]);
  return <canvas data-three={spec.preset} ref={canvas} style={{ position: "absolute", left: spec.x - spec.size / 2, top: spec.y - spec.size / 2, width: spec.size, height: spec.size }} />;
}

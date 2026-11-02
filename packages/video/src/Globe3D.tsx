import type { VectorAssetMeta } from "@ys/core";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { continueRender, delayRender, random } from "remotion";
import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferGeometry,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Points,
  PointsMaterial,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  WebGLRenderer,
} from "three";
import { globeRotation, globeView, HALO, HALO_EDGE } from "./globe.ts";

type Globe = NonNullable<VectorAssetMeta["globe"]>;

/** Haritalar 1920×1080 üretilir; küre de bu tuvalde, SVG'nin izdüşümüyle aynı yerde çizilir. */
const W = 1920;
const H = 1080;

/** Atmosfer: kabuğun iç kenarında (Dünya'ya değdiği yerde) parlak, dışa doğru sönen mavi ışıma. */
const HALO_VERTEX = `varying vec3 vNormal;
void main() {
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const HALO_FRAGMENT = `uniform float edge;
varying vec3 vNormal;
void main() {
  float k = pow(clamp(-vNormal.z / edge, 0.0, 1.0), 1.6);
  gl_FragColor = vec4(0.45, 0.72, 1.0, 1.0) * k * 0.85;
}`;

interface World {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: OrthographicCamera;
  earth: Mesh;
}

/**
 * Küre haritasının three.js ile 3D çizimi: gerçek sınırlardan üretilen eşdikdörtgen doku ışıklı bir küreye sarılır,
 * çevresinde atmosfer, arkada yıldızlar. Ortografik kamera d3'ün ortografik izdüşümüyle aynı görüntüyü verir; küre
 * dönerek gelir ve durduğunda SVG'deki rotalar, işaretler ve etiketler üstüne birebir oturur. three'nin kendi döngüsü
 * yok: her Remotion karesinde elle render edilir. Doku yüklenene kadar render bekler; WebGL açılamazsa katman boş
 * kalır (render düşmez, harita katmanı yine görünür).
 */
export function Globe3D({ globe, p, seed }: { globe: Globe; p: number; seed: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [world, setWorld] = useState<World>();
  const [handle] = useState(() => delayRender("globe"));

  useEffect(() => {
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas: canvas.current!, antialias: true, preserveDrawingBuffer: true });
    } catch {
      continueRender(handle);
      return;
    }
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    const scene = new Scene();
    scene.background = new Color("#0b1324");
    const camera = new OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, 1, 5000);
    camera.position.z = 2000;

    const at: [number, number, number] = [globe.cx - W / 2, H / 2 - globe.cy, 0];
    const earthGeo = new SphereGeometry(globe.r, 128, 96);
    const earthMat = new MeshStandardMaterial({ roughness: 1, metalness: 0 });
    const earth = new Mesh(earthGeo, earthMat);
    earth.position.set(...at);
    const haloGeo = new SphereGeometry(globe.r * HALO, 96, 64);
    const haloMat = new ShaderMaterial({
      uniforms: { edge: { value: HALO_EDGE } },
      vertexShader: HALO_VERTEX,
      fragmentShader: HALO_FRAGMENT,
      side: BackSide,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const halo = new Mesh(haloGeo, haloMat);
    halo.position.set(...at);

    // Yıldızlar: tohumdan sabit, kürenin arkasında.
    const stars = Array.from({ length: 420 }, (_, i) => [(random(`${seed}-star-x-${i}`) - 0.5) * W, (random(`${seed}-star-y-${i}`) - 0.5) * H, -1500]).flat();
    const starGeo = new BufferGeometry();
    starGeo.setAttribute("position", new Float32BufferAttribute(stars, 3));
    const starMat = new PointsMaterial({ color: 0xdfe8ff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0.75 });

    // Güneş sol üstten: sağ altta yumuşak gece tarafı; ortam ışığı haritayı okunur tutar.
    const sun = new DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(-1, 0.8, 1.1);
    scene.add(new Points(starGeo, starMat), new AmbientLight(0xc8d8ff, 1.1), sun, halo, earth);

    let live = true;
    const texture = new TextureLoader().load(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(globe.texture)}`,
      (tex) => {
        if (!live) return;
        tex.colorSpace = SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        earthMat.map = tex;
        earthMat.needsUpdate = true;
        setWorld({ renderer, scene, camera, earth });
      },
      undefined,
      () => continueRender(handle),
    );
    return () => {
      live = false;
      for (const d of [earthGeo, earthMat, haloGeo, haloMat, starGeo, starMat, texture, renderer]) d.dispose();
    };
  }, [globe, seed, handle]);

  useLayoutEffect(() => {
    if (!world) return;
    const view = globeView(globe.lon, globe.lat, p);
    const rot = globeRotation(view.lon, view.lat);
    world.earth.rotation.set(rot.x, rot.y, 0);
    world.renderer.render(world.scene, world.camera);
    continueRender(handle);
  }, [world, globe, p, handle]);

  // Harita SVG'si gibi kadrajı kaplar (dikey videoda yanlardan kırpılır).
  return <canvas ref={canvas} width={W} height={H} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />;
}

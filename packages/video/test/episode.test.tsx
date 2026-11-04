// @vitest-environment happy-dom
import { act, cleanup, render } from "@testing-library/react";
import { Timeline, VectorAsset, type Ambience as AmbienceKind } from "@ys/core";
import type { ReactNode } from "react";
import { random } from "remotion";
import { afterEach, describe, expect, it, vi } from "vitest";

// Remotion bağlamı yerine kare ve video ayarı testten verilir; medya öğeleri ve Sequence düz elemana çevrilir
// (gerçek tarayıcı/ffmpeg yok). Easing, interpolate, random gerçek.
const clock = vi.hoisted(() => ({ frame: 0, fps: 30, width: 1920, height: 1080 }));
const registered = vi.hoisted(() => ({ root: undefined as unknown, compositions: {} as Record<string, Record<string, unknown>> }));
vi.mock("remotion", async (orig) => ({
  ...(await orig<typeof import("remotion")>()),
  useCurrentFrame: () => clock.frame,
  useVideoConfig: () => ({ fps: clock.fps, width: clock.width, height: clock.height, durationInFrames: 300 }),
  staticFile: (p: string) => `/public/${p}`,
  Sequence: (p: { from: number; durationInFrames: number; name: string; children: ReactNode }) => (
    <section data-from={p.from} data-duration={p.durationInFrames} data-name={p.name}>
      {p.children}
    </section>
  ),
  Img: (p: { src: string; style: object }) => <img data-kind="img" src={p.src} style={p.style} />,
  OffthreadVideo: (p: { src: string; muted: boolean; playbackRate: number }) => (
    <video data-kind="video" src={p.src} muted={p.muted} data-rate={p.playbackRate} />
  ),
  Audio: (p: { src: string; volume: number }) => <audio data-kind="audio" src={p.src} data-volume={p.volume} />,
  Composition: (p: Record<string, unknown>) => {
    registered.compositions[p.id as string] = p;
    return null;
  },
  registerRoot: (root: unknown) => {
    registered.root = root;
  },
}));

// PixiJS (WebGL) yerine kayıt tutan sahte uygulama ve kalem: happy-dom'da WebGL yok.
const pixi = vi.hoisted(() => ({ fail: false, apps: [] as { render: () => void; destroy: () => void }[], pens: [] as { calls: string[]; blendMode: string }[] }));
vi.mock("pixi.js", () => {
  class Graphics {
    calls: string[] = [];
    blendMode = "normal";
    constructor() {
      pixi.pens.push(this);
    }
  }
  for (const m of ["clear", "moveTo", "lineTo", "circle", "ellipse", "poly", "fill", "stroke"])
    Object.defineProperty(Graphics.prototype, m, {
      value(this: Graphics) {
        this.calls.push(m);
        return this;
      },
    });
  class Application {
    stage = { addChild: vi.fn() };
    render = vi.fn();
    destroy = vi.fn();
    constructor() {
      pixi.apps.push(this);
    }
    init() {
      return pixi.fail ? Promise.reject(new Error("WebGL yok")) : Promise.resolve();
    }
  }
  return { Application, Graphics };
});

const { Episode } = await import("../src/index.ts");
const { EpisodeAudio } = await import("../src/Episode.tsx");
const { Ambience } = await import("../src/Ambience.tsx");
const { Thumbnail } = await import("../src/Thumbnail.tsx");
const { CROSSFADE, SCENE_CUT } = await import("../src/cut.ts");
type ThumbnailProps = import("../src/Thumbnail.tsx").ThumbnailProps;

afterEach(() => {
  cleanup();
  clock.frame = 0;
  pixi.fail = false;
  pixi.apps.length = 0;
  pixi.pens.length = 0;
});

const draw = (node: ReactNode, frame = 0) => {
  clock.frame = frame;
  return render(<>{node}</>).container;
};

describe("atmosfer katmanları", () => {
  const amb = (kind: AmbienceKind, frame = 0, seed = "a1") => draw(<Ambience kind={kind} seed={seed} />, frame);

  it("none hiçbir şey çizmez", () => {
    expect(amb("none").innerHTML).toBe("");
  });

  it("parçacıklı atmosfer Pixi tuvaline çizilir: her karede yeniden çizilip elle render edilir", async () => {
    const c = amb("rain", 0);
    await act(async () => {});
    expect(c.querySelector("canvas")).toBeTruthy();
    expect((c.firstElementChild as HTMLElement).style.background).toContain("rgba(20, 30, 45, 0.18)");
    const [app] = pixi.apps;
    const [pen] = pixi.pens;
    expect(app!.render).toHaveBeenCalledTimes(1);
    expect(pen!.calls.filter((m) => m === "stroke")).toHaveLength(550 + 70);
    expect(pen!.blendMode).toBe("normal");
    cleanup();
    expect(app!.destroy).toHaveBeenCalled();
  });

  it("toz ve kıvılcım ekleyerek karışır; kar ve konfeti düz", async () => {
    for (const kind of ["dust", "embers", "snow", "confetti"] as const) {
      const c = amb(kind);
      await act(async () => {});
      expect(pixi.pens.at(-1)!.blendMode).toBe(kind === "dust" || kind === "embers" ? "add" : "normal");
      expect((c.firstElementChild as HTMLElement).style.mixBlendMode).toBe(kind === "dust" || kind === "embers" ? "screen" : "");
      cleanup();
    }
  });

  it("Pixi hazır olmadan kapanan katman uygulamayı sonradan yok eder; WebGL açılamazsa katman boş kalır", async () => {
    amb("snow");
    cleanup();
    await act(async () => {});
    expect(pixi.apps[0]!.destroy).toHaveBeenCalled();
    expect(pixi.pens).toHaveLength(0);
    pixi.fail = true;
    const c = amb("snow");
    await act(async () => {});
    expect(c.querySelector("canvas")).toBeTruthy();
    expect(pixi.pens).toHaveLength(0);
    cleanup();
    expect(pixi.apps[1]!.destroy).not.toHaveBeenCalled();
  });

  it("sis iki katman zıt yönlerde kayar", () => {
    const c = amb("fog", 60, "f");
    const layers = [...c.querySelectorAll("div")].filter((d) => d.style.width === "200%") as HTMLElement[];
    expect(layers).toHaveLength(2);
    const t = 2;
    const offset = random("f-fog") * 100;
    expect(parseFloat(layers[0]!.style.transform.slice("translateX(".length))).toBeCloseTo(Math.sin((t + offset) * 0.07) * 12);
    expect(parseFloat(layers[1]!.style.transform.slice("translateX(".length))).toBeCloseTo(Math.sin((t + offset) * -0.05) * 12);
  });

  it("titreme ışığı ve gölgeyi zıt yönde oynatır", () => {
    const c = amb("flicker", 15, "m");
    const [light, shade] = [...c.querySelectorAll("div")].filter((d) => d.style.background.includes("radial-gradient")) as HTMLElement[];
    const t = 0.5;
    const p = random("m-flicker") * 10;
    const n = Math.sin((t + p) * 7.3) * 0.5 + Math.sin((t + p) * 13.1) * 0.3 + Math.sin((t + p) * 2.1) * 0.2;
    expect(Number(light!.style.opacity)).toBeCloseTo(0.6 + n * 0.4);
    expect(Number(shade!.style.opacity)).toBeCloseTo(0.55 - n * 0.3);
  });

  it("ışık huzmeleri tohuma göre soldan ya da sağdan, altı huzmeyle gelir", () => {
    const seeds = Array.from({ length: 20 }, (_, i) => `r${i}`);
    const left = seeds.find((s) => random(`${s}-rays`) < 0.5)!;
    const right = seeds.find((s) => random(`${s}-rays`) >= 0.5)!;
    const bg = (seed: string) => {
      const el = amb("rays", 0, seed).firstElementChild as HTMLElement;
      const style = el.getAttribute("style")!;
      cleanup();
      return style;
    };
    const l = bg(left);
    expect(l).toContain("conic-gradient(at -10% -15%");
    expect(l).toContain("circle at 0% 0%");
    expect(l.match(/rgba\(255,238,195/g)).toHaveLength(6);
    const r = bg(right);
    expect(r).toContain("conic-gradient(at 110% -15%");
    expect(r).toContain("circle at 100% 0%");
  });
});

const hero = VectorAsset.parse({
  id: "hero",
  kind: "prop",
  svg: '<svg viewBox="0 0 100 100"><rect id="box" width="100" height="100" fill="#ff0000"/></svg>',
  width: 100,
  height: 100,
});

const timeline = (over: object = {}) =>
  Timeline.parse({
    episodeId: "e1",
    lang: "tr",
    durationInFrames: 300,
    visuals: [],
    audio: [],
    ...over,
  });

const shot = (shotId: string, kind: string, extra: object = {}) => ({
  shotId,
  assetUrl: `${shotId}.png`,
  kind,
  fromFrame: 0,
  durationInFrames: 100,
  ...extra,
});

describe("bölüm kompozisyonu", () => {
  const imgTransform = (c: HTMLElement) => (c.querySelector('[data-kind="img"]') as HTMLElement).style.transform;

  it("çekimler sırayla dizilir, sonuncu hariç hepsi sonrakinin geçişi kadar uzar: sahne içinde kısa, sahne değişince uzun", () => {
    const c = draw(
      <Episode
        timeline={timeline({
          visuals: [shot("s1-sh1", "still_motion", { fromFrame: 0 }), shot("s1-sh2", "ai_clip", { fromFrame: 100 }), shot("s2-sh1", "still_motion", { fromFrame: 200 })],
        })}
      />,
    );
    const seq = [...c.querySelectorAll("section")].map((s) => [s.dataset.name, s.dataset.from, s.dataset.duration]);
    expect(seq).toEqual([
      ["s1-sh1", "0", String(100 + CROSSFADE)],
      ["s1-sh2", "100", String(100 + SCENE_CUT.frames)],
      ["s2-sh1", "200", "100"],
    ]);
    expect((c.firstElementChild as HTMLElement).style.backgroundColor).toBe("black");
  });

  it("çekim geçişte yumuşakça belirir; ilk çekim solmaz, video siyahtan açılmaz", () => {
    const fade = (frame: number, nth = 1) => {
      const c = draw(<Episode timeline={timeline({ visuals: [shot("s1-sh1", "still_motion"), shot("s1-sh2", "still_motion", { fromFrame: 100 })] })} />, frame);
      const el = c.querySelectorAll("section")[nth]!.firstElementChild as HTMLElement;
      const o = el.style.opacity;
      cleanup();
      // Biçem yoksa (ilk çekim, geçiş bitti) tam görünür.
      return o === "" ? 1 : Number(o);
    };
    expect(fade(0, 0)).toBe(1);
    expect(fade(0)).toBe(0);
    expect(fade(4)).toBeCloseTo(0.5);
    expect(fade(20)).toBe(1);
  });

  it("sahne değişince gelen çekim silinerek, kayarak, daireyle ya da yakınlaşarak gelir; geçiş bitince biçem kalmaz", () => {
    const style = (frame: number) => {
      const c = draw(<Episode timeline={timeline({ visuals: [shot("s1-sh1", "still_motion"), shot("s2-sh1", "still_motion", { fromFrame: 100 })] })} />, frame);
      const el = c.querySelectorAll("section")[1]!.firstElementChild as HTMLElement;
      const s = { clip: el.style.clipPath, transform: el.style.transform, opacity: el.style.opacity };
      cleanup();
      return s;
    };
    const mid = style(SCENE_CUT.frames / 2);
    expect(mid.clip || mid.transform).not.toBe("");
    expect(style(SCENE_CUT.frames + 2)).toEqual({ clip: "", transform: "", opacity: "" });
  });

  it("durağan kare varsayılan olarak yavaşça yakınlaşır (ken burns)", () => {
    const at = (frame: number, motion?: object) => {
      const c = draw(<Episode timeline={timeline({ visuals: [shot("a", "still_motion", motion ? { motion } : {})] })} />, frame);
      const r = { transform: imgTransform(c), src: c.querySelector("img")!.getAttribute("src") };
      cleanup();
      return r;
    };
    expect(at(0)).toEqual({ transform: "scale(1) translateX(0%)", src: "/public/a.png" });
    expect(at(100).transform).toBe("scale(1.12) translateX(0%)");
    expect(at(100, { type: "none" }).transform).toBe("scale(1) translateX(0%)");
    // Kaydırma büyütmenin açtığı payla sınırlı.
    const pan = /^scale\(1\.2\) translateX\(([\d.]+)%\)$/.exec(at(100, { type: "ken_burns", zoomFrom: 1, zoomTo: 1.2, panX: 1 }).transform);
    expect(Number(pan![1])).toBeCloseTo((0.5 * 0.2 * 100) / 1.2);
  });

  it("durağan kareye atmosfer katmanı eklenir", () => {
    const c = draw(<Episode timeline={timeline({ visuals: [shot("a", "still_motion", { ambience: "rain" })] })} />);
    expect(c.querySelector("canvas")).toBeTruthy();
  });

  it("video klip sessiz ve hızıyla oynatılır; http adresi olduğu gibi kullanılır", () => {
    const c = draw(<Episode timeline={timeline({ visuals: [shot("a", "ai_clip", { assetUrl: "https://cdn.example/a.mp4", playbackRate: 1.5 })] })} />);
    const v = c.querySelector("video")!;
    expect(v.getAttribute("src")).toBe("https://cdn.example/a.mp4");
    expect(v.dataset.rate).toBe("1.5");
    expect(v.muted).toBe(true);
  });

  it("vektör çekim sahne tarifinden çizilir; tarifsiz grafik klip gibi oynatılır", () => {
    const vector = { layers: [{ asset: "hero", x: 960, y: 500, height: 200 }] };
    const c = draw(
      <Episode
        timeline={timeline({
          vectorAssets: { hero },
          visuals: [shot("v", "motion_graphic", { vector, ambience: "snow" }), shot("w", "motion_graphic", { fromFrame: 100 })],
        })}
      />,
    );
    const [v, w] = [...c.querySelectorAll("section")];
    expect(v!.querySelector('[id="v-0-box"]')).toBeTruthy();
    expect(v!.querySelector("canvas")).toBeTruthy();
    expect(v!.querySelector("video")).toBeNull();
    expect(w!.querySelector("video")!.getAttribute("src")).toBe("/public/w.png");
  });

  it("Manim tahtası vektör sahnenin üstünde, ortada bir panelde oynar; dikey videoda genişliğe sığar", () => {
    const board = (frame: number) => {
      const c = draw(<Episode timeline={timeline({ vectorAssets: { hero }, visuals: [shot("v", "motion_graphic", { vector: {}, overlay: "library/math/b.webm" })] })} />, frame);
      const el = c.querySelector("[data-board]") as HTMLElement;
      const r = { el, video: el.querySelector("video")!.getAttribute("src"), opacity: el.style.opacity };
      cleanup();
      return r;
    };
    expect(board(0)).toMatchObject({ video: "/public/library/math/b.webm", opacity: "0" });
    const shown = board(20);
    expect(shown.opacity).toBe("1");
    expect([shown.el.style.left, shown.el.style.top, shown.el.style.width, shown.el.style.height]).toEqual(["440px", "250px", "1040px", "560px"]);
    // Tahtasız vektör çekimde panel yok.
    expect(draw(<Episode timeline={timeline({ vectorAssets: { hero }, visuals: [shot("v", "motion_graphic", { vector: {} })] })} />).querySelector("[data-board]")).toBeNull();
    cleanup();
    Object.assign(clock, { width: 1080, height: 1920 });
    const tall = board(20).el;
    // Dikeyde sahne 0,73125 ölçekle ortalanır (x -162, y 565,1); tahta onunla hizalı ve sağdaki düğme şeridinin solunda.
    expect(parseFloat(tall.style.left)).toBeCloseTo(-162 + 440 * 0.73125, 2);
    expect(parseFloat(tall.style.top)).toBeCloseTo(565.125 + 250 * 0.73125, 2);
    expect(parseFloat(tall.style.width)).toBeCloseTo(1040 * 0.73125, 2);
    expect(parseFloat(tall.style.left) + parseFloat(tall.style.width)).toBeLessThan(1080 - 150);
    Object.assign(clock, { width: 1920, height: 1080 });
  });

  it("ses parçaları rolüne göre sıralanır ve sesi ayarlanır", () => {
    const c = draw(
      <Episode
        timeline={timeline({
          audio: [
            { role: "voice", assetUrl: "voice.mp3", fromFrame: 0, durationInFrames: 300 },
            { role: "music", assetUrl: "https://x/m.mp3", fromFrame: 10, durationInFrames: 200, volume: 0.2 },
          ],
        })}
      />,
    );
    const seq = [...c.querySelectorAll("section")].map((s) => [s.dataset.name, s.dataset.from, s.dataset.duration]);
    expect(seq).toEqual([
      ["voice", "0", "300"],
      ["music", "10", "200"],
    ]);
    const audio = [...c.querySelectorAll("audio")].map((a) => [a.getAttribute("src"), a.dataset.volume]);
    expect(audio).toEqual([
      ["/public/voice.mp3", "1"],
      ["https://x/m.mp3", "0.2"],
    ]);
  });

  it("altyazı konuşulan kelimeyi vurgular, konuşma yokken gizlenir", () => {
    const captions = [
      { text: "Merhaba", startMs: 1000, endMs: 1500 },
      { text: "dünya", startMs: 1500, endMs: 2000 },
    ];
    const at = (frame: number) => {
      const c = draw(<Episode timeline={timeline({ captions })} />, frame);
      const spans = [...c.querySelectorAll("span")].map((s) => [s.textContent, (s as HTMLElement).style.color]);
      cleanup();
      return spans;
    };
    expect(at(0)).toEqual([]); // konuşma başlamadı
    // 1,2 sn: ilk kelime; 1,6 sn: ikinci kelime konuşuluyor.
    expect(at(36)).toEqual([
      ["Merhaba", "#FFD84D"],
      [" dünya", "white"],
    ]);
    expect(at(48)).toEqual([
      ["Merhaba", "white"],
      [" dünya", "#FFD84D"],
    ]);
    expect(at(61)).toEqual([]); // konuşma bitti
  });

  it("dikey videoda altyazı platformun alt arayüzünün üstünde ve sağdaki düğmelerden uzakta", () => {
    const captions = [{ text: "Merhaba", startMs: 0, endMs: 2000 }];
    const box = () => {
      const span = draw(<Episode timeline={timeline({ captions })} />, 10).querySelector("span")!;
      const r = { pad: (span.parentElement!.parentElement as HTMLElement).style.paddingBottom, width: (span.parentElement as HTMLElement).style.maxWidth };
      cleanup();
      return r;
    };
    expect(box()).toEqual({ pad: "90px", width: "80%" });
    Object.assign(clock, { width: 1080, height: 1920 });
    expect(box()).toEqual({ pad: "440px", width: "760px" });
    Object.assign(clock, { width: 1920, height: 1080 });
  });

  it("altyazı yoksa altyazı katmanı da yoktur", () => {
    const c = draw(<Episode timeline={timeline()} />);
    expect(c.firstElementChild!.childElementCount).toBe(0);
  });
});

describe("Remotion kökü", () => {
  it("giriş dosyası kökü kaydeder; kompozisyon süre ve boyutu timeline'dan alır", async () => {
    await import("../src/entry.ts");
    const { Root } = await import("../src/Root.tsx");
    expect(registered.root).toBe(Root);
    render(<Root />);
    const comp = registered.compositions.Episode!;
    expect(comp.id).toBe("Episode");
    expect(comp.component).toBe(Episode);
    expect([comp.durationInFrames, comp.fps, comp.width, comp.height]).toEqual([90, 30, 1920, 1080]);
    expect((comp.defaultProps as { timeline: Timeline }).timeline.episodeId).toBe("placeholder");
    const meta = (comp.calculateMetadata as (a: { props: { timeline: Timeline } }) => object)({
      props: { timeline: timeline({ fps: 24, width: 1080, height: 1920, durationInFrames: 1234 }) },
    });
    expect(meta).toEqual({ durationInFrames: 1234, fps: 24, width: 1080, height: 1920 });
    // Yalnız ses izi (render önbelleği sesi bundan render eder): bölümle aynı süre ve kare hızı.
    const sound = registered.compositions.EpisodeAudio!;
    expect(sound.component).toBe(EpisodeAudio);
    expect((sound.calculateMetadata as (a: { props: { timeline: Timeline } }) => object)({ props: { timeline: timeline({ fps: 24, width: 1080, height: 1920, durationInFrames: 1234 }) } })).toEqual(meta);
    // Küçük resim kompozisyonu: 1280×720, süre seçilen çekimin süresi (bilinmeyen çekimde 1 kare).
    const thumb = registered.compositions.Thumbnail!;
    expect([thumb.width, thumb.height, thumb.durationInFrames]).toEqual([1280, 720, 1]);
    const thumbMeta = thumb.calculateMetadata as (a: { props: { timeline: Timeline; shotId: string } }) => object;
    const tl = timeline({ fps: 25, visuals: [shot("a", "still_motion", { durationInFrames: 77 })] });
    expect(thumbMeta({ props: { timeline: tl, shotId: "a" } })).toEqual({ durationInFrames: 77, fps: 25, width: 1280, height: 720 });
    expect(thumbMeta({ props: { timeline: tl, shotId: "yok" } })).toMatchObject({ durationInFrames: 1 });
    // 3D figür önizlemesi: tek kare, kenar paylı figür tuvali; varsayılan tarif geçerli.
    const figure = registered.compositions.Figure!;
    expect([figure.width, figure.height, figure.durationInFrames]).toEqual([520, 864, 1]);
    expect((figure.defaultProps as { figure: { finish: string } }).figure.finish).toBe("matte");
  });
});

describe("küçük resim", () => {
  const thumb = (props: Partial<ThumbnailProps> & { timeline: Timeline }) => draw(<Thumbnail shotId="v" side="left" title="Google nasıl doğdu" {...props} />, 80);

  it("vektör çekim arka planda, kendi yazıları olmadan; başlık yazıldığı gibi (büyük harfe çevrilmez), kişinin karşı yanında", () => {
    const vector = { layers: [{ asset: "hero", x: 1400, y: 500, height: 200 }], texts: [{ text: "Bilgi kartı", x: 100, y: 100 }] };
    const c = thumb({ timeline: timeline({ vectorAssets: { hero }, palette: ["#111111", "#222222", "#7bd389"], visuals: [shot("v", "motion_graphic", { vector })] }) });
    expect(c.querySelector('[id="v-0-box"]')).toBeTruthy();
    expect(c.textContent).not.toContain("Bilgi kartı");
    const title = c.querySelector("[data-title]") as HTMLElement;
    expect(title.textContent).toBe("Google nasıl doğdu");
    expect([title.style.left, title.style.textAlign]).toEqual(["56px", "left"]);
    expect((title.lastElementChild as HTMLElement).style.background).toBe("#7bd389");
    cleanup();
    // Sağdaki başlıkta vurgu çizgisi sağa yaslı; vurgu rengi yoksa sarı.
    const right = thumb({ side: "right", title: "Microsoft", timeline: timeline({ vectorAssets: { hero }, visuals: [shot("v", "motion_graphic", { vector: {} })] }) });
    const t2 = right.querySelector("[data-title]") as HTMLElement;
    expect(t2.textContent).toBe("Microsoft");
    expect([t2.style.right, t2.style.textAlign, (t2.lastElementChild as HTMLElement).style.marginLeft]).toEqual(["56px", "right", "auto"]);
    expect((t2.lastElementChild as HTMLElement).style.background).toBe("#ffd84d");
    cleanup();
    // Alt orta: iki yandan pay, ortalı yazı ve ortalı çizgi.
    const low = thumb({ side: "bottom", timeline: timeline({ vectorAssets: { hero }, visuals: [shot("v", "motion_graphic", { vector: {} })] }) });
    const t3 = low.querySelector("[data-title]") as HTMLElement;
    expect([t3.style.left, t3.style.right, t3.style.bottom, t3.style.textAlign]).toEqual(["56px", "56px", "48px", "center"]);
    expect([(t3.lastElementChild as HTMLElement).style.marginLeft, (t3.lastElementChild as HTMLElement).style.marginRight]).toEqual(["auto", "auto"]);
  });

  it("durağan kare görsel olarak çizilir; çekim yoksa yalnız başlık", () => {
    const c = thumb({ shotId: "a", timeline: timeline({ visuals: [shot("a", "still_motion")] }) });
    expect(c.querySelector("img")!.getAttribute("src")).toBe("/public/a.png");
    cleanup();
    const none = thumb({ shotId: "yok", timeline: timeline() });
    expect(none.querySelector("img")).toBeNull();
    expect(none.querySelector("[data-title]")).toBeTruthy();
  });
});

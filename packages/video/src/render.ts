import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { openBrowser, renderMedia, renderStill, selectComposition, type OpenGlRenderer } from "@remotion/renderer";
import type { FigureSpec, Timeline } from "@ys/core";
import { runMediaTool } from "./tools.ts";

export { THUMB, thumbnailShot, thumbnailTitle } from "./thumbnail.ts";
import type { ThumbnailSide } from "./thumbnail.ts";

export const ENTRY = resolve(dirname(fileURLToPath(import.meta.url)), "entry.ts");

export interface RenderOptions {
  timeline: Timeline;
  /** Timeline'daki göreli varlık yollarının (staticFile) çözüleceği klasör. */
  publicDir: string;
  outputPath: string;
  onProgress?: (fraction: number) => void;
  /** Başka bir süreç render ederken sıra beklenmeye başlanınca bir kez çağrılır. */
  onWait?: (holderPid: number) => void;
  /** Geçici hatadan sonra render baştan alınırken çağrılır (neden). */
  onRetry?: (reason: string) => void;
  concurrency?: number;
  /** OffthreadVideo kare önbelleği. */
  videoCacheBytes?: number;
}

/**
 * Remotion varsayılanı sistem belleğinin yarısı; 32 iş parçacıklı Windows makinede 16 paralel
 * sekmeyle commit sınırına çarpıp compositor'ı çökertti (29 Eki gerçek render, %50'de).
 */
const DEFAULT_VIDEO_CACHE_BYTES = 2 * 1024 ** 3;

/**
 * Tarayıcı kurulumu ve sayfa yüklemesi için süre. Remotion varsayılanı 30 sn; makine yükteyken (iki bölüm + paralel
 * Claude Code süreçleri) "Timed out after 30000ms while setting up the headless browser" ile aşama düşüyordu (30 Eki).
 */
const BROWSER_TIMEOUT_MS = 120_000;
const MAX_DEFAULT_CONCURRENCY = 8;

const GL_BACKENDS: readonly OpenGlRenderer[] = ["angle", "swangle", "egl", "swiftshader", "vulkan", "angle-egl"];
/** Ekran kartı yoksa ya da sürücü sorun çıkarırsa: her makinede çalışan yazılım GL (SwiftShader, ANGLE üzerinden). */
export const SOFTWARE_GL: OpenGlRenderer = "swangle";

/**
 * Chrome'un çizim arka ucu. Varsayılan "angle": ekran kartı (3 Kas ölçümü, 90 karelik çekim: vektör sahne 12,2 → 7,5 sn,
 * 3D figürlü sahne 56 → 8,2 sn; yazılım GL'de figür 4,6 kat yavaştı). `YS_RENDER_GL` ile değişir (bilinmeyen değer
 * varsayılana döner). Ekran kartıyla render tarayıcı/GPU hatasıyla düşerse bir kez yazılım GL ile baştan alınır.
 */
export function renderGl(env = process.env.YS_RENDER_GL): OpenGlRenderer {
  return GL_BACKENDS.find((g) => g === env) ?? "angle";
}

/** Ekran kartı ya da tarayıcı çöktü: yazılım GL ile yeniden denemeye değer. */
export const isGpuFailure = (e: unknown) =>
  e instanceof Error && /\bGPU\b|WebGL|context lost|Target closed|Session closed|Page crashed|crashed/i.test(e.message);

/**
 * Geçici dosya hatası (klasör/dosya kayboldu, kilitli) veya tarayıcı kurulumu zaman aşımı: aynı render'ı tekrar denemek
 * güvenli. 30 Eki: %90'dan sonra ses karıştırmada Temp altındaki "remotion-audio-mixing" klasörü kaybolunca 17 dk'lık
 * render boşa gitti.
 */
export const isTransientRenderFailure = (e: unknown) =>
  e instanceof Error && /No such file or directory|ENOENT|EBUSY|EPERM|while setting up the headless browser/i.test(e.message);

/**
 * Remotion geçici klasörlerini os.tmpdir() altında açar; Windows'ta sistem Temp'i dışarıdan temizlenebiliyor. Render
 * süresince Temp çıktının yanındaki klasöre yönlendirilir (os.tmpdir() her çağrıda TEMP/TMP'yi okur).
 */
async function withTempDir<R>(dir: string, fn: () => Promise<R>): Promise<R> {
  await mkdir(dir, { recursive: true });
  const keys = process.platform === "win32" ? ["TEMP", "TMP"] : ["TMPDIR"];
  const saved = keys.map((k) => process.env[k]);
  for (const k of keys) process.env[k] = dir;
  try {
    return await fn();
  } finally {
    keys.forEach((k, i) => (saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])));
    await rm(dir, { recursive: true, force: true, maxRetries: 3 }).catch(() => {});
  }
}

/** Makinedeki render kilidi; yol modül yüklenirken alınır (render sırasında TEMP yönlendirilir). */
const RENDER_LOCK = process.env.YS_RENDER_LOCK ?? join(tmpdir(), "ys-render.lock");
const LOCK_POLL_MS = 5000;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Makinede aynı anda tek Remotion işi (render ya da kare çıkarma). İki bölüm aynı anda render'a girince yeni başlayan
 * süreç ilk saniyelerde düşüyordu ("write EOF" ya da sessizce; 30 Eki): iki Remotion aynı webpack önbelleğini, port
 * aralığını ve 8'er Chrome sekmesini paylaşıyor. Kilidin sahibi ölmüşse kilit bayattır.
 */
export async function withRenderLock<R>(fn: () => Promise<R>, onWait?: (holderPid: number) => void): Promise<R> {
  const token = (await acquireRenderLock(onWait, false))!;
  try {
    return await fn();
  } finally {
    await releaseRenderLock(token);
  }
}

/**
 * Makine boşsa kilidi alıp çalıştırır; başka bir süreç render ediyorsa beklemeden undefined döner. Yardımcı işler için
 * (3D figür önizlemesi): uzun bir bölüm render'ının bitmesini beklemek konsept aşamasını yarım saat durdururdu.
 */
export async function ifRenderFree<R>(fn: () => Promise<R>): Promise<R | undefined> {
  const token = await acquireRenderLock(undefined, true);
  if (!token) return undefined;
  try {
    return await fn();
  } finally {
    await releaseRenderLock(token);
  }
}

/** Kilidi alır ve sahiplik belirtecini döner; `skipIfBusy` iken canlı bir sahip varsa undefined. */
async function acquireRenderLock(onWait: ((holderPid: number) => void) | undefined, skipIfBusy: boolean): Promise<string | undefined> {
  const token = `${process.pid}:${randomUUID()}`;
  let waiting = false;
  let empty = 0;
  for (;;) {
    try {
      const fh = await open(RENDER_LOCK, "wx");
      await fh.writeFile(token);
      await fh.close();
      return token;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const holder = Number((await readFile(RENDER_LOCK, "utf8").catch(() => "")).split(":")[0]);
      // Boş dosya: sahibi henüz yazmadı, kısa beklenir; uzun süre boş kaldıysa sahibi yazamadan öldü.
      empty = holder ? 0 : empty + 1;
      if ((holder && !alive(holder)) || empty > 50) {
        empty = 0;
        await rm(RENDER_LOCK, { force: true });
        continue;
      }
      if (holder && skipIfBusy) return undefined;
      if (!waiting && holder) onWait?.(holder);
      waiting ||= Boolean(holder);
      await new Promise((r) => setTimeout(r, holder ? LOCK_POLL_MS : 200));
    }
  }
}

async function releaseRenderLock(token: string): Promise<void> {
  if ((await readFile(RENDER_LOCK, "utf8").catch(() => "")) === token) await rm(RENDER_LOCK, { force: true });
}

/** Timeline'ı yerelde MP4'e render eder (Remotion; ≤3 kişilik ekipte lisans ücretsiz). Geçici hatada bir kez yeniden dener. */
export async function renderEpisode(opts: RenderOptions): Promise<string> {
  const tempDir = join(dirname(resolve(opts.outputPath)), ".render-tmp");
  return withRenderLock(async () => {
    let gl = renderGl();
    for (let attempt = 0; ; attempt++) {
      try {
        return await withTempDir(tempDir, () => renderOnce(opts, gl));
      } catch (e) {
        if (attempt >= 1) throw e;
        if (gl !== SOFTWARE_GL && isGpuFailure(e)) gl = SOFTWARE_GL;
        else if (!isTransientRenderFailure(e)) throw e;
        // split en az bir parça döndürür; "?? ''" yalnız tip için (at() tipte undefined dönebilir).
        /* v8 ignore next */
        opts.onRetry?.((e as Error).message.split("\n").at(-1) ?? "");
      }
    }
  }, opts.onWait);
}

async function renderOnce(opts: RenderOptions, gl: OpenGlRenderer): Promise<string> {
  // Göreli publicDir ile bundle sunucusu görselleri çözemiyor ("source image cannot be decoded").
  const serveUrl = await bundle({ entryPoint: ENTRY, publicDir: resolve(opts.publicDir) });
  const inputProps = { timeline: opts.timeline };
  const chromiumOptions = { gl };
  const composition = await selectComposition({ serveUrl, id: "Episode", inputProps, chromiumOptions });

  // Uzantı ne olursa olsun ham dosya ayrı: aynı yol olursa ffmpeg kendi girdisinin üstüne yazar, rm sonucu siler.
  const rawPath = `${opts.outputPath.replace(/\.mp4$/i, "")}.raw.mp4`;
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: "h264",
    outputLocation: rawPath,
    chromiumOptions,
    concurrency:
      opts.concurrency ?? Math.max(1, Math.min(MAX_DEFAULT_CONCURRENCY, Math.floor(availableParallelism() / 2))),
    timeoutInMilliseconds: BROWSER_TIMEOUT_MS,
    offthreadVideoCacheSizeInBytes: opts.videoCacheBytes ?? DEFAULT_VIDEO_CACHE_BYTES,
    onProgress: ({ progress }) => opts.onProgress?.(progress),
  });

  await normalizeLoudness(rawPath, opts.outputPath);
  await rm(rawPath, { force: true });
  return opts.outputPath;
}

/**
 * YouTube oynatımı -14 LUFS'a göre ayarlar; daha sessiz video rakiplerinden kısık duyulur
 * (29 Eki ilk bölüm -18,7 LUFS çıktı). Görüntü yeniden kodlanmaz.
 */
export async function normalizeLoudness(input: string, output: string): Promise<void> {
  await runMediaTool("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    input,
    "-c:v",
    "copy",
    "-af",
    "loudnorm=I=-14:TP=-1.5:LRA=11",
    "-ar",
    "48000",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    output,
  ]);
}

export interface StillsOptions {
  timeline: Timeline;
  publicDir: string;
  /** Çıkarılacak kareler: dosya adı → kare numarası. */
  frames: Record<string, number>;
  outDir: string;
  onWait?: (holderPid: number) => void;
}

/**
 * Timeline'dan tek tek kareler (JPEG) çıkarır; inceleme aşaması ve stüdyo küçük resimleri için.
 * Bundle bir kez yapılır, kareler sırayla alınır (render'a göre çok hafif).
 */
export function renderStills(opts: StillsOptions): Promise<Record<string, string>> {
  return withRenderLock(() => stillsOnce(opts), opts.onWait);
}

async function stillsOnce(opts: StillsOptions): Promise<Record<string, string>> {
  const serveUrl = await bundle({ entryPoint: ENTRY, publicDir: resolve(opts.publicDir) });
  const inputProps = { timeline: opts.timeline };
  // Tek tarayıcı bütün kareler için: önceden her kare ayrı Chrome açıyordu (30+ açılış); yükte biri zaman aşımına düşünce
  // tüm aşama düşüyordu.
  const browser = await openBrowser("chrome", { chromiumOptions: { gl: renderGl() } });
  try {
    const composition = await selectComposition({ serveUrl, id: "Episode", inputProps, puppeteerInstance: browser, timeoutInMilliseconds: BROWSER_TIMEOUT_MS });
    const out: Record<string, string> = {};
    for (const [name, frame] of Object.entries(opts.frames)) {
      const output = join(opts.outDir, `${name}.jpg`);
      const still = () =>
        renderStill({
          serveUrl,
          composition,
          inputProps,
          frame,
          output,
          imageFormat: "jpeg",
          jpegQuality: 80,
          scale: 0.5,
          puppeteerInstance: browser,
          timeoutInMilliseconds: BROWSER_TIMEOUT_MS,
        });
      // Takılan tek kare bir kez yeniden denenir.
      await still().catch(still);
      out[name] = output;
    }
    return out;
  } finally {
    await browser.close({ silent: true }).catch(() => {});
  }
}
export interface ThumbnailOptions {
  timeline: Timeline;
  publicDir: string;
  shotId: string;
  side: ThumbnailSide;
  title: string;
  /** JPEG yolu. */
  output: string;
  onWait?: (holderPid: number) => void;
}

/** Bölümün küçük resmi (1280×720 JPEG): "Thumbnail" kompozisyonundan tek kare, render kilidinin içinde. */
export function renderThumbnail(opts: ThumbnailOptions): Promise<string> {
  return withRenderLock(async () => {
    const serveUrl = await bundle({ entryPoint: ENTRY, publicDir: resolve(opts.publicDir) });
    const inputProps = { timeline: opts.timeline, shotId: opts.shotId, side: opts.side, title: opts.title };
    const chromiumOptions = { gl: renderGl() };
    const composition = await selectComposition({ serveUrl, id: "Thumbnail", inputProps, chromiumOptions, timeoutInMilliseconds: BROWSER_TIMEOUT_MS });
    await renderStill({
      serveUrl,
      composition,
      inputProps,
      // Çekimin %80'i: giriş animasyonları bitmiş, kamera yaklaşmış.
      frame: Math.floor((composition.durationInFrames - 1) * 0.8),
      output: opts.output,
      imageFormat: "jpeg",
      jpegQuality: 92,
      chromiumOptions,
      timeoutInMilliseconds: BROWSER_TIMEOUT_MS,
    });
    return opts.output;
  }, opts.onWait);
}

export interface FigurePreviewOptions {
  /** Ad → figür tarifi; her biri `<ad>.png` olur. */
  figures: Record<string, FigureSpec>;
  outDir: string;
}

/**
 * 3D figürlerin önizlemesi (Stüdyo: konsept kartı, karakter bankası, stil galerisi): "Figure" kompozisyonundan saydam
 * PNG, hafif dönük duruşta. Tek paket ve tek tarayıcı bütün figürler için. Makine başka render yapıyorsa beklemez,
 * undefined döner (önizleme sonraki aşamada tamamlanır).
 */
export function renderFigurePreviews(opts: FigurePreviewOptions): Promise<Record<string, string> | undefined> {
  return ifRenderFree(async () => {
    const serveUrl = await bundle({ entryPoint: ENTRY });
    const browser = await openBrowser("chrome", { chromiumOptions: { gl: renderGl() } });
    try {
      const out: Record<string, string> = {};
      for (const [name, figure] of Object.entries(opts.figures)) {
        const inputProps = { figure };
        const composition = await selectComposition({ serveUrl, id: "Figure", inputProps, puppeteerInstance: browser, timeoutInMilliseconds: BROWSER_TIMEOUT_MS });
        const output = join(opts.outDir, `${name}.png`);
        await renderStill({ serveUrl, composition, inputProps, frame: 0, output, imageFormat: "png", puppeteerInstance: browser, timeoutInMilliseconds: BROWSER_TIMEOUT_MS });
        out[name] = output;
      }
      return out;
    } finally {
      await browser.close({ silent: true }).catch(() => {});
    }
  });
}

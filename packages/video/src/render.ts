import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { availableParallelism, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { makeCancelSignal, openBrowser, renderMedia, renderStill, selectComposition, type CancelSignal, type OpenGlRenderer } from "@remotion/renderer";
import { LocalizedError, msg, type FigureSpec, type Timeline } from "@ys/core";
import { audioKey, chunkKeys, chunkRanges, renderCode } from "./chunks.ts";
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
  /** İlerlemesiz geçen bu süreden sonra render takılmış sayılır (ms; varsayılan STALL_MS). */
  stallMs?: number;
}

/**
 * Render ilerlemesi bu kadar süre durursa takılmış sayılır, iptal edilip yeni tarayıcıyla bir kez baştan alınır (3 Kas:
 * bilgisayar render'ın %10'unda uykuya geçti; uyanınca Chrome hiç ilerlemedi, süreç 7 saat kilidi tutup bekledi).
 * Ağır karede bile Remotion her kare için ilerleme bildirir; 5 dakika yanlış alarm vermez.
 */
const STALL_MS = 5 * 60_000;

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
// Büyük SVG'li Next.js bölümü 8 sekmede yerel bellek hatası ve kare zaman aşımıyla düştü; tek sekmede aynı kare geçti.
const MAX_DEFAULT_CONCURRENCY = 2;
// Tarayıcı paralelliği x264'ü sınırlamaz: otomatik 34 thread ayrı bellek ayırıp malloc hatasıyla kapanabiliyordu.
const MAX_ENCODER_THREADS = 4;

/**
 * Yalnız ses render'ı kare görüntüsü almaz, kareleri yalnız ses dizileri için değerlendirir: ilerlemede kare sayısının
 * bu kesri kadar sayılır (4 Kas ölçümü, LLM bölümü 3,2 dk: görüntü 386 sn, hafif ses kompozisyonu 15 sn).
 */
const AUDIO_SHARE = 0.05;

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

/**
 * Render tarayıcısı (issue #2, 5 Kas: Remotion 4.0.539'un indirdiği chrome-headless-shell 157 macOS 26.5'te açılıyor ama
 * hiçbir sayfa çizmeden askıda kalıyor, render "browser has disconnected" ile düşüyordu; aynı makinede Chrome for Testing
 * 149 sorunsuz). `YS_BROWSER_EXECUTABLE` çalışan bir Chrome / Chrome for Testing yolunu gösterirse tarayıcıyı kendisi
 * açan her Remotion çağrısı onu kullanır; boşsa Remotion'ın kendi tarayıcısı.
 */
export function browserExecutable(env = process.env.YS_BROWSER_EXECUTABLE): string | undefined {
  return env?.trim() || undefined;
}

/** Tarayıcıyı kendisi açan çağrıya eklenecek alan (yol verilmemişse hiçbir şey: çağrı eskisi gibi). */
const launch = () => {
  const path = browserExecutable();
  return path ? { browserExecutable: path } : {};
};

/** Tarayıcı açılamadı ya da bağlantısı koptu (sayfanın kendi hatası değil). */
export const isBrowserFailure = (e: unknown) =>
  e instanceof Error && /browser has disconnected|Target closed|Session closed|Failed to launch|Navigation failed/i.test(e.message);

/**
 * Tarayıcı hatası ve özel tarayıcı verilmemiş: hata, nedenini ve `YS_BROWSER_EXECUTABLE`'ı söyleyen mesajla sarılır
 * (yazılım GL'e yeniden deneme bu durumda ipucu vermiyordu). Öteki hatalar olduğu gibi.
 */
export function withBrowserHint(e: unknown): unknown {
  if (!isBrowserFailure(e) || browserExecutable()) return e;
  return new LocalizedError(msg("err.render.browser", { error: (e as Error).message.split("\n")[0]! }), { cause: e });
}

/** Ekran kartı ya da tarayıcı çöktü: yazılım GL ile yeniden denemeye değer. */
export const isGpuFailure = (e: unknown) =>
  e instanceof Error && /\bGPU\b|WebGL|context lost|Target closed|Session closed|Page crashed|crashed/i.test(e.message);

/**
 * Geçici dosya hatası (klasör/dosya kayboldu, kilitli) veya tarayıcı kurulumu zaman aşımı: aynı render'ı tekrar denemek
 * güvenli. 30 Eki: %90'dan sonra ses karıştırmada Temp altındaki "remotion-audio-mixing" klasörü kaybolunca 17 dk'lık
 * render boşa gitti. Sayfanın bir karede asılı kalması da (kare ya da delayRender zaman aşımı) geçicidir: 5 Kas, Next.js
 * bölümü 11 dakikalık render'ın %60'ında "waiting for the page to render the React component at frame 4244 failed:
 * timeout" ile düştü; aynı kareler tek tek de, aynı çekimler art arda tek render'da da sorunsuz çıktı.
 */
export const isTransientRenderFailure = (e: unknown) =>
  e instanceof Error &&
  /No such file or directory|ENOENT|EBUSY|EPERM|while setting up the headless browser|render stalled|waiting for the page to render the React component|was called but not cleared/i.test(
    e.message,
  );

/**
 * Chrome kare alamadı ("ran out of memory or disk space"; 3 Kas, Java bölümü %30'da düştü: makinede 60 GB boş bellek
 * vardı, paralel sekmeler ve aynı anda koşan testler ekran kartını/tarayıcıyı zorladı). Yarı paralellikle bir kez
 * yeniden denenir.
 */
export const isMemoryFailure = (e: unknown) => e instanceof Error && /ran out of memory|out of memory|Could not take a screenshot/i.test(e.message);

/** Varsayılan paralel sekme sayısı: çekirdeklerin yarısı, en çok MAX_DEFAULT_CONCURRENCY. */
const defaultConcurrency = () => Math.max(1, Math.min(MAX_DEFAULT_CONCURRENCY, Math.floor(availableParallelism() / 2)));

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
    let concurrency = opts.concurrency;
    for (let attempt = 0; ; attempt++) {
      try {
        return await withTempDir(tempDir, () => renderOnce({ ...opts, concurrency }, gl));
      } catch (e) {
        if (attempt >= 1) throw withBrowserHint(e);
        if (isMemoryFailure(e)) concurrency = Math.max(1, Math.floor((concurrency ?? defaultConcurrency()) / 2));
        else if (gl !== SOFTWARE_GL && isGpuFailure(e)) gl = SOFTWARE_GL;
        else if (!isTransientRenderFailure(e)) throw withBrowserHint(e);
        // split en az bir parça döndürür; "?? ''" yalnız tip için (at() tipte undefined dönebilir).
        /* v8 ignore next */
        opts.onRetry?.((e as Error).message.split("\n").at(-1) ?? "");
      }
    }
  }, opts.onWait);
}

async function renderOnce(opts: RenderOptions, gl: OpenGlRenderer): Promise<string> {
  // Göreli publicDir ile bundle sunucusu görselleri çözemiyor ("source image cannot be decoded").
  const publicDir = resolve(opts.publicDir);
  const serveUrl = await bundle({ entryPoint: ENTRY, publicDir });
  const inputProps = { timeline: opts.timeline };
  const chromiumOptions = { gl };
  const composition = await selectComposition({ serveUrl, id: "Episode", inputProps, chromiumOptions, ...launch() });

  // Parçalar ve ses izi içerik anahtarıyla önbellekte: anahtarı değişmeyen yeniden render edilmez (chunks.ts).
  const cache = cacheDirOf(opts.outputPath);
  await mkdir(cache, { recursive: true });
  const code = await renderCode();
  const ranges = chunkRanges(opts.timeline);
  const parts = (await chunkKeys(opts.timeline, ranges, publicDir, code)).map((k) => join(cache, `${k}.mp4`));
  const audio = join(cache, `${await audioKey(opts.timeline, publicDir, code)}.wav`);
  const todo = ranges.flatMap((r, i) => (existsSync(parts[i]!) ? [] : [i]));
  const audioTodo = !existsSync(audio);

  // İlerleme kare sayısıyla: önbellekten gelen parçalar baştan sayılır; ses geçişi kare çizmez, payı küçük.
  const total = opts.timeline.durationInFrames * (1 + AUDIO_SHARE);
  let done = ranges.reduce((n, r, i) => (todo.includes(i) ? n : n + r.to - r.from), 0) + (audioTodo ? 0 : opts.timeline.durationInFrames * AUDIO_SHARE);
  const report = (extra: number) => opts.onProgress?.(Math.min(1, (done + extra) / total));
  report(0);

  if (todo.length || audioTodo) {
    const browser = await openBrowser("chrome", { chromiumOptions, ...launch() });
    const common = {
      serveUrl,
      inputProps,
      chromiumOptions,
      puppeteerInstance: browser,
      concurrency: opts.concurrency ?? defaultConcurrency(),
      timeoutInMilliseconds: BROWSER_TIMEOUT_MS,
      offthreadVideoCacheSizeInBytes: opts.videoCacheBytes ?? DEFAULT_VIDEO_CACHE_BYTES,
    };
    // Sessiz görüntü [from, to); cuts: göreli karelerde zorlanacak anahtar kareler (bölmek için).
    const video = (from: number, to: number, outputLocation: string, cuts: number[] = []) =>
      watched(opts.stallMs, (cancelSignal, tick) =>
        renderMedia({
          ...common,
          composition,
          codec: "h264",
          muted: true,
          frameRange: [from, to - 1],
          outputLocation,
          cancelSignal,
          ffmpegOverride: videoEncoding(cuts),
          onProgress: ({ progress }) => (tick(), report(progress * (to - from))),
        }),
      );
    try {
      // Önbellekte olmayan ardışık parçalar tek render'da (parça başına sekme açma ve paket yükleme ~20 sn sürüyordu:
      // 9 ayrı parça tek render'ın 1,8 katıydı), sınırlarında anahtar kareyle; sonra yeniden kodlanmadan bölünür.
      for (const run of runsOf(todo)) {
        const from = ranges[run[0]!]!.from;
        const to = ranges[run.at(-1)!]!.to;
        // Yarım kalan dosya önbelleğe girmez: önce geçici adla yazılır.
        const tmp = join(cache, `run-${from}.part.mp4`);
        await video(from, to, tmp, run.slice(1).map((i) => ranges[i]!.from - from));
        const counts = run.map((i) => ranges[i]!.to - ranges[i]!.from);
        if (!(await split(tmp, counts, run.map((i) => parts[i]!)))) {
          // Anahtar kare tutmadı (kodlayıcı farklı): bu parçalar tek tek render edilir.
          for (const i of run) {
            const one = `${parts[i]}.part.mp4`;
            await video(ranges[i]!.from, ranges[i]!.to, one);
            await rename(one, parts[i]!);
          }
        }
        done += to - from;
      }
      if (audioTodo) {
        // Ses yalnız ses dizileri olan kompozisyondan: aynı miks, kare değerlendirmesi çok hafif (64 → 15 sn).
        const tmp = `${audio}.part.wav`;
        const frames = opts.timeline.durationInFrames * AUDIO_SHARE;
        const sound = await selectComposition({ serveUrl, id: "EpisodeAudio", inputProps, chromiumOptions, puppeteerInstance: browser });
        await watched(opts.stallMs, (cancelSignal, tick) =>
          renderMedia({ ...common, composition: sound, codec: "wav", enforceAudioTrack: true, outputLocation: tmp, cancelSignal, onProgress: ({ progress }) => (tick(), report(progress * frames)) }),
        );
        await rename(tmp, audio);
        done += frames;
      }
    } finally {
      await browser.close({ silent: true }).catch(() => {});
    }
  }

  await assemble(parts, audio, opts.outputPath);
  // Bu bölümün artık kullanılmayan parçaları ve yarım dosyalar silinir (önbellek bir video boyunu geçmez).
  const keep = new Set([...parts, audio].map((p) => basename(p)));
  for (const f of await readdir(cache)) if (!keep.has(f)) await rm(join(cache, f), { force: true });
  return opts.outputPath;
}

/** Art arda gelen sıra numaraları gruplanır: [0,1,2,5,6] → [[0,1,2],[5,6]]. */
export function runsOf(indices: number[]): number[][] {
  const runs: number[][] = [];
  for (const i of indices) {
    const last = runs.at(-1);
    if (last && last.at(-1) === i - 1) last.push(i);
    else runs.push([i]);
  }
  return runs;
}

/**
 * Remotion'un kodlayıcı komutuna, verilen göreli karelerde anahtar kare zorlar (parçalar yeniden kodlanmadan bölünsün
 * diye). Yalnız libx264 ile kodlayan komut değişir; ötekiler (kopyalayan birleştirici) olduğu gibi.
 */
export const keyframesAt =
  (cuts: number[]) =>
  ({ args }: { type: string; args: string[] }): string[] => {
    const y = args.lastIndexOf("-y");
    if (!args.includes("libx264") || y < 0) return args;
    return [...args.slice(0, y), "-force_key_frames", `expr:${cuts.map((c) => `eq(n,${c})`).join("+")}`, ...args.slice(y)];
  };

/** Anahtar kareleri korurken yalnız video kodlayıcının thread bütçesini sınırlar; kopyalama ve ses değişmez. */
function videoEncoding(cuts: number[]) {
  return (command: { type: string; args: string[] }): string[] => {
    const args = cuts.length ? keyframesAt(cuts)(command) : command.args;
    const y = args.lastIndexOf("-y");
    if (command.type !== "pre-stitcher" || !args.includes("libx264") || y < 0) return args;
    return [...args.slice(0, y), "-threads", String(MAX_ENCODER_THREADS), ...args.slice(y)];
  };
}

/**
 * Tek render'ı parça dosyalarına yeniden kodlamadan böler. Her parçanın kare sayısı (paket sayımı, kod çözmeden)
 * doğrulanır; tutmazsa false döner ve hiçbir parça önbelleğe girmez. Tek parçalık render yalnız adlandırılır.
 */
export async function split(file: string, counts: number[], outs: string[]): Promise<boolean> {
  if (outs.length === 1) {
    await rename(file, outs[0]!);
    return true;
  }
  const cuts = counts.slice(0, -1).map((_, i) => counts.slice(0, i + 1).reduce((a, b) => a + b, 0));
  const seg = (i: number) => `${file}-${String(i).padStart(3, "0")}.mp4`;
  await runMediaTool("ffmpeg", ["-y", "-v", "error", "-i", file, "-map", "0:v", "-c", "copy", "-f", "segment", "-segment_frames", cuts.join(","), "-reset_timestamps", "1", "-segment_format", "mp4", `${file}-%03d.mp4`]);
  await rm(file, { force: true });
  for (const [i, n] of counts.entries()) {
    if (!existsSync(seg(i))) return false;
    const { stdout } = await runMediaTool("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets", "-of", "default=nw=1:nk=1", seg(i)]);
    if (Number(stdout.trim()) !== n) return false;
  }
  if (existsSync(seg(counts.length))) return false;
  for (const [i, out] of outs.entries()) await rename(seg(i), out);
  return true;
}

/**
 * Render ilerlemesini bekler: ilerleme stallMs boyunca durursa render iptal edilir, hata "render stalled" olarak geçici
 * sayılır ve baştan alınır (önbellekteki parçalar korunur).
 */
async function watched<R>(stallMs: number | undefined, run: (cancelSignal: CancelSignal, tick: () => void) => Promise<R>): Promise<R> {
  const limit = stallMs ?? STALL_MS;
  const { cancelSignal, cancel } = makeCancelSignal();
  let last = Date.now();
  let stalled = false;
  const watch = setInterval(() => {
    if (Date.now() - last < limit) return;
    stalled = true;
    cancel();
  }, Math.min(15_000, limit / 2));
  try {
    return await run(cancelSignal, () => (last = Date.now()));
  } catch (e) {
    if (stalled) throw new Error(`render stalled: no progress for ${Math.round(limit / 1000)} s`);
    throw e;
  } finally {
    clearInterval(watch);
  }
}

/** Bölümün parça önbelleği: çıktının yanında `.render-cache/<ad>` (Short'un ayrı klasörü olur). */
export const cacheDirOf = (outputPath: string) => join(dirname(resolve(outputPath)), ".render-cache", basename(outputPath).replace(/\.mp4$/i, ""));

/**
 * Parçalar art arda yeniden kodlanmadan birleştirilir, ses izi eklenir ve YouTube oynatımına göre -14 LUFS'a getirilir
 * (daha sessiz video rakiplerinden kısık duyulur; 29 Eki ilk bölüm -18,7 LUFS çıktı). Görüntü yeniden kodlanmaz.
 */
export async function assemble(parts: string[], audio: string, output: string): Promise<void> {
  const list = join(dirname(audio), "parts.txt");
  // concat listesinde tek tırnak kaçırılır; yollar tam (-safe 0).
  await writeFile(list, parts.map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  await runMediaTool("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    list,
    "-i",
    audio,
    "-map",
    "0:v",
    "-map",
    "1:a",
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
  await rm(list, { force: true });
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
  return withRenderLock(
    () =>
      stillsOnce(opts).catch((e: unknown) => {
        throw withBrowserHint(e);
      }),
    opts.onWait,
  );
}

async function stillsOnce(opts: StillsOptions): Promise<Record<string, string>> {
  const serveUrl = await bundle({ entryPoint: ENTRY, publicDir: resolve(opts.publicDir) });
  const inputProps = { timeline: opts.timeline };
  // Tek tarayıcı bütün kareler için: önceden her kare ayrı Chrome açıyordu (30+ açılış); yükte biri zaman aşımına düşünce
  // tüm aşama düşüyordu.
  const browser = await openBrowser("chrome", { chromiumOptions: { gl: renderGl() }, ...launch() });
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
    const composition = await selectComposition({ serveUrl, id: "Thumbnail", inputProps, chromiumOptions, timeoutInMilliseconds: BROWSER_TIMEOUT_MS, ...launch() });
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
      ...launch(),
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
    const browser = await openBrowser("chrome", { chromiumOptions: { gl: renderGl() }, ...launch() });
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

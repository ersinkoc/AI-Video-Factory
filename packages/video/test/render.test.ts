import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Timeline } from "@ys/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Gerçek Chrome, webpack paketi ve ffmpeg yok: Remotion ve execFile sahte; dosya sistemi gerçek ama geçici klasörde.
const remotion = vi.hoisted(() => ({
  bundle: vi.fn(),
  openBrowser: vi.fn(),
  selectComposition: vi.fn(),
  renderMedia: vi.fn(),
  renderStill: vi.fn(),
  execFile: vi.fn(),
}));
vi.mock("@remotion/bundler", () => ({ bundle: remotion.bundle }));
vi.mock("@remotion/renderer", () => ({
  // Gerçek iptal sinyali gibi: cancel() bekleyen dinleyicileri çağırır.
  makeCancelSignal: () => {
    const listeners: (() => void)[] = [];
    return { cancelSignal: (cb: () => void) => listeners.push(cb), cancel: () => listeners.forEach((cb) => cb()) };
  },
  openBrowser: remotion.openBrowser,
  selectComposition: remotion.selectComposition,
  renderMedia: remotion.renderMedia,
  renderStill: remotion.renderStill,
}));
vi.mock("node:child_process", () => ({ execFile: remotion.execFile }));
// Yarış durumlarını (kilit dosyası arada silindi, geçici klasör silinemedi) üretmek için fs/promises sarılır.
const fsx = vi.hoisted(() => ({ readFile: undefined as undefined | ((...a: unknown[]) => Promise<unknown>), rm: undefined as undefined | ((...a: unknown[]) => Promise<unknown>) }));
vi.mock("node:fs/promises", async (orig) => {
  const real = await orig<typeof import("node:fs/promises")>();
  return {
    ...real,
    readFile: (...a: Parameters<typeof real.readFile>) => (fsx.readFile ?? real.readFile)(...a),
    rm: (...a: Parameters<typeof real.rm>) => (fsx.rm ?? real.rm)(...a),
  };
});

// Gerçek makine kilidine dokunulmasın (o sırada bir bölüm render ediyor olabilir).
const DIR = mkdtempSync(join(tmpdir(), "ys-render-"));
const LOCK = join(DIR, "render.lock");
process.env.YS_RENDER_LOCK = LOCK;
const mod = await import("../src/render.ts");
const { renderEpisode, renderStills, renderThumbnail, renderFigurePreviews, withRenderLock, ifRenderFree, isTransientRenderFailure, isGpuFailure, isMemoryFailure, isBrowserFailure, withBrowserHint, browserExecutable, renderGl, assemble, cacheDirOf, keyframesAt, runsOf, split, ENTRY } = mod;

/** Sahne öneki olan çekimlerden zaman çizelgesi (30 fps); her sahne ayrı render parçası. */
const make = (scenes: number, frames: number) =>
  ({
    episodeId: "e1",
    fps: 30,
    width: 1920,
    height: 1080,
    durationInFrames: scenes * frames,
    palette: [],
    visuals: Array.from({ length: scenes }, (_, i) => ({ shotId: `s${i + 1}-sh1`, fromFrame: i * frames, durationInFrames: frames, assetUrl: "", kind: "title_card" })),
    vectorAssets: {},
    captions: [],
    audio: [],
  }) as unknown as Timeline;
const timeline = make(1, 60);
const two = make(2, 90);
const three = make(3, 30);
const four = make(4, 30);
const browser = { close: vi.fn() };
type Media = { onProgress: (p: { progress: number }) => void; outputLocation: string; frameRange?: [number, number] };
/** Sahte render: ilerleme bildirir ve çıktıya kare sayısını yazar (sahte ffmpeg bölerken, ffprobe sayarken okur). */
const media = async (o: Media) => {
  o.onProgress({ progress: 0.5 });
  o.onProgress({ progress: 1 });
  writeFileSync(o.outputLocation, String(o.frameRange ? o.frameRange[1] - o.frameRange[0] + 1 : 0));
};
/** Sahte ffmpeg/ffprobe: bölme (segment) girdideki kareleri parçalara dağıtır; ffprobe dosyadaki sayıyı (ya da "wrong") verir. */
const tools =
  (wrong?: string) =>
  (cmd: string, a: string[], cb: (e: Error | null, r?: object) => void) => {
    if (cmd === "ffprobe") return cb(null, { stdout: `${wrong ?? readFileSync(a.at(-1)!, "utf8")}\n`, stderr: "" });
    const at = a.indexOf("-segment_frames");
    if (at >= 0) {
      const edges = [0, ...a[at + 1]!.split(",").map(Number), Number(readFileSync(a[a.indexOf("-i") + 1]!, "utf8"))];
      edges.slice(1).forEach((e, i) => writeFileSync(a.at(-1)!.replace("%03d", String(i).padStart(3, "0")), String(e - edges[i]!)));
    }
    cb(null, { stdout: "", stderr: "" });
  };

beforeEach(() => {
  remotion.bundle.mockResolvedValue("http://bundle");
  remotion.selectComposition.mockImplementation(async (o: { id: string }) => ({ id: o.id }));
  remotion.renderMedia.mockImplementation(media);
  remotion.renderStill.mockResolvedValue({});
  remotion.openBrowser.mockResolvedValue(browser);
  browser.close.mockResolvedValue(undefined);
  remotion.execFile.mockImplementation(tools());
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  fsx.readFile = undefined;
  fsx.rm = undefined;
});

const out = (name: string) => join(mkdtempSync(join(DIR, "out-")), name);

describe("renderEpisode", () => {
  it("renders benchmark ranges on the original timeline clock without the full episode cache", async () => {
    const output = out("clip.mp4");
    await renderEpisode({ timeline: two, publicDir: DIR, outputPath: output, frameRange: [20, 39] });
    expect(remotion.renderMedia).toHaveBeenCalledTimes(1);
    expect(remotion.renderMedia.mock.calls[0]![0]).toMatchObject({ frameRange: [20, 39], inputProps: { timeline: two }, codec: "h264" });
    expect(existsSync(output)).toBe(true);
    await expect(renderEpisode({ timeline: two, publicDir: DIR, outputPath: output, frameRange: [-1, 4] })).rejects.toThrow("Invalid render frame range");
    await expect(renderEpisode({ timeline: two, publicDir: DIR, outputPath: output, frameRange: [0, two.durationInFrames] })).rejects.toThrow("Invalid render frame range");
  });
  it.each([1, 2])("%i sahneli render'da tarayıcı ve x264 paralelliği sınırlıdır", async (scenes) => {
    await renderEpisode({ timeline: make(scenes, 60), publicDir: DIR, outputPath: out("bounded.mp4") });
    const video = remotion.renderMedia.mock.calls.find((c) => c[0].codec === "h264")![0];
    expect(video.concurrency).toBeLessThanOrEqual(2);
    expect(video.ffmpegOverride).toBeTypeOf("function");
    const args = video.ffmpegOverride({ type: "pre-stitcher", args: ["-c:v", "libx264", "-y", "o.mp4"] });
    expect(args.slice(args.indexOf("-threads"), args.indexOf("-threads") + 2)).toEqual(["-threads", "4"]);
    expect(args.includes("-force_key_frames")).toBe(scenes > 1);
    const copy = ["-c:v", "copy", "-y", "o.mp4"];
    expect(video.ffmpegOverride({ type: "stitcher", args: copy })).toEqual(copy);
    const noOutput = ["-c:v", "libx264"];
    expect(video.ffmpegOverride({ type: "pre-stitcher", args: noOutput })).toEqual(noOutput);
  });

  it("önbellekte olmayan sahneleri tek render'da, sınırlarında anahtar kareyle render edip böler; ses ayrı ve hafif; birleştirip -14 LUFS'a getirir", async () => {
    const output = out("bolum.MP4");
    const progress: number[] = [];
    const savedTemp = process.env.TEMP;
    let tempDuring: string | undefined;
    remotion.bundle.mockImplementation(async () => {
      tempDuring = process.env.TEMP;
      return "http://bundle";
    });

    expect(await renderEpisode({ timeline: two, publicDir: "pub", outputPath: output, onProgress: (p) => progress.push(p) })).toBe(output);

    expect(remotion.bundle).toHaveBeenCalledWith({ entryPoint: ENTRY, publicDir: join(process.cwd(), "pub") });
    // Varsayılan çizim arka ucu ekran kartı (ANGLE); ses yalnız ses dizileri olan kompozisyondan.
    expect(remotion.selectComposition).toHaveBeenCalledWith({ serveUrl: "http://bundle", id: "Episode", inputProps: { timeline: two }, chromiumOptions: { gl: "angle" } });
    expect(remotion.selectComposition).toHaveBeenCalledWith({ serveUrl: "http://bundle", id: "EpisodeAudio", inputProps: { timeline: two }, chromiumOptions: { gl: "angle" }, puppeteerInstance: browser });
    expect(remotion.openBrowser).toHaveBeenCalledTimes(1);
    expect(remotion.openBrowser).toHaveBeenCalledWith("chrome", { chromiumOptions: { gl: "angle" } });
    const cache = cacheDirOf(output);
    expect(cache).toBe(join(output, "..", ".render-cache", "bolum"));
    const calls = remotion.renderMedia.mock.calls.map((c) => c[0]);
    expect(calls.map((c) => [c.composition.id, c.codec, c.frameRange ?? null, c.muted ?? false])).toEqual([
      ["Episode", "h264", [0, 179], true],
      ["EpisodeAudio", "wav", null, false],
    ]);
    for (const c of calls) {
      expect(c).toMatchObject({ serveUrl: "http://bundle", inputProps: { timeline: two }, chromiumOptions: { gl: "angle" }, puppeteerInstance: browser, timeoutInMilliseconds: 120_000, offthreadVideoCacheSizeInBytes: 2 * 1024 ** 3 });
      expect(c.concurrency).toBeGreaterThanOrEqual(1);
      expect(c.concurrency).toBeLessThanOrEqual(8);
      // Yarım kalan dosya önbellekte görünmesin: geçici adla yazılır.
      expect(c.outputLocation).toMatch(/\.part\.(mp4|wav)$/);
      expect(dirname(c.outputLocation)).toBe(cache);
    }
    expect(calls[1]!.enforceAudioTrack).toBe(true);
    // İkinci sahnenin başına (göreli 90. kare) anahtar kare zorlanır.
    expect(calls[0]!.ffmpegOverride({ type: "pre-stitcher", args: ["-c:v", "libx264", "-y", "o.mp4"] })).toEqual(["-c:v", "libx264", "-force_key_frames", "expr:eq(n,90)", "-threads", "4", "-y", "o.mp4"]);
    // Önbellekte iki parça (90'ar kare) ve ses izi; geçici dosya ve birleştirme listesi silinmiş.
    const files = readdirSync(cache).sort();
    expect(files.filter((f) => f.endsWith(".mp4")).map((f) => readFileSync(join(cache, f), "utf8"))).toEqual(["90", "90"]);
    expect(files.filter((f) => f.endsWith(".wav"))).toHaveLength(1);
    expect(files).toHaveLength(3);
    // İlerleme: artan, sonu 1.
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((p, i) => i === 0 || p >= progress[i - 1]!)).toBe(true);
    const ffmpeg = remotion.execFile.mock.calls.filter((c) => c[0] === "ffmpeg").map((c) => c[1] as string[]);
    expect(ffmpeg[0]).toEqual(expect.arrayContaining(["segment", "-segment_frames", "90", "-c", "copy"]));
    expect(ffmpeg.at(-1)).toEqual(expect.arrayContaining(["concat", "-c:v", "copy", "loudnorm=I=-14:TP=-1.5:LRA=11", output]));
    expect(browser.close).toHaveBeenCalledTimes(1);
    // Render sırasında Temp çıktının yanındaki klasöre yönlendirilir, sonra geri alınır ve klasör silinir.
    expect(tempDuring).toBe(join(output, "..", ".render-tmp"));
    expect(process.env.TEMP).toBe(savedTemp);
    expect(existsSync(join(output, "..", ".render-tmp"))).toBe(false);
    expect(existsSync(LOCK)).toBe(false);
  });

  it("aynı bölüm yeniden: değişmeyen parça ve ses önbellekten; değişen sahne ve geçişle bindiği sonraki render edilir, eskisi silinir", async () => {
    const output = out("a.mp4");
    await renderEpisode({ timeline: three, publicDir: DIR, outputPath: output });
    const before = new Set(readdirSync(cacheDirOf(output)));
    remotion.renderMedia.mockClear();
    remotion.openBrowser.mockClear();
    const progress: number[] = [];
    await renderEpisode({ timeline: three, publicDir: DIR, outputPath: output, onProgress: (p) => progress.push(p) });
    // Her şey önbellekte: tarayıcı açılmaz, yalnız birleştirilir.
    expect(remotion.renderMedia).not.toHaveBeenCalled();
    expect(remotion.openBrowser).not.toHaveBeenCalled();
    expect(progress).toEqual([1]);
    // İlk sahnenin çekimi değişti: s1 ve onun son karelerinin bindiği s2 birlikte yeniden, s3 ve ses önbellekten.
    const changed = { ...three, visuals: three.visuals.map((v, i) => (i === 0 ? { ...v, motion: { type: "none" as const, zoomFrom: 1, zoomTo: 1, panX: 0 } } : v)) };
    await renderEpisode({ timeline: changed, publicDir: DIR, outputPath: output });
    expect(remotion.renderMedia.mock.calls.map((c) => c[0].frameRange)).toEqual([[0, 59]]);
    const after = readdirSync(cacheDirOf(output));
    expect(after).toHaveLength(4);
    expect(after.filter((f) => before.has(f))).toHaveLength(2);
  });

  it("çöken render kaldığı yerden sürer: biten parçalar önbellekte kalır, yarım kalan alınmaz", async () => {
    const output = out("a.mp4");
    await renderEpisode({ timeline: four, publicDir: DIR, outputPath: output });
    remotion.renderMedia.mockClear();
    // İlk ve son sahne değişti: iki ayrı render ([s1, s2] ve [s4]); ikincisi yarıda düşer.
    const motion = { type: "none" as const, zoomFrom: 1, zoomTo: 1, panX: 0 };
    const changed = { ...four, visuals: four.visuals.map((v, i) => (i === 0 || i === 3 ? { ...v, motion } : v)) };
    remotion.renderMedia.mockImplementationOnce(media).mockImplementationOnce(async (o: Media) => {
      writeFileSync(o.outputLocation, "yarım");
      throw new Error("ENOENT: no such file or directory");
    });
    const reasons: string[] = [];
    await renderEpisode({ timeline: changed, publicDir: DIR, outputPath: output, onRetry: (r) => reasons.push(r) });
    expect(reasons).toEqual(["ENOENT: no such file or directory"]);
    expect(remotion.renderMedia.mock.calls.map((c) => c[0].frameRange)).toEqual([
      [0, 59],
      [90, 119],
      [90, 119],
    ]);
    expect(readdirSync(cacheDirOf(output)).some((f) => f.includes(".part."))).toBe(false);
    expect(readdirSync(cacheDirOf(output))).toHaveLength(5);
  });

  it("bölünen parçaların kare sayısı tutmazsa parçalar tek tek render edilir", async () => {
    remotion.execFile.mockImplementation(tools("7"));
    const output = out("a.mp4");
    await renderEpisode({ timeline: two, publicDir: DIR, outputPath: output });
    expect(remotion.renderMedia.mock.calls.map((c) => c[0].frameRange ?? "ses")).toEqual([[0, 179], [0, 89], [90, 179], "ses"]);
    // Tek parça render'ında anahtar kare zorlanmaz; önbellekte iki parça ve ses, artık dosya yok.
    expect(remotion.renderMedia.mock.calls[1]![0].ffmpegOverride({ type: "pre-stitcher", args: ["-c:v", "libx264", "-y", "o.mp4"] })).toEqual(["-c:v", "libx264", "-threads", "4", "-y", "o.mp4"]);
    expect(readdirSync(cacheDirOf(output))).toHaveLength(3);
  });

  it("verilen paralellik ve önbellek kullanılır; ilerleme dinleyicisi olmadan da çalışır; tarayıcı kapanmazsa da sürer", async () => {
    browser.close.mockRejectedValueOnce(new Error("kapanmadı"));
    await renderEpisode({ timeline, publicDir: DIR, outputPath: out("a.mp4"), concurrency: 3, videoCacheBytes: 1024 });
    expect(remotion.renderMedia.mock.calls[0]![0]).toMatchObject({ concurrency: 3, offthreadVideoCacheSizeInBytes: 1024 });
  });

  it("geçici hatada bir kez baştan dener ve nedeni bildirir", async () => {
    remotion.renderMedia.mockRejectedValueOnce(new Error("mixing\nENOENT: no such file or directory, open 'x.wav'"));
    const reasons: string[] = [];
    await renderEpisode({ timeline, publicDir: DIR, outputPath: out("a.mp4"), onRetry: (r) => reasons.push(r) });
    expect(reasons).toEqual(["ENOENT: no such file or directory, open 'x.wav'"]);
    expect(remotion.renderMedia).toHaveBeenCalledTimes(3);
  });

  it("dinleyici yoksa da yeniden dener; ikinci geçici hatada vazgeçer", async () => {
    const err = new Error("Timed out after 30000ms while setting up the headless browser");
    remotion.bundle.mockRejectedValue(err);
    await expect(renderEpisode({ timeline, publicDir: DIR, outputPath: out("a.mp4") })).rejects.toBe(err);
    expect(remotion.bundle).toHaveBeenCalledTimes(2);
    expect(existsSync(LOCK)).toBe(false);
  });

  it("ekran kartı/tarayıcı çökünce bir kez yazılım GL ile baştan alır", async () => {
    remotion.renderMedia.mockRejectedValueOnce(new Error("Error: Page crashed!"));
    const reasons: string[] = [];
    await renderEpisode({ timeline, publicDir: DIR, outputPath: out("a.mp4"), onRetry: (r) => reasons.push(r) });
    expect(reasons).toEqual(["Error: Page crashed!"]);
    expect(remotion.renderMedia.mock.calls.map((c) => c[0].chromiumOptions)).toEqual([{ gl: "angle" }, { gl: "swangle" }, { gl: "swangle" }]);
  });

  it("ilerlemesi duran render iptal edilir ve aynı arka uçla bir kez baştan alınır; ikinci kez takılırsa hata", async () => {
    // Takılan render: hiç ilerleme bildirmez, yalnız iptal sinyaliyle düşer (Remotion'daki gibi).
    const hang = (o: { cancelSignal: (cb: () => void) => void }) => new Promise<void>((_, reject) => o.cancelSignal(() => reject(new Error("renderMedia() got cancelled"))));
    remotion.renderMedia.mockImplementationOnce(hang);
    const reasons: string[] = [];
    await renderEpisode({ timeline, publicDir: DIR, outputPath: out("a.mp4"), stallMs: 40, onRetry: (r) => reasons.push(r) });
    expect(reasons).toEqual(["render stalled: no progress for 0 s"]);
    expect(remotion.renderMedia.mock.calls.map((c) => c[0].chromiumOptions)).toEqual([{ gl: "angle" }, { gl: "angle" }, { gl: "angle" }]);
    // İptal dışı hatada bekçi sessiz kalır; ikinci takılma iletilir ve kilit bırakılır.
    remotion.renderMedia.mockImplementation(hang);
    await expect(renderEpisode({ timeline, publicDir: DIR, outputPath: out("a.mp4"), stallMs: 40 })).rejects.toThrow("render stalled");
    expect(existsSync(LOCK)).toBe(false);
  });

  it("ilerleme sürdükçe bekçi beklemeye devam eder (yük altında da: ilerleme bekçi aralığından sık gelir)", async () => {
    remotion.renderMedia.mockImplementationOnce(async (o: { onProgress: (p: { progress: number }) => void; outputLocation: string }) => {
      for (let i = 1; i <= 35; i++) {
        await new Promise((r) => setTimeout(r, 10));
        o.onProgress({ progress: i / 35 });
      }
      writeFileSync(o.outputLocation, "parça");
    });
    const reasons: string[] = [];
    await renderEpisode({ timeline, publicDir: DIR, outputPath: out("a.mp4"), stallMs: 200, onRetry: (r) => reasons.push(r) });
    expect(reasons).toEqual([]);
    expect(remotion.renderMedia).toHaveBeenCalledTimes(2);
  });

  it("Chrome kare alamayınca (bellek) aynı arka uçla yarı paralellikle bir kez baştan alır", async () => {
    const oom = "Could not take a screenshot because Google Chrome ran out of memory or disk space. Decrease the concurrency to use less RAM.";
    remotion.renderMedia.mockRejectedValueOnce(new Error(oom));
    await renderEpisode({ timeline, publicDir: DIR, outputPath: out("a.mp4"), concurrency: 6 });
    expect(remotion.renderMedia.mock.calls.map((c) => [c[0].concurrency, c[0].chromiumOptions.gl])).toEqual([
      [6, "angle"],
      [3, "angle"],
      [3, "angle"],
    ]);
    // Paralellik verilmemişse varsayılanın yarısı (en az 1).
    remotion.renderMedia.mockClear();
    remotion.renderMedia.mockRejectedValueOnce(new Error(oom));
    await renderEpisode({ timeline, publicDir: DIR, outputPath: out("a.mp4") });
    const [first, second] = remotion.renderMedia.mock.calls.map((c) => c[0].concurrency as number);
    expect(second).toBe(Math.max(1, Math.floor(first! / 2)));
    expect(isMemoryFailure(new Error("Target closed"))).toBe(false);
  });

  it("zaten yazılım GL'deyken çöken render geçici değilse yeniden denenmez", async () => {
    process.env.YS_RENDER_GL = "swangle";
    try {
      remotion.renderMedia.mockRejectedValue(new Error("Target closed"));
      await expect(renderEpisode({ timeline, publicDir: DIR, outputPath: out("a.mp4") })).rejects.toThrow("Target closed");
      expect(remotion.renderMedia).toHaveBeenCalledTimes(1);
    } finally {
      delete process.env.YS_RENDER_GL;
    }
  });

  it("kalıcı hatayı yeniden denemeden iletir", async () => {
    const onRetry = vi.fn();
    remotion.renderMedia.mockRejectedValue(new Error("composition bulunamadı"));
    await expect(renderEpisode({ timeline, publicDir: DIR, outputPath: out("a.mp4"), onRetry })).rejects.toThrow("composition bulunamadı");
    expect(onRetry).not.toHaveBeenCalled();
    expect(remotion.renderMedia).toHaveBeenCalledTimes(1);
  });

  it("ffmpeg hatası render'ı düşürür", async () => {
    remotion.execFile.mockImplementation((_f: string, _a: string[], cb: (e: Error) => void) => cb(new Error("ffmpeg yok")));
    await expect(renderEpisode({ timeline, publicDir: DIR, outputPath: out("a.mp4") })).rejects.toThrow("ffmpeg yok");
  });

  it("geçici klasör silinemezse render yine başarılı sayılır", async () => {
    fsx.rm = async (p: unknown, o: unknown) => {
      if (String(p).endsWith(".render-tmp")) throw new Error("EBUSY");
      const { rm } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
      return rm(p as string, o as object);
    };
    const output = out("a.mp4");
    expect(await renderEpisode({ timeline, publicDir: DIR, outputPath: output })).toBe(output);
  });

  it("Windows dışında TMPDIR yönlendirilir; önceden yoksa render sonrası yine yoktur", async () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { value: "linux" });
    const saved = process.env.TMPDIR;
    delete process.env.TMPDIR;
    let during: string | undefined;
    remotion.bundle.mockImplementation(async () => {
      during = process.env.TMPDIR;
      return "http://bundle";
    });
    try {
      const output = out("a.mp4");
      await renderEpisode({ timeline, publicDir: DIR, outputPath: output });
      expect(during).toBe(join(output, "..", ".render-tmp"));
      expect("TMPDIR" in process.env).toBe(false);
    } finally {
      Object.defineProperty(process, "platform", platform);
      if (saved === undefined) delete process.env.TMPDIR;
      else process.env.TMPDIR = saved;
    }
  });
});

describe("parçalama yardımcıları", () => {
  it("ardışık sıra numaraları gruplanır", () => {
    expect(runsOf([0, 1, 2, 5, 6, 9])).toEqual([[0, 1, 2], [5, 6], [9]]);
    expect(runsOf([])).toEqual([]);
  });

  it("anahtar kare yalnız libx264 ile kodlayan komuta, çıktıdan önce eklenir", () => {
    const force = keyframesAt([30, 75]);
    expect(force({ type: "pre-stitcher", args: ["-c:v", "libx264", "-y", "o.mp4"] })).toEqual(["-c:v", "libx264", "-force_key_frames", "expr:eq(n,30)+eq(n,75)", "-y", "o.mp4"]);
    expect(force({ type: "stitcher", args: ["-c:v", "copy", "-y", "o.mp4"] })).toEqual(["-c:v", "copy", "-y", "o.mp4"]);
    expect(force({ type: "pre-stitcher", args: ["-c:v", "libx264", "o.mp4"] })).toEqual(["-c:v", "libx264", "o.mp4"]);
  });

  it("bölme: parça eksik ya da fazlaysa false; tek parça yalnız adlandırılır", async () => {
    const dir = mkdtempSync(join(DIR, "split-"));
    const run = join(dir, "run.mp4");
    // Bölme hiçbir parça yazmadı.
    writeFileSync(run, "60");
    remotion.execFile.mockImplementation((_c: string, _a: string[], cb: (e: Error | null, r?: object) => void) => cb(null, { stdout: "", stderr: "" }));
    expect(await split(run, [30, 30], [join(dir, "a.mp4"), join(dir, "b.mp4")])).toBe(false);
    // Bir parça fazla (anahtar kare beklenenden önce): üçüncü dosya var.
    remotion.execFile.mockImplementation(tools());
    writeFileSync(run, "60");
    writeFileSync(`${run}-002.mp4`, "0");
    expect(await split(run, [30, 30], [join(dir, "a.mp4"), join(dir, "b.mp4")])).toBe(false);
    expect(existsSync(join(dir, "a.mp4"))).toBe(false);
    writeFileSync(run, "60");
    expect(await split(run, [60], [join(dir, "tek.mp4")])).toBe(true);
    expect(readFileSync(join(dir, "tek.mp4"), "utf8")).toBe("60");
  });
});

describe("assemble", () => {
  it("parçaları yeniden kodlamadan birleştirir, sesi ekler ve YouTube düzeyine getirir; liste dosyası silinir", async () => {
    const dir = mkdtempSync(join(DIR, "asm-"));
    const parts = [join(dir, "a.mp4"), join(dir, "o'b.mp4")];
    let list = "";
    remotion.execFile.mockImplementation((_f: string, a: string[], cb: (e: Error | null, r?: object) => void) => {
      list = readFileSync(a[a.indexOf("-i") + 1]!, "utf8");
      cb(null, { stdout: "", stderr: "" });
    });
    await assemble(parts, join(dir, "ses.wav"), join(dir, "out.mp4"));
    const listPath = join(dir, "parts.txt");
    expect(remotion.execFile.mock.calls[0]!.slice(0, 2)).toEqual([
      "ffmpeg",
      ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", listPath, "-i", join(dir, "ses.wav"), "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", join(dir, "out.mp4")],
    ]);
    // Yollar ileri eğik çizgiyle, tek tırnak kaçırılmış.
    const fwd = dir.replace(/\\/g, "/");
    expect(list).toBe(`file '${fwd}/a.mp4'\nfile '${fwd}/o'\\''b.mp4'`);
    expect(existsSync(listPath)).toBe(false);
  });
});

describe("çizim arka ucu", () => {
  it("YS_RENDER_GL bilinen bir değerse o, yoksa ekran kartı (angle)", () => {
    expect(renderGl(undefined)).toBe("angle");
    expect(renderGl("swangle")).toBe("swangle");
    expect(renderGl("vulkan")).toBe("vulkan");
    expect(renderGl("opengl")).toBe("angle");
  });

  it("GPU/tarayıcı çökmesini tanır", () => {
    for (const m of ["GPU process exited", "WebGL context lost", "Target closed", "Session closed", "Page crashed!", "Browser crashed"]) {
      expect(isGpuFailure(new Error(m)), m).toBe(true);
    }
    expect(isGpuFailure(new Error("composition bulunamadı"))).toBe(false);
    expect(isGpuFailure("GPU")).toBe(false);
  });
});

describe("render tarayıcısı (YS_BROWSER_EXECUTABLE)", () => {
  const CHROME = "/opt/chrome-for-testing/chrome";
  afterEach(() => vi.unstubAllEnvs());

  it("yol verilmemişse ya da boşsa Remotion'ın tarayıcısı; verilmişse kırpılmış yol", () => {
    expect(browserExecutable(undefined)).toBeUndefined();
    expect(browserExecutable("  ")).toBeUndefined();
    expect(browserExecutable(` ${CHROME} `)).toBe(CHROME);
  });

  it("verilen yol tarayıcıyı kendisi açan her çağrıya geçer: bölüm, kareler, küçük resim, figür önizlemesi", async () => {
    vi.stubEnv("YS_BROWSER_EXECUTABLE", CHROME);
    await renderEpisode({ timeline, publicDir: DIR, outputPath: out("a.mp4") });
    expect(remotion.selectComposition).toHaveBeenCalledWith(expect.objectContaining({ id: "Episode", browserExecutable: CHROME }));
    expect(remotion.openBrowser).toHaveBeenCalledWith("chrome", { chromiumOptions: { gl: "angle" }, browserExecutable: CHROME });
    // Açık tarayıcıyı kullanan çağrıya yol geçmez.
    expect(remotion.renderMedia.mock.calls[0]![0]).not.toHaveProperty("browserExecutable");
    vi.clearAllMocks();
    remotion.openBrowser.mockResolvedValue(browser);
    await renderStills({ timeline, publicDir: DIR, frames: { a: 0 }, outDir: mkdtempSync(join(DIR, "stills-")) });
    expect(remotion.openBrowser).toHaveBeenCalledWith("chrome", { chromiumOptions: { gl: "angle" }, browserExecutable: CHROME });
    remotion.selectComposition.mockResolvedValue({ id: "Thumbnail", durationInFrames: 101 });
    await renderThumbnail({ timeline, publicDir: DIR, shotId: "s1", side: "right", title: "B", output: join(DIR, "t.jpg") });
    expect(remotion.selectComposition).toHaveBeenLastCalledWith(expect.objectContaining({ id: "Thumbnail", browserExecutable: CHROME }));
    expect(remotion.renderStill).toHaveBeenLastCalledWith(expect.objectContaining({ browserExecutable: CHROME }));
    remotion.openBrowser.mockClear();
    await renderFigurePreviews({ figures: { a: { skin: "#fff" } as never }, outDir: DIR });
    expect(remotion.openBrowser).toHaveBeenCalledWith("chrome", { chromiumOptions: { gl: "angle" }, browserExecutable: CHROME });
  });

  it("tarayıcı açılamadı ya da koptu: hata YS_BROWSER_EXECUTABLE'ı söyler; yol verilmişse ya da başka hatada olduğu gibi", async () => {
    vi.stubEnv("YS_BROWSER_EXECUTABLE", "");
    const gone = new Error("Navigation failed because browser has disconnected!\n    at x");
    remotion.openBrowser.mockRejectedValue(gone);
    const err = (await renderEpisode({ timeline, publicDir: DIR, outputPath: out("a.mp4") }).catch((e: unknown) => e)) as Error;
    expect(err.message).toContain("YS_BROWSER_EXECUTABLE");
    expect(err.message).toContain("browser has disconnected!)");
    expect(err.cause).toBe(gone);
    // Yazılım GL'e yeniden deneme de düşerse ("Target closed") yine ipucu.
    remotion.openBrowser.mockRejectedValue(new Error("Protocol error (Runtime.callFunctionOn): Target closed."));
    await expect(renderEpisode({ timeline, publicDir: DIR, outputPath: out("a.mp4") })).rejects.toThrow("YS_BROWSER_EXECUTABLE");
    expect(remotion.openBrowser).toHaveBeenLastCalledWith("chrome", { chromiumOptions: { gl: "swangle" } });
    await expect(renderStills({ timeline, publicDir: DIR, frames: { a: 0 }, outDir: DIR })).rejects.toThrow("YS_BROWSER_EXECUTABLE");
    expect(existsSync(LOCK)).toBe(false);
    // Özel tarayıcı zaten verilmişse ipucu yok.
    vi.stubEnv("YS_BROWSER_EXECUTABLE", CHROME);
    expect(withBrowserHint(gone)).toBe(gone);
    const other = new Error("composition bulunamadı");
    vi.stubEnv("YS_BROWSER_EXECUTABLE", "");
    expect(withBrowserHint(other)).toBe(other);
    expect(isBrowserFailure("Target closed")).toBe(false);
    for (const m of ["Failed to launch the browser process!", "Session closed. Most likely the page has been closed."]) expect(isBrowserFailure(new Error(m)), m).toBe(true);
  });
});

describe("isTransientRenderFailure", () => {
  it("yalnız dosya/tarayıcı kurulum hatalarını ve bir karede asılı kalan sayfayı geçici sayar", () => {
    const hung = [
      "waiting for the page to render the React component at frame 4244 failed: timeout 123000ms exceeded",
      "A delayRender() \"pixi sparks\" was called but not cleared after 120000ms.",
    ];
    for (const m of ["ENOENT: x", "EBUSY: locked", "EPERM: operation", "No such file or directory", "while setting up the headless browser", ...hung]) {
      expect(isTransientRenderFailure(new Error(m))).toBe(true);
    }
    expect(isTransientRenderFailure(new Error("Out of memory"))).toBe(false);
    expect(isTransientRenderFailure("ENOENT")).toBe(false);
  });
});

describe("renderStills", () => {
  it("tek tarayıcıyla kareleri sırayla çıkarır ve tarayıcıyı kapatır", async () => {
    const outDir = mkdtempSync(join(DIR, "stills-"));
    const res = await renderStills({ timeline, publicDir: "pub", frames: { a: 0, b: 45 }, outDir });
    expect(res).toEqual({ a: join(outDir, "a.jpg"), b: join(outDir, "b.jpg") });
    expect(remotion.openBrowser).toHaveBeenCalledTimes(1);
    expect(remotion.openBrowser).toHaveBeenCalledWith("chrome", { chromiumOptions: { gl: "angle" } });
    expect(remotion.selectComposition).toHaveBeenCalledWith({
      serveUrl: "http://bundle",
      id: "Episode",
      inputProps: { timeline },
      puppeteerInstance: browser,
      timeoutInMilliseconds: 120_000,
    });
    expect(remotion.renderStill.mock.calls.map((c) => c[0])).toEqual([
      expect.objectContaining({ frame: 0, output: join(outDir, "a.jpg"), imageFormat: "jpeg", jpegQuality: 80, scale: 0.5, puppeteerInstance: browser }),
      expect.objectContaining({ frame: 45, output: join(outDir, "b.jpg") }),
    ]);
    expect(browser.close).toHaveBeenCalledWith({ silent: true });
  });

  it("takılan kare bir kez yeniden denenir", async () => {
    remotion.renderStill.mockRejectedValueOnce(new Error("timeout"));
    await renderStills({ timeline, publicDir: DIR, frames: { a: 10 }, outDir: DIR });
    expect(remotion.renderStill).toHaveBeenCalledTimes(2);
  });

  it("ikinci denemede de düşen kare hatası iletilir, tarayıcı yine kapanır (kapanış hatası yutulur)", async () => {
    remotion.renderStill.mockRejectedValue(new Error("kare alınamadı"));
    browser.close.mockRejectedValue(new Error("zaten kapalı"));
    await expect(renderStills({ timeline, publicDir: DIR, frames: { a: 10 }, outDir: DIR })).rejects.toThrow("kare alınamadı");
    expect(browser.close).toHaveBeenCalled();
    expect(existsSync(LOCK)).toBe(false);
  });
});

describe("renderThumbnail", () => {
  it("Thumbnail kompozisyonundan çekimin %80'indeki kareyi tam boy JPEG olarak alır, kilidi bırakır", async () => {
    remotion.selectComposition.mockResolvedValue({ id: "Thumbnail", durationInFrames: 101 });
    const output = join(DIR, "e1.jpg");
    const out = await renderThumbnail({ timeline, publicDir: "pub", shotId: "s1", side: "right", title: "Başlık", output });
    expect(out).toBe(output);
    const inputProps = { timeline, shotId: "s1", side: "right", title: "Başlık" };
    expect(remotion.selectComposition).toHaveBeenCalledWith({ serveUrl: "http://bundle", id: "Thumbnail", inputProps, chromiumOptions: { gl: "angle" }, timeoutInMilliseconds: 120_000 });
    expect(remotion.renderStill).toHaveBeenCalledWith(expect.objectContaining({ inputProps, frame: 80, output, imageFormat: "jpeg", jpegQuality: 92, chromiumOptions: { gl: "angle" } }));
    expect(remotion.renderStill.mock.calls[0]![0]).not.toHaveProperty("scale");
    expect(existsSync(LOCK)).toBe(false);
  });
});

describe("3D figür önizlemesi", () => {
  const figure = { skin: "#f1c7a5" } as never;

  it("tek paket ve tek tarayıcıyla her figür için saydam PNG; tarayıcı kapanır, kilit bırakılır", async () => {
    const outDir = mkdtempSync(join(DIR, "fig-"));
    const res = await renderFigurePreviews({ figures: { a: figure, b: figure }, outDir });
    expect(res).toEqual({ a: join(outDir, "a.png"), b: join(outDir, "b.png") });
    expect(remotion.bundle).toHaveBeenCalledTimes(1);
    expect(remotion.bundle).toHaveBeenCalledWith({ entryPoint: ENTRY });
    expect(remotion.openBrowser).toHaveBeenCalledWith("chrome", { chromiumOptions: { gl: "angle" } });
    expect(remotion.selectComposition).toHaveBeenCalledWith(expect.objectContaining({ id: "Figure", inputProps: { figure }, puppeteerInstance: browser }));
    expect(remotion.renderStill.mock.calls.map((c) => c[0])).toEqual([
      expect.objectContaining({ frame: 0, output: join(outDir, "a.png"), imageFormat: "png" }),
      expect.objectContaining({ output: join(outDir, "b.png") }),
    ]);
    expect(browser.close).toHaveBeenCalledWith({ silent: true });
    expect(existsSync(LOCK)).toBe(false);
  });

  it("makine başka render yapıyorsa beklemez, hiçbir şey çizmez; hata olursa tarayıcı yine kapanır", async () => {
    writeFileSync(LOCK, `${process.pid}:baska-is`);
    try {
      expect(await renderFigurePreviews({ figures: { a: figure }, outDir: DIR })).toBeUndefined();
      expect(remotion.bundle).not.toHaveBeenCalled();
    } finally {
      rmSync(LOCK, { force: true });
    }
    remotion.renderStill.mockRejectedValue(new Error("kare alınamadı"));
    browser.close.mockRejectedValue(new Error("zaten kapalı"));
    await expect(renderFigurePreviews({ figures: { a: figure }, outDir: DIR })).rejects.toThrow("kare alınamadı");
    expect(browser.close).toHaveBeenCalled();
    expect(existsSync(LOCK)).toBe(false);
  });

  it("ifRenderFree: kilit boşsa çalıştırır ve bırakır", async () => {
    expect(await ifRenderFree(async () => existsSync(LOCK))).toBe(true);
    expect(existsSync(LOCK)).toBe(false);
  });
});

describe("render kilidi: kenar durumları", () => {
  /** Bekleme sürelerini atlar; her beklemede verilen adım çalışır. */
  const instantWaits = (onWait: (n: number) => void = () => {}) => {
    let n = 0;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      onWait(++n);
      fn();
      return 0;
    }) as typeof setTimeout);
    return () => n;
  };

  it("canlı sahibi bekler, bir kez bildirir, kilit boşalınca girer", async () => {
    writeFileSync(LOCK, `${process.pid}:baska-is`);
    const holders: number[] = [];
    const waits = instantWaits((n) => n === 2 && rmSync(LOCK)); // sahibi ikinci beklemede bitirir
    expect(await withRenderLock(async () => "tamam", (pid) => holders.push(pid))).toBe("tamam");
    expect(holders).toEqual([process.pid]);
    expect(waits()).toBe(2);
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);
  });

  it("uzun süre boş kalan kilit dosyası bayat sayılır", async () => {
    writeFileSync(LOCK, "");
    const waits = instantWaits();
    const onWait = vi.fn();
    expect(await withRenderLock(async () => 7, onWait)).toBe(7);
    expect(waits()).toBe(50); // 50 × 200 ms kısa bekleme, 51. okumada bayat
    expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 200);
    expect(onWait).not.toHaveBeenCalled();
  });

  it("izin hatası veren süreç canlı sayılır (EPERM), diğer hatada ölü", async () => {
    writeFileSync(LOCK, "4242:x");
    vi.spyOn(process, "kill").mockImplementation((pid) => {
      throw Object.assign(new Error("kill"), { code: pid === 4242 ? "EPERM" : "ESRCH" });
    });
    // İlk beklemede kilit ölü bir sürece geçer: bayat sayılıp silinir.
    instantWaits((n) => n === 1 && writeFileSync(LOCK, "4343:olu"));
    const onWait = vi.fn();
    expect(await withRenderLock(async () => 1, onWait)).toBe(1);
    expect(onWait).toHaveBeenCalledExactlyOnceWith(4242);
  });

  it("kilit okunurken silinirse boş sayılır; iş kilidi kendisi silerse sorun çıkmaz", async () => {
    writeFileSync(LOCK, `${process.pid}:x`);
    const { readFile } = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    let first = true;
    fsx.readFile = async (...a: unknown[]) => {
      if (first) {
        first = false;
        rmSync(LOCK);
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      }
      return (readFile as (...x: unknown[]) => Promise<unknown>)(...a);
    };
    instantWaits();
    const res = await withRenderLock(async () => {
      rmSync(LOCK);
      return "bitti";
    });
    expect(res).toBe("bitti");
    expect(existsSync(LOCK)).toBe(false);
  });

  it("başkasının aldığı kilit iş bitince silinmez", async () => {
    await withRenderLock(async () => writeFileSync(LOCK, "123:baskasi"));
    expect(readFileSync(LOCK, "utf8")).toBe("123:baskasi");
    rmSync(LOCK);
  });

  it("kilit dosyası açılamazsa (EEXIST dışı hata) hemen hata verir", async () => {
    vi.resetModules();
    process.env.YS_RENDER_LOCK = join(DIR, "yok", "alt", "render.lock");
    try {
      const fresh = await import("../src/render.ts");
      await expect(fresh.withRenderLock(async () => 1)).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      process.env.YS_RENDER_LOCK = LOCK;
    }
  });

  it("kilit yolu verilmezse sistem Temp'indeki ys-render.lock kullanılır", async () => {
    // Temp geçici klasöre çevrilir: gerçek makine kilidine dokunulmaz.
    const temp = join(DIR, "temp");
    mkdirSync(temp);
    const keys = ["YS_RENDER_LOCK", "TEMP", "TMP", "TMPDIR"] as const;
    const saved = keys.map((k) => process.env[k]);
    delete process.env.YS_RENDER_LOCK;
    process.env.TEMP = process.env.TMP = process.env.TMPDIR = temp;
    vi.resetModules();
    try {
      const fresh = await import("../src/render.ts");
      const lock = join(temp, "ys-render.lock");
      expect(await fresh.withRenderLock(async () => existsSync(lock))).toBe(true);
      expect(existsSync(lock)).toBe(false);
    } finally {
      keys.forEach((k, i) => (saved[i] === undefined ? delete process.env[k] : (process.env[k] = saved[i])));
    }
  });
});

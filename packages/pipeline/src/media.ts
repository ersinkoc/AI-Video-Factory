import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalizedError, msg } from "@ys/core";
import { runMediaTool } from "@ys/video/tools";
import { ALIGN, parseSilences, type Silence } from "./align.ts";

/** ffprobe ile medya süresi (ms). PATH'te ffprobe yoksa Remotion'un kopyası kullanılır. */
export async function probeDurationMs(bytes: Uint8Array, ext: string): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), "ys-probe-"));
  const file = join(dir, `media.${ext}`);
  try {
    await writeFile(file, bytes);
    const { stdout } = await runMediaTool("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    const sec = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(sec)) throw new LocalizedError(msg("err.media.probe", { output: stdout }));
    return Math.round(sec * 1000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Sesteki sessizlikler (ms; ffmpeg silencedetect): kelime zamanları bunlara hizalanır (align.ts). Ölçülemezse (ffmpeg
 * yok, filtre yok, bozuk dosya) boş liste: zamanlar noktalamadan tahmin edilir, seslendirme düşmez.
 */
export async function detectSilences(bytes: Uint8Array, ext: string, durationMs: number): Promise<Silence[]> {
  const dir = await mkdtemp(join(tmpdir(), "ys-silence-"));
  const file = join(dir, `voice.${ext}`);
  try {
    await writeFile(file, bytes);
    const { stderr } = await runMediaTool("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", `silencedetect=noise=${ALIGN.noiseDb}dB:d=${ALIGN.minSilence}`, "-f", "null", "-"]);
    return parseSilences(stderr, durationMs);
  } catch {
    return [];
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Klibi render'a uygun hâle getirir: sabit fps, hedef çözünürlük (kırparak doldurur), sık keyframe, sessiz.
 * Sağlayıcılar 24 fps ve 1928×1072 gibi tek sayılı boyutlar döndürebiliyor; bu, render'da decode yükünü azaltır.
 */
export async function normalizeClip(input: string, output: string, width: number, height: number, fps: number): Promise<void> {
  // Remotion'un ffmpeg'inde fps filtresi yok: yedeğe düşmez.
  await runMediaTool(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-i",
      input,
      "-an",
      "-vf",
      `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=${fps}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-g",
      String(fps),
      "-pix_fmt",
      "yuv420p",
      output,
    ],
    false,
  );
}

/** Eşzamanlılığı sınırlı map; sağlayıcı rate limit'lerine ve GPU belleğine saygı için. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failure: { error: unknown } | undefined;
  // İlk hatadan sonra yeni iş alınmaz (paralel işçiler para harcamaya ve durumu yazmaya devam etmesin); süren işler
  // bitince hata fırlatılır, böylece hemen başlatılan bir "devam" ikinci bir yazarla çakışmaz.
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length && !failure) {
      const i = next++;
      try {
        results[i] = await fn(items[i]!, i);
      } catch (error) {
        failure ??= { error };
      }
    }
  });
  await Promise.all(workers);
  if (failure) throw failure.error;
  return results;
}

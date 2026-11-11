import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { RenderInternals } from "@remotion/renderer";
import { LocalizedError, msg } from "@ys/core";

const run = promisify(execFile);

/**
 * ffmpeg/ffprobe'u PATH'ten çalıştırır; PATH'te yoksa (ENOENT) Remotion'un kendi kopyasıyla dener. Stüdyo, FFmpeg
 * kurulmadan önce açılmış bir terminalden başlatılınca PATH'i eski kalıyor ve seslendirme "spawn ffprobe ENOENT" ile
 * düşüyordu (1 Kas). Remotion'un ffmpeg'inde fps filtresi yok: `bundled: false` olan çağrı (klip normalleştirme)
 * yedeğe düşmez, ne yapılacağını söyleyen hata verir.
 */
export async function runMediaTool(tool: "ffmpeg" | "ffprobe", args: string[], bundled = true, options?: { timeout: number; maxBuffer: number; encoding?: "utf8" | "latin1" }): Promise<{ stdout: string; stderr: string }> {
  try {
    return options ? await run(tool, args, options) : await run(tool, args);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    if (!bundled) throw new LocalizedError(msg("err.media.missing", { tool }));
    const executable = RenderInternals.getExecutablePath({ type: tool, indent: false, logLevel: "error", binariesDirectory: null });
    return options ? run(executable, args, options) : run(executable, args);
  }
}

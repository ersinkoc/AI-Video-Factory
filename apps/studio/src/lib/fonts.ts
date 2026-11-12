import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fontAsset, TYPOGRAPHY_PAIRS } from "@ys/core/typography";
import { ROOT } from "./server";

/** Bilinen yazı tipi dosyaları: zaman çizelgesindeki yol (`typography/<ad>.woff`) → @fontsource paketi. */
const FILES = new Map(
  Object.values(TYPOGRAPHY_PAIRS)
    .flatMap((pair) => [pair.heading, pair.body])
    .flatMap((face) => (["latin", "latin-ext"] as const).map((subset) => [fontAsset(face, subset), face.id] as const)),
);

/**
 * Oynatıcının yazı tipi dosyası: render'ın public/ klasörüne kopyaladığı (video `stageTypography`) aynı baytlar, video
 * paketinin bağımlılığından okunur. Yol dosya sisteminden kurulur: `require.resolve` ile çözülünce Turbopack kalıba uyan
 * bütün .woff dosyalarını pakete almaya çalışıp uç noktayı düşürüyordu. Bilinmeyen ya da kurulu olmayan dosya null.
 */
export async function typographyFile(file: string): Promise<Uint8Array | null> {
  const id = FILES.get(file);
  if (!id) return null;
  try {
    return new Uint8Array(await readFile(join(ROOT, "packages", "video", "node_modules", "@fontsource", id, "files", file.slice("typography/".length))));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

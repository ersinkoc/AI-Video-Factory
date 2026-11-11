import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { fontAsset, TYPOGRAPHY_PAIRS, sideAssetId, type Timeline } from "@ys/core";
import { captionPages, cutsOf } from "./cut.ts";

/**
 * Parça parça render önbelleği (4 Kas): yönetmen notuyla yeniden oluşturulan iki sahne için ya da %80'de çöken render'dan
 * sonra bütün bölüm baştan render ediliyordu (3 dk'lık bölüm 3–27 dk, 14 dk'lık Osmanlı bölümü saatler). Görüntü sahne
 * sınırlarında parçalara bölünür; her parçanın anahtarı onu çizen her şeyin özetidir (çekimler, çizimleri, dosyaları,
 * konuşma, altyazı sayfaları, render kodu). Anahtarı değişmeyen parça önbellekten gelir.
 */
export const CHUNK = {
  /** Uzun sahne çekim sınırından bölünür (sn): çöken render'da kaybedilen iş de sınırlı kalır. */
  maxSec: 60,
  /** Dudak ve vurgular parçanın biraz öncesine/sonrasına bakar (ses duraklaması, cümle başı): ms pay. */
  speechPadMs: 2000,
} as const;

export interface ChunkRange {
  /** Kare aralığı [from, to). */
  from: number;
  to: number;
}

/** "s3-sh2" → "s3"; sahne öneki yoksa çekimin kendisi. */
const sceneOf = (shotId: string) => /^([^-]+)-/.exec(shotId)?.[1] ?? shotId;

/** Bölümü sahne sınırlarında (uzun sahne çekim sınırında da) bölen, art arda ve boşluksuz kare aralıkları. */
export function chunkRanges(timeline: Timeline): ChunkRange[] {
  const max = CHUNK.maxSec * timeline.fps;
  const starts = [0];
  timeline.visuals.forEach((v, i) => {
    const last = starts.at(-1)!;
    if (i === 0 || v.fromFrame <= last || v.fromFrame >= timeline.durationInFrames) return;
    if (sceneOf(v.shotId) !== sceneOf(timeline.visuals[i - 1]!.shotId) || v.fromFrame - last >= max) starts.push(v.fromFrame);
  });
  return starts.map((from, i) => ({ from, to: starts[i + 1] ?? timeline.durationInFrames }));
}

const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");

/** Yerel dosyanın içerik özeti; http adresi olduğu gibi (ağdan gelen içerik adresiyle anılır), olmayan dosya "yok". */
async function fileKey(publicDir: string, url: string, memo: Map<string, string>): Promise<string> {
  if (/^https?:\/\//.test(url)) return url;
  const hit = memo.get(url);
  if (hit) return hit;
  const key = await readFile(join(publicDir, ...url.split("/"))).then(sha, () => "missing");
  memo.set(url, key);
  return key;
}

/**
 * Her parçanın anahtarı. Parçanın karelerini belirleyen: kare aralığı ve boyut, aralığa düşen çekimler (öncekinin geçiş
 * için uzayan son kareleri dahil), vektör çekimlerin çizimleri, görsel/klip/Manim dosyalarının içeriği, palet, çizgi ve
 * doku, aralığın çevresindeki konuşma ve aralıkta görünen altyazı sayfaları, render kodu. Ses parçalara girmez (ayrı
 * render edilir).
 */
export async function chunkKeys(timeline: Timeline, ranges: ChunkRange[], publicDir: string, code: string): Promise<string[]> {
  const memo = new Map<string, string>();
  const ms = (frame: number) => (frame / timeline.fps) * 1000;
  const pages = timeline.captions.length ? captionPages(timeline.captions) : [];
  const last = timeline.visuals.length - 1;
  // Episode: her çekim bir sonrakinin geçişi boyunca onun altında uzar (cutsOf); ilk çekime geçiş yok.
  const cuts = cutsOf(timeline.visuals, timeline.episodeId);
  const tail = (i: number) => cuts[i + 1]?.frames ?? 0;
  const keys: string[] = [];
  const fontHashes: Record<string, string> = {};
  if (timeline.typography) {
    for (const face of Object.values(TYPOGRAPHY_PAIRS[timeline.typography.pair])) {
      for (const subset of ["latin", "latin-ext"] as const) {
        const file = fontAsset(face, subset);
        fontHashes[file] = await fileKey(publicDir, file, memo);
      }
    }
  }
  for (const { from, to } of ranges) {
    const shots = timeline.visuals.flatMap((v, i) => (v.fromFrame < to && v.fromFrame + v.durationInFrames + tail(i) > from ? [{ v, first: i === 0, last: i === last, cut: cuts[i] ?? null, tail: tail(i) }] : []));
    const assets: Record<string, unknown> = {};
    const files: Record<string, string> = {};
    for (const { v } of shots) {
      if (v.vector) {
        const ids = [...v.vector.layers.map((l) => l.asset), ...(v.vector.background ? [v.vector.background] : [])];
        for (const id of ids) for (const k of [id, sideAssetId(id)]) if (timeline.vectorAssets[k]) assets[k] = timeline.vectorAssets[k];
      } else if (v.assetUrl) files[v.assetUrl] = await fileKey(publicDir, v.assetUrl, memo);
      if (v.overlay) files[v.overlay] = await fileKey(publicDir, v.overlay, memo);
    }
    const span = shots.length ? [Math.min(...shots.map((s) => ms(s.v.fromFrame))), Math.max(...shots.map((s) => ms(s.v.fromFrame + s.v.durationInFrames + s.tail)))] : [ms(from), ms(to)];
    const speech = (timeline.speech ?? []).filter((w) => w.endMs > span[0]! - CHUNK.speechPadMs && w.startMs < span[1]! + CHUNK.speechPadMs);
    const shown = pages.filter((p) => p.startMs < ms(to) && p.startMs + p.durationMs > ms(from));
    keys.push(
      sha(
        JSON.stringify({
          code,
          size: [timeline.width, timeline.height, timeline.fps],
          range: [from, to],
          shots,
          assets,
          files,
          fonts: fontHashes,
          look: [timeline.palette, timeline.lineStyle ?? null, timeline.texture ?? null, timeline.typography ?? null],
          speech,
          pages: shown,
        }),
      ).slice(0, 32),
    );
  }
  return keys;
}

/** Ses izinin anahtarı: ses girdileri, dosyaları, bölüm süresi ve render kodu. */
export async function audioKey(timeline: Timeline, publicDir: string, code: string): Promise<string> {
  const memo = new Map<string, string>();
  const files: string[] = [];
  for (const a of timeline.audio) files.push(await fileKey(publicDir, a.assetUrl, memo));
  return sha(JSON.stringify({ code, fps: timeline.fps, frames: timeline.durationInFrames, audio: timeline.audio, files })).slice(0, 32);
}

const SRC = dirname(fileURLToPath(import.meta.url));
/** Kareyi çizen kod: video ve core kaynakları ile paket tanımları (bağımlılık sürümleri). */
const CODE_ROOTS = [SRC, resolve(SRC, "../../core/src")];
const CODE_FILES = [resolve(SRC, "../package.json"), resolve(SRC, "../../core/package.json")];

let codeMemo: Promise<string> | undefined;
/**
 * Render kodunun özeti: kod değişince (yeni kamera kuralı, poz düzeltmesi) eski parçalar kullanılmaz. Süreç başına bir kez
 * hesaplanır.
 */
export function renderCode(roots: string[] = CODE_ROOTS, extra: string[] = CODE_FILES): Promise<string> {
  const run = async () => {
    // Ad, makineden bağımsız (kök sırası + göreli yol); içerikle birlikte özetlenir.
    const files: [string, string][] = extra.map((f, i) => [`x${i}`, f]);
    for (const [r, root] of roots.entries()) {
      for (const f of await readdir(root, { recursive: true, withFileTypes: true })) {
        const path = join(f.parentPath, f.name);
        if (f.isFile()) files.push([`${r}:${relative(root, path).split(sep).join("/")}`, path]);
      }
    }
    const h = createHash("sha256");
    for (const [name, path] of files.sort((a, b) => (a[0] < b[0] ? -1 : 1))) h.update(name).update(await readFile(path));
    return h.digest("hex").slice(0, 16);
  };
  if (roots !== CODE_ROOTS || extra !== CODE_FILES) return run();
  return (codeMemo ??= run());
}

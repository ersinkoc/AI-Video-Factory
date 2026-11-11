import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, readdir } from "node:fs/promises";
import { join, dirname, resolve, relative, isAbsolute } from "node:path";
import type { EpisodeState } from "./state.ts";
import type { Timeline } from "@ys/core";

export interface BenchShot { episode: string; shot: string; category: "close" | "wide" | "group" | "scene" }
export interface FrozenBenchmark {
  version: 1; at: string; inputHash: string; shots: BenchShot[];
  files: { path: string; sha256: string }[];
}
export const fingerprint = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
export function comparableBenchmarks(a: { inputHash?: string; reviewerHash?: string; reviewStatus?: string }, b: { inputHash?: string; reviewerHash?: string; reviewStatus?: string }): boolean {
  return Boolean(a.inputHash && a.inputHash === b.inputHash && a.reviewerHash && a.reviewerHash === b.reviewerHash && a.reviewStatus === "complete" && b.reviewStatus === "complete");
}
export function inside(root: string, path: string): string {
  if (!path || path.includes("\\") || path.includes(":") || path.split("/").some((p) => !p || p === "." || p === "..")) throw new Error("Invalid fixture asset path");
  const target = resolve(root, path), rel = relative(resolve(root), target);
  if (isAbsolute(rel) || rel.startsWith("..")) throw new Error("Fixture path escapes root");
  return target;
}

/** Publish a complete immutable snapshot atomically. Existing fixtures are never replaced. */
export async function freezeBenchmark(opts: {
  directory: string; shots: BenchShot[]; load: (episode: string) => Promise<EpisodeState>;
  asset: (episode: string, key: string) => Promise<Uint8Array>;
}): Promise<FrozenBenchmark> {
  if (!opts.shots.length) throw new Error("Benchmark set is empty");
  await mkdir(dirname(opts.directory), { recursive: true });
  const staging = `${opts.directory}.pending-${randomUUID()}`;
  await mkdir(staging);
  const files: FrozenBenchmark["files"] = [];
  const put = async (path: string, bytes: Uint8Array) => {
    const target = inside(staging, path); await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" }); files.push({ path, sha256: fingerprint(bytes) });
  };
  for (const episode of new Set(opts.shots.map((s) => s.episode))) {
    inside(staging, episode);
    const state = structuredClone(await opts.load(episode));
    if (!state.timeline) throw new Error(`Timeline missing: ${episode}`);
    for (const selected of opts.shots.filter((s) => s.episode === episode)) if (!state.timeline.visuals.some((v) => v.shotId === selected.shot) || !state.shots?.some((s) => s.id === selected.shot)) throw new Error(`Shot missing: ${episode}/${selected.shot}`);
    const timeline = { ...state.timeline, captions: state.input.captions === false ? [] : state.timeline.captions };
    const keys = new Set([...timeline.visuals.flatMap((v) => [v.assetUrl, v.overlay, v.motion?.depthAssetUrl].filter((s): s is string => Boolean(s))), ...timeline.audio.map((a) => a.assetUrl)]);
    for (const key of [...keys].sort()) {
      if (/^[a-z]+:/i.test(key)) throw new Error(`Stage remote media locally before freezing: ${key}`);
      await put(`public/${episode}/${key}`, await opts.asset(episode, key));
    }
    // Keep only the planning/review inputs needed by the benchmark, not mutable activity/cost state.
    await put(`states/${episode}.json`, Buffer.from(JSON.stringify({ id: state.id, input: state.input, timeline, shots: state.shots, style: state.style })));
  }
  files.sort((a, b) => a.path.localeCompare(b.path, "en"));
  const inputHash = fingerprint(JSON.stringify({ shots: opts.shots, files }));
  const manifest: FrozenBenchmark = { version: 1, at: new Date().toISOString(), inputHash, shots: opts.shots, files };
  await writeFile(join(staging, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
  // A published directory contains a manifest, so rename cannot replace it.
  await rename(staging, opts.directory);
  return manifest;
}

export async function verifyBenchmark(directory: string): Promise<FrozenBenchmark> {
  const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as FrozenBenchmark;
  if (manifest.version !== 1 || !manifest.shots.length || fingerprint(JSON.stringify({ shots: manifest.shots, files: manifest.files })) !== manifest.inputHash) throw new Error("Invalid benchmark manifest");
  for (const file of manifest.files) if (fingerprint(await readFile(inside(directory, file.path))) !== file.sha256) throw new Error(`Benchmark input changed: ${file.path}`);
  return manifest;
}

/** Distinct short samples around an entrance/action and a cut; absolute frame clocks stay unchanged. */
export function benchmarkClip(timeline: Timeline, shotId: string): [number, number] {
  const shot = timeline.visuals.find((v) => v.shotId === shotId);
  if (!shot) throw new Error(`Shot missing: ${shotId}`);
  const end = Math.min(timeline.durationInFrames - 1, shot.fromFrame + shot.durationInFrames + Math.round(timeline.fps * .5) - 1);
  const from = Math.max(shot.fromFrame - Math.round(timeline.fps * .5), end - timeline.fps * 6 + 1, 0);
  return [from, end];
}

/** Hash actual dirty source content, including prompts, renderer and pinned dependencies. */
export async function benchmarkCode(root: string): Promise<string> {
  const files: { path: string; hash: string }[] = [];
  const walk = async (path: string) => {
    for (const entry of (await readdir(join(root, path), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      if (["node_modules", ".next", "public"].includes(entry.name)) continue;
      const child = `${path}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else if (/\.(ts|tsx|json)$/.test(entry.name) && !/tsbuildinfo/.test(entry.name)) files.push({ path: child, hash: fingerprint(await readFile(join(root, child))) });
    }
  };
  for (const path of ["packages", "apps", "scripts"]) await walk(path);
  for (const path of ["package.json", "pnpm-lock.yaml"]) files.push({ path, hash: fingerprint(await readFile(join(root, path))) });
  return fingerprint(JSON.stringify(files));
}

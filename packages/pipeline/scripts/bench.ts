/**
 * Kalite ölçüm tezgâhı: üretilmiş bölümlerden sabit bir çekim seti güncel kodla yeniden çizilir ve inceleme
 * aşamasının denetçisi (scene-critic, Stüdyo → Modeller seçimiyle) puanlar. Bir değişikliğin işe yarayıp yaramadığı
 * aynı sette, aynı gruplarla puanla görülür. Bölüm klasörlerine hiçbir şey yazılmaz; her şey `.data/bench/` altında.
 *
 *   pnpm bench pick [n]            sabit seti seçer (.data/bench/set.json; varsa dokunmaz)
 *   pnpm bench run <ad> [--free]   kareleri çizer, denetletir (~0,1 $), kaydeder ve önceki ölçümlerle karşılaştırır;
 *                                  --free yalnız kareleri çizer (model çağrısı yok)
 *   pnpm bench diff <a> <b>        iki ölçümü karşılaştırır
 *
 * Kareler inceleme aşamasındaki gibi çekimin %80'inden, 960×540 alınır; denetçiye aynı amaç metni gider
 * (çekim açıklaması + o andaki anlatım). Gruplar (6'lı) set sırasıyla sabittir: "tekrar" kusuru ölçümler arasında
 * aynı komşulara bakar. Denetçi rastlantısaldır; aynı kodla iki ölçüm farkı gürültü tabanını verir.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cleanModelSettings, type Timeline } from "@ys/core";
import { sceneCritic, type CriticShot } from "@ys/agents";
import { renderStills } from "@ys/video/render";
import type { EpisodeState } from "../src/state.ts";

const ROOT = resolve(import.meta.dirname, "../../..");
const DATA = join(ROOT, ".data");
const BENCH = join(DATA, "bench");
const SET = join(BENCH, "set.json");
const RUNS = join(BENCH, "runs");
const statePath = (id: string) => join(DATA, "assets", "episodes", id, "state.json");

type Category = "close" | "wide" | "group" | "scene";
/** 30'luk sette kategori payları; az görülenler (kalabalık, kişisiz) üretimdeki oranından fazla örneklenir. */
const QUOTA: Record<Category, number> = { close: 10, wide: 12, group: 4, scene: 4 };
const PER_EPISODE = 3;
const BATCH = 6;

interface BenchShot {
  episode: string;
  shot: string;
  category: Category;
}
interface BenchSet {
  at: string;
  shots: BenchShot[];
}
interface ShotResult {
  score: number;
  issues: { type: string; detail: string }[];
}
interface BenchRun {
  label: string;
  at: string;
  commit: string;
  costUsd: number;
  stills: Record<string, string>;
  shots: Record<string, ShotResult>;
}

const keyOf = (s: { episode: string; shot: string }) => `${s.episode}/${s.shot}`;
const readJson = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, "utf8")) as T;
const loadState = (id: string) => readJson<EpisodeState>(statePath(id));

async function episodes(): Promise<string[]> {
  const ids = await readdir(join(DATA, "assets", "episodes"));
  return ids.filter((id) => existsSync(statePath(id))).sort();
}

function categoryOf(timeline: Timeline, shotId: string): Category | undefined {
  const v = timeline.visuals.find((x) => x.shotId === shotId);
  if (!v?.vector) return undefined;
  const kinds = timeline.vectorAssets ?? {};
  const people = v.vector.layers.filter((l) => kinds[l.asset]?.kind === "character").length;
  const zoom = Math.max(v.vector.camera?.zoomFrom ?? 1, v.vector.camera?.zoomTo ?? 1);
  if (!people) return "scene";
  if (people >= 3) return "group";
  return zoom >= 1.5 ? "close" : "wide";
}

/** Sabit set: kategori içinde içerik hash'ine göre sıralı, bölüm başına en fazla 3. Aynı veriyle hep aynı seçim. */
async function pick(n: number): Promise<void> {
  if (existsSync(SET)) {
    console.log(`Set zaten var (${SET}); yeniden seçmek için dosyayı silin.`);
    return;
  }
  const pool = new Map<Category, BenchShot[]>();
  for (const id of await episodes()) {
    const state = await loadState(id);
    // Altyazısız bölümler: denetçiye tek bir "altyazı yok" bayrağıyla gidilir (son bölümlerin hepsi böyle).
    if (!state.timeline || !state.shots || state.input.captions !== false) continue;
    for (const s of state.shots) {
      const category = categoryOf(state.timeline, s.id);
      if (category) pool.set(category, [...(pool.get(category) ?? []), { episode: id, shot: s.id, category }]);
    }
  }
  const hash = (s: BenchShot) => createHash("sha256").update(keyOf(s)).digest("hex");
  const perEpisode = new Map<string, number>();
  const chosen: BenchShot[] = [];
  const scale = n / Object.values(QUOTA).reduce((a, b) => a + b, 0);
  for (const [category, quota] of Object.entries(QUOTA) as [Category, number][]) {
    const want = Math.round(quota * scale);
    const sorted = (pool.get(category) ?? []).sort((a, b) => hash(a).localeCompare(hash(b)));
    let got = 0;
    for (const s of sorted) {
      if (got >= want) break;
      if ((perEpisode.get(s.episode) ?? 0) >= PER_EPISODE) continue;
      perEpisode.set(s.episode, (perEpisode.get(s.episode) ?? 0) + 1);
      chosen.push(s);
      got++;
    }
  }
  chosen.sort((a, b) => keyOf(a).localeCompare(keyOf(b), "en", { numeric: true }));
  await mkdir(BENCH, { recursive: true });
  await writeFile(SET, JSON.stringify({ at: new Date().toISOString(), shots: chosen } satisfies BenchSet, null, 2));
  const count = (c: Category) => chosen.filter((s) => s.category === c).length;
  console.log(`${chosen.length} çekim, ${new Set(chosen.map((s) => s.episode)).size} bölüm: yakın ${count("close")}, geniş ${count("wide")}, kalabalık ${count("group")}, kişisiz ${count("scene")}`);
}

function commit(): string {
  const git = (...a: string[]) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
  const head = git("rev-parse", "--short", "HEAD");
  // Commit edilmemiş kod değişikliği varsa (DFMT dosyaları sayılmaz) işaretlenir.
  const dirty = git("status", "--porcelain", "--", "packages", "apps").length > 0;
  return dirty ? `${head}+dirty` : head;
}

/** Kareler: bölüm başına bir Remotion işi (render kilidini bekler). Ses gerekmez; Manim klipleri tezgâh klasörüne kopyalanır. */
async function stills(set: BenchSet, dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const ids = [...new Set(set.shots.map((s) => s.episode))];
  for (const [i, id] of ids.entries()) {
    const state = await loadState(id);
    const wanted = new Set(set.shots.filter((s) => s.episode === id).map((s) => s.shot));
    const timeline: Timeline = { ...state.timeline!, captions: state.input.captions === false ? [] : state.timeline!.captions, audio: [] };
    const visuals = timeline.visuals.filter((v) => wanted.has(v.shotId));
    const publicDir = join(BENCH, "public", id);
    for (const v of visuals) {
      if (!v.overlay) continue;
      const target = join(publicDir, ...v.overlay.split("/"));
      if (existsSync(target)) continue;
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(DATA, "assets", ...v.overlay.split("/")), target);
    }
    await mkdir(publicDir, { recursive: true });
    const outDir = join(dir, "stills", id);
    await mkdir(outDir, { recursive: true });
    const frames = Object.fromEntries(visuals.map((v) => [v.shotId, v.fromFrame + Math.floor(v.durationInFrames * 0.8)]));
    const started = Date.now();
    try {
      const files = await renderStills({ timeline, publicDir, frames, outDir, onWait: (pid) => console.log(`render kilidi pid ${pid}'de, bekleniyor…`) });
      for (const [shot, file] of Object.entries(files)) out[`${id}/${shot}`] = file;
      console.log(`[${i + 1}/${ids.length}] ${id}: ${Object.keys(files).length} kare, ${((Date.now() - started) / 1000).toFixed(0)} sn`);
    } catch (e) {
      console.log(`[${i + 1}/${ids.length}] ${id}: kareler çıkarılamadı: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

async function critique(set: BenchSet, files: Record<string, string>): Promise<{ shots: Record<string, ShotResult>; costUsd: number }> {
  const models = cleanModelSettings(await readJson<unknown>(join(DATA, "assets", "settings", "models.json")).catch(() => undefined));
  const states = new Map<string, EpisodeState>();
  for (const id of new Set(set.shots.map((s) => s.episode))) states.set(id, await loadState(id));
  const items: (CriticShot & { key: string })[] = [];
  for (const s of set.shots) {
    const file = files[keyOf(s)];
    if (!file) continue;
    const state = states.get(s.episode)!;
    const shot = state.shots!.find((x) => x.id === s.shot)!;
    const spoken = state.timeline!.captions
      .filter((w) => w.startMs >= shot.startMs && w.startMs < shot.endMs)
      .map((w) => w.text)
      .join(" ");
    items.push({
      key: keyOf(s),
      // Denetçi uzun kimliği kısaltıp "s3-sh4" diye geri yazıyordu (bölümler arası çakıştı): set sırası gönderilir.
      shotId: `shot-${items.length + 1}`,
      image: { data: new Uint8Array(await readFile(file)), mimeType: "image/jpeg" },
      intent: `${shot.description} | narration: "${spoken}"`,
    });
  }
  const shots: Record<string, ShotResult> = {};
  let costUsd = 0;
  const batches: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += BATCH) batches.push(items.slice(i, i + BATCH));
  // Sırayla: aynı anda tek denetçi süreci (kullanıcının işleriyle yarışmasın).
  for (const [i, batch] of batches.entries()) {
    try {
      const res = await sceneCritic(batch, [], { models, log: (m) => console.log(`  ${m}`) }, false);
      costUsd += res.costUsd;
      for (const s of res.data.shots) {
        const key = batch.find((b) => b.shotId === s.shotId)?.key;
        if (key) shots[key] = { score: s.score, issues: s.issues.filter((x) => x.type !== "text_on_subtitles") };
        else console.log(`  tanınmayan çekim kimliği: ${s.shotId}`);
      }
      console.log(`denetim ${i + 1}/${batches.length}: ${res.data.shots.length} çekim, $${res.costUsd.toFixed(4)}`);
    } catch (e) {
      console.log(`denetim ${i + 1}/${batches.length} atlandı: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { shots, costUsd };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const fmt = (x: number) => (Number.isNaN(x) ? "-" : x.toFixed(2));
const signed = (x: number) => (Number.isNaN(x) ? "-" : `${x >= 0 ? "+" : ""}${x.toFixed(2)}`);

function issueCounts(run: BenchRun, keys: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const k of keys) for (const t of new Set((run.shots[k]?.issues ?? []).map((i) => i.type))) out.set(t, (out.get(t) ?? 0) + 1);
  return out;
}

function summary(set: BenchSet, run: BenchRun): void {
  const keys = set.shots.map(keyOf).filter((k) => run.shots[k]);
  console.log(`\n${run.label} (${run.commit}): ${keys.length}/${set.shots.length} çekim, ortalama ${fmt(mean(keys.map((k) => run.shots[k]!.score)))}, $${run.costUsd.toFixed(3)}`);
  for (const c of Object.keys(QUOTA) as Category[]) {
    const ks = set.shots.filter((s) => s.category === c).map(keyOf).filter((k) => run.shots[k]);
    console.log(`  ${c.padEnd(6)} ${fmt(mean(ks.map((k) => run.shots[k]!.score)))} (${ks.length})`);
  }
  console.log(`  kusurlu çekim sayısı: ${[...issueCounts(run, keys)].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} ${n}`).join(", ")}`);
}

/** Yalnız iki ölçümde de puanlanan çekimler karşılaştırılır. */
function diff(set: BenchSet, a: BenchRun, b: BenchRun): void {
  const keys = set.shots.map(keyOf).filter((k) => a.shots[k] && b.shots[k]);
  const score = (r: BenchRun, ks: string[]) => mean(ks.map((k) => r.shots[k]!.score));
  console.log(`\n${a.label} → ${b.label} (${keys.length} ortak çekim): ${fmt(score(a, keys))} → ${fmt(score(b, keys))} (${signed(score(b, keys) - score(a, keys))})`);
  for (const c of Object.keys(QUOTA) as Category[]) {
    const ks = set.shots.filter((s) => s.category === c).map(keyOf).filter((k) => keys.includes(k));
    console.log(`  ${c.padEnd(6)} ${fmt(score(a, ks))} → ${fmt(score(b, ks))} (${signed(score(b, ks) - score(a, ks))})`);
  }
  const ia = issueCounts(a, keys);
  const ib = issueCounts(b, keys);
  const types = [...new Set([...ia.keys(), ...ib.keys()])].sort();
  console.log(`  kusurlar: ${types.map((t) => `${t} ${ia.get(t) ?? 0}→${ib.get(t) ?? 0}`).join(", ")}`);
  const moved = keys.filter((k) => Math.abs(b.shots[k]!.score - a.shots[k]!.score) >= 2);
  for (const k of moved) console.log(`  ${k}: ${a.shots[k]!.score} → ${b.shots[k]!.score}`);
}

async function runs(): Promise<BenchRun[]> {
  if (!existsSync(RUNS)) return [];
  const names = (await readdir(RUNS)).sort();
  const out: BenchRun[] = [];
  for (const n of names) if (existsSync(join(RUNS, n, "result.json"))) out.push(await readJson<BenchRun>(join(RUNS, n, "result.json")));
  return out;
}

async function run(label: string, free: boolean): Promise<void> {
  const set = await readJson<BenchSet>(SET);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const dir = join(RUNS, `${stamp}-${label}`);
  await mkdir(dir, { recursive: true });
  const files = await stills(set, dir);
  console.log(`kareler: ${dir}${join("/", "stills")}`);
  if (free) return;
  const before = (await runs()).filter((r) => Object.keys(r.shots).length);
  const { shots, costUsd } = await critique(set, files);
  const result: BenchRun = { label, at: new Date().toISOString(), commit: commit(), costUsd, stills: files, shots };
  await writeFile(join(dir, "result.json"), JSON.stringify(result, null, 2));
  summary(set, result);
  if (before.length) diff(set, before[0]!, result);
  if (before.length > 1) diff(set, before.at(-1)!, result);
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "pick") await pick(Number(args[0] ?? 30));
else if (cmd === "run" && args[0]) await run(args[0], args.includes("--free"));
else if (cmd === "diff" && args[0] && args[1]) {
  const all = await runs();
  const find = (l: string) => all.find((r) => r.label === l) ?? (() => { throw new Error(`ölçüm yok: ${l}`); })();
  diff(await readJson<BenchSet>(SET), find(args[0]), find(args[1]));
} else {
  console.error("Kullanım: bench pick [n] | bench run <ad> [--free] | bench diff <a> <b>");
  process.exit(1);
}

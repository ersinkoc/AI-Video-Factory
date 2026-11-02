import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { LocalizedError, MATH_BOARD, msg, type MathSpec } from "@ys/core";

/**
 * Manim tahtası: yönetmenin formül/grafik tarifinden kod bir Manim sahnesi yazar ve yerel Manim ile saydam WebM
 * klibe render eder (API yok, ücretsiz). Modelin yazdığı kod çalıştırılmaz: Python betiği yalnız bu dosyada
 * üretilir, metinler JSON dizesi olarak gömülür, LaTeX izinli komut listesinden geçer (dosya okuyan/yazan komut yok).
 */

/** İzinli LaTeX komutları: matematik yazımı; dosya, makro tanımı ve kabuk erişimi olan hiçbir komut yok. */
const ALLOWED = new Set(
  (
    "frac dfrac tfrac sqrt sum prod int iint oint lim infty partial nabla cdot times div pm mp leq geq neq approx equiv sim " +
    "propto to rightarrow leftarrow Rightarrow Leftarrow leftrightarrow mapsto left right big Big bigl bigr Bigl Bigr " +
    "sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln exp min max det mathrm mathbf mathit mathcal " +
    "vec hat bar overline underline dot ddot quad qquad ldots cdots dots circ prime in notin subset subseteq cup cap " +
    "forall exists neg land lor angle perp parallel triangle hbar ell Re Im mid " +
    "alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho sigma tau " +
    "upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega"
  ).split(" "),
);

/**
 * LaTeX güvenli mi: yalnız ASCII, izinli komutlar, dengeli süslü parantez. `^^` (TeX'in karakter kodu kaçışı, ters
 * eğik çizgi üretebilir), `%`, `#`, `$` ve izinsiz her komut reddedilir.
 */
export function safeLatex(tex: string): boolean {
  if (!tex.trim() || /[^\x20-\x7e]/.test(tex) || /\^\^|[%#$@"`~]/.test(tex)) return false;
  for (const m of tex.matchAll(/\\([a-zA-Z]+|[\s\S]?)/g)) {
    const c = m[1]!;
    if (/^[a-zA-Z]+$/.test(c) ? !ALLOWED.has(c) : !",;:! {}|".includes(c) || c === "") return false;
  }
  let depth = 0;
  for (const ch of tex.replace(/\\[{}]/g, "")) {
    if (ch === "{") depth++;
    if (ch === "}" && --depth < 0) return false;
  }
  return depth === 0;
}

/** İzinsiz adımları ayıklar (günlüğe yazılsın diye ayrı döner). */
export function cleanMath(spec: MathSpec): { spec: MathSpec; dropped: string[] } {
  return { spec: { ...spec, steps: spec.steps.filter(safeLatex) }, dropped: spec.steps.filter((s) => !safeLatex(s)) };
}

/** Grafiğin rengi: paletin okunur, doygun rengi (koyu tahtada); yoksa sarı. */
export function boardAccent(palette: string[]): string {
  const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16) / 255) as [number, number, number];
  const ok = palette.filter((c) => /^#[\da-f]{6}$/i.test(c)).filter((c) => {
    const [r, g, b] = rgb(c);
    const max = Math.max(r, g, b);
    return max > 0.55 && (max - Math.min(r, g, b)) / max > 0.35;
  });
  return ok[0] ?? "#ffd84d";
}

/** Eksen için yuvarlak aralık ve adım (~5 bölme). */
export function niceRange(min: number, max: number): [number, number, number] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)!;
  const lo = Math.floor(min / step) * step;
  // Tek değerli veride eksen noktaya inmesin (Manim sıfır uzunluklu ekseni çizemez).
  return [lo, Math.max(Math.ceil(max / step) * step, lo + step), step];
}

/** Python dizesi: JSON dizesi geçerli bir Python dizesidir (kaçışlar dahil). */
const py = (s: string) => JSON.stringify(s);
const num = (n: number) => String(+n.toFixed(4));

/** Çekim süresine göre canlandırma süreleri: önce animasyonlar, kalan süre adımlar arasında eşit bekleme. */
export function boardTiming(spec: MathSpec, sec: number): { runs: number[]; wait: number } {
  const runs = [...spec.steps.map((_, i) => (i === 0 ? 1.2 : 1)), ...(spec.graph ? [0.8, 1.5] : [])];
  const available = Math.max(1, sec - 0.3);
  const base = runs.reduce((a, b) => a + b, 0);
  const k = Math.min(1, available / base);
  return { runs: runs.map((r) => +(r * k).toFixed(3)), wait: Math.max(0, +((available - base * k) / runs.length).toFixed(3)) };
}

/** Tariften Manim sahnesi (Python). Tahta 1040×560 piksel: çerçeve 8 birim yüksek, ~14,86 birim geniş. */
export function boardScript(spec: MathSpec, sec: number, accent: string): string {
  const { runs, wait } = boardTiming(spec, sec);
  let r = 0;
  const run = () => num(runs[r++]!);
  const both = spec.steps.length > 0 && spec.graph !== undefined;
  const out = [
    "from manim import *",
    "",
    'INK = "#f4f1ea"',
    `ACCENT = ${py(accent)}`,
    "",
    "",
    "def fit(m, w, h):",
    "    m.scale(min(w / m.width, h / m.height, 1.8))",
    "    return m",
    "",
    "",
    "class MathBoard(Scene):",
    "    def construct(self):",
  ];
  const line = (s: string) => out.push(`        ${s}`);
  const [w, h, at] = both ? [12, 1.6, "UP * 2.6"] : [13, 3, "ORIGIN"];
  spec.steps.forEach((step, i) => {
    line(`nxt = fit(MathTex(${py(step)}, color=INK), ${w}, ${h}).move_to(${at})`);
    line(i === 0 ? `self.play(Write(nxt), run_time=${run()})` : `self.play(TransformMatchingTex(eq, nxt), run_time=${run()})`);
    line("eq = nxt");
    line(`self.wait(${num(wait)})`);
  });
  if (spec.graph) {
    const g = spec.graph;
    const xs = g.points.map((p) => p[0]);
    const ys = g.points.map((p) => p[1]);
    const [x0, x1, xs1] = niceRange(Math.min(...xs), Math.max(...xs));
    const [y0, y1, ys1] = niceRange(Math.min(0, ...ys), Math.max(...ys));
    const [gw, gh, gat] = both ? [11, 4.4, "DOWN * 1.0"] : [12.5, 6.2, "ORIGIN"];
    // Yıl ve büyük sayılar ayraçsız ve ondalıksız; adım kesirliyse adımın hanesi kadar ondalık.
    const digits = (step: number) => (step >= 1 ? 0 : Math.ceil(-Math.log10(step)));
    const axis = (step: number) => `{"decimal_number_config": {"num_decimal_places": ${digits(step)}, "group_with_commas": False}}`;
    if (g.kind === "bar") {
      line(
        `ax = BarChart(values=[${ys.map(num).join(", ")}], bar_names=[${xs.map((x) => py(num(x))).join(", ")}], y_range=[${num(y0)}, ${num(y1)}, ${num(ys1)}], x_length=${gw}, y_length=${gh}, bar_colors=[ACCENT], bar_fill_opacity=0.9, axis_config={"color": INK, "font_size": 30}, y_axis_config=${axis(ys1)}).move_to(${gat})`,
      );
    } else {
      line(
        `ax = Axes(x_range=[${num(x0)}, ${num(x1)}, ${num(xs1)}], y_range=[${num(y0)}, ${num(y1)}, ${num(ys1)}], x_length=${gw}, y_length=${gh}, tips=False, axis_config={"color": INK, "include_numbers": True, "font_size": 30}, x_axis_config=${axis(xs1)}, y_axis_config=${axis(ys1)}).move_to(${gat})`,
      );
    }
    line(`labels = ax.get_axis_labels(Text(${py(g.xLabel ?? "")}, font_size=26, color=INK), Text(${py(g.yLabel ?? "")}, font_size=26, color=INK))`);
    if (g.kind === "bar") {
      line(`self.play(Create(ax.x_axis), Create(ax.y_axis), FadeIn(labels), run_time=${run()})`);
      line(`self.play(LaggedStart(*[GrowFromEdge(b, DOWN) for b in ax.bars], lag_ratio=0.15), FadeIn(ax.x_axis.labels), run_time=${run()})`);
    } else {
      line(`self.play(Create(ax), FadeIn(labels), run_time=${run()})`);
      line(`pts = [ax.c2p(x, y) for x, y in [${g.points.map(([x, y]) => `(${num(x)}, ${num(y)})`).join(", ")}]]`);
      line("curve = VMobject(color=ACCENT, stroke_width=7).set_points_as_corners(pts)");
      line("dots = VGroup(*[Dot(p, color=ACCENT, radius=0.07) for p in pts])");
      line(`self.play(Create(curve), LaggedStart(*[FadeIn(d) for d in dots], lag_ratio=0.3), run_time=${run()})`);
    }
    line(`self.wait(${num(wait * 2)})`);
  }
  return `${out.join("\n")}\n`;
}

/** Ortam değişkenleri (testte elle verilir). */
export type Env = Record<string, string | undefined>;

/** Alt süreç: çıkış kodu ve birleşik çıktı (testte sahte). */
export type BoardRun = (cmd: string, args: string[], env: Env, cwd: string) => Promise<{ code: number; output: string }>;

/** Sinyalle öldürülen sürecin kodu yoktur: başarısız sayılır. */
export const exitCode = (code: number | null) => code ?? 1;

export const spawnRun: BoardRun = (cmd, args, env, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: env as NodeJS.ProcessEnv, cwd, windowsHide: true });
    let output = "";
    child.stdout.on("data", (d: Buffer) => (output += d.toString()));
    child.stderr.on("data", (d: Buffer) => (output += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: exitCode(code), output }));
  });

/** Manim'in yeri: YS_MANIM ya da projenin `.data/tools/manim-venv` sanal ortamı (README → Manim tahtaları). */
export function manimPath(env: Env = process.env, platform = process.platform): string {
  if (env.YS_MANIM) return env.YS_MANIM;
  const venv = fileURLToPath(new URL("../../../.data/tools/manim-venv/", import.meta.url));
  return platform === "win32" ? join(venv, "Scripts", "manim.exe") : join(venv, "bin", "manim");
}

/** LaTeX (MiKTeX) klasörü: YS_LATEX_BIN ya da kullanıcı kurulumunun varsayılan yeri; PATH'in başına eklenir. */
export function latexBin(env: Env = process.env): string | undefined {
  if (env.YS_LATEX_BIN) return env.YS_LATEX_BIN;
  return env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "Programs", "MiKTeX", "miktex", "bin", "x64") : undefined;
}

async function findFile(dir: string, name: string): Promise<string | undefined> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      const hit = await findFile(p, name);
      if (hit) return hit;
    } else if (e.name === name) return p;
  }
  return undefined;
}

/** Tahtayı render eder ve saydam WebM baytlarını döndürür; çalışma klasörü sonra silinir. */
export async function renderBoard(spec: MathSpec, sec: number, accent: string, dir: string, run: BoardRun = spawnRun, env: Env = process.env): Promise<Uint8Array> {
  if (!spec.steps.length && !spec.graph) throw new LocalizedError(msg("err.math.empty"));
  const exe = manimPath(env);
  if (!existsSync(exe)) throw new LocalizedError(msg("err.math.unavailable", { path: exe }));
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(join(dir, "board.py"), boardScript(spec, sec, accent), "utf8");
    const tex = latexBin(env);
    const PATH = tex ? `${tex}${delimiter}${env.PATH ?? ""}` : env.PATH;
    const args = ["render", "board.py", "MathBoard", "-r", `${MATH_BOARD.width},${MATH_BOARD.height}`, "--fps", "30", "--transparent", "--format", "webm"];
    args.push("--media_dir", "media", "-o", "board", "--disable_caching", "--progress_bar", "none", "-v", "WARNING");
    const res = await run(exe, args, { ...env, PATH }, dir);
    if (res.code !== 0) throw new LocalizedError(msg("err.math.failed", { code: res.code, detail: res.output.trim().slice(-400) }));
    const media = join(dir, "media");
    const file = existsSync(media) ? await findFile(media, "board.webm") : undefined;
    if (!file) throw new LocalizedError(msg("err.math.failed", { code: 0, detail: "board.webm" }));
    return new Uint8Array(await readFile(file));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

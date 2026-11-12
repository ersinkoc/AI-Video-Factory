import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { fontAsset, formatText, msg, trText, TYPOGRAPHY_PAIRS, type Msg } from "@ys/core";

const run = promisify(execFile);
const videoRequire = createRequire(new URL("../../../packages/video/package.json", import.meta.url));
const root = fileURLToPath(new URL("../../../", import.meta.url));
const FILTERS = ["fps", "scale", "crop", "format", "setpts", "blackdetect", "freezedetect", "loudnorm", "silencedetect", "astats", "ametadata", "aresample", "asetnsamples"];
export interface DoctorCheck { id: string; status: "ok" | "warn" | "fail" | "skipped"; required: boolean; detail: Msg }
export interface DoctorReport { version: 1; ok: boolean; checks: DoctorCheck[] }
export interface DoctorOptions { json?: boolean; checkLocal?: boolean }

// Ham hata/komut çıktıları anahtar veya URL içerebilir; rapora yalnız seçilmiş sayısal sürümler yazılır.
async function tool(command: string, args: string[]): Promise<string | undefined> {
  try {
    const { stdout, stderr } = await run(command, args, { timeout: 5_000, maxBuffer: 1024 * 1024, windowsHide: true });
    return stdout + stderr;
  } catch { return undefined; }
}

export async function inspectEnvironment(options: DoctorOptions = {}, env: Readonly<Record<string, string | undefined>> = process.env, node = process.versions.node, platform = process.platform): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const add = (id: string, required: boolean, status: DoctorCheck["status"], detail: Msg) => { checks.push({ id, required, status, detail }); };
  add("node", true, Number(node.split(".")[0]) >= 24 ? "ok" : "fail", msg("doctor.node", { version: node }));
  const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as { packageManager: string };
  const expected = manifest.packageManager;
  const manager = env.npm_config_user_agent?.match(/\bpnpm\/(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?=\s|$)/)?.[1];
  add("pnpm", false, manager && `pnpm@${manager}` === expected ? "ok" : "warn", msg("doctor.pnpm", { expected, actual: manager ?? "?" }));
  for (const name of ["ffmpeg", "ffprobe"]) {
    const output = await tool(name, ["-version"]);
    add(name, true, output === undefined ? "fail" : "ok", output === undefined ? msg("doctor.toolMissing") : msg("doctor.version", { version: output.match(/\d+\.\d+(?:\.\d+)?/)?.[0] ?? "?" }));
  }
  const filters = await tool("ffmpeg", ["-hide_banner", "-filters"]);
  const found = new Set(Array.from((filters ?? "").matchAll(/^\s*[.A-Z|]{2,3}\s+(\w+)\s+[A-Z|]+->[A-Z|]+/gm), m => m[1]));
  const missing = FILTERS.filter(f => !found.has(f));
  add("ffmpeg.filters", true, missing.length ? "fail" : "ok", missing.length ? msg("doctor.filtersMissing", { filters: missing.join(", ") }) : msg("doctor.filtersReady"));
  try {
    // Remotion'un sabitlenmiş sürümündeki salt-okunur önbellek sorgusu; ensureBrowser indirme başlatabileceği için kullanılmaz.
    const fetcher = videoRequire(join(dirname(videoRequire.resolve("@remotion/renderer")), "browser/BrowserFetcher.js")) as { getRevisionInfo: (mode: string) => { executablePath: string } };
    const executable = env.YS_BROWSER_EXECUTABLE?.trim() || fetcher.getRevisionInfo("headless-shell").executablePath;
    if (!(await stat(executable)).isFile()) throw new Error("not a file");
    await access(executable, constants.R_OK | constants.X_OK);
    add("browser", true, "ok", msg("doctor.browserFound"));
  } catch { add("browser", true, "fail", msg("doctor.browserMissing")); }
  try {
    const faces = new Map(Object.values(TYPOGRAPHY_PAIRS).flatMap(p => [p.heading, p.body]).map(f => [`${f.id}-${f.weight}`, f]));
    for (const face of faces.values()) for (const subset of ["latin", "latin-ext"] as const) {
      const file = fontAsset(face, subset).slice("typography/".length);
      const bytes = await readFile(videoRequire.resolve(`@fontsource/${face.id}/files/${file}`));
      if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "wOFF" || bytes.readUInt32BE(8) !== bytes.length) throw new Error("invalid font");
    }
    add("fonts", true, "ok", msg("doctor.fontsReady", { count: faces.size * 2 }));
  } catch { add("fonts", true, "fail", msg("doctor.fontsMissing")); }
  const manim = env.YS_MANIM || join(root, ".data/tools/manim-venv", platform === "win32" ? "Scripts/manim.exe" : "bin/manim");
  const manimOutput = await tool(manim, ["--version"]);
  add("manim", false, manimOutput === undefined ? "warn" : "ok", manimOutput === undefined ? msg("doctor.optionalMissing") : msg("doctor.version", { version: manimOutput.match(/\d+\.\d+(?:\.\d+)?/)?.[0] ?? "?" }));
  const latexDir = env.YS_LATEX_BIN || (env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "Programs/MiKTeX/miktex/bin/x64") : undefined);
  const latexOutput = await tool(latexDir ? join(latexDir, platform === "win32" ? "latex.exe" : "latex") : "latex", ["--version"]);
  add("latex", false, latexOutput === undefined ? "warn" : "ok", latexOutput === undefined ? msg("doctor.optionalMissing") : msg("doctor.version", { version: latexOutput.match(/\d+\.\d+(?:\.\d+)?/)?.[0] ?? "?" }));
  add("providers", false, "skipped", msg("doctor.providers", { configured: ["FAL_KEY", "GEMINI_API_KEY", "ELEVENLABS_API_KEY", "ANTHROPIC_API_KEY"].filter(key => !!env[key]).join(", ") || "—" }));
  if (!options.checkLocal || !env.COMFYUI_URL) {
    add("comfyui", false, "skipped", msg("doctor.localSkipped"));
  } else {
    try {
      const url = new URL(env.COMFYUI_URL);
      if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) throw new Error("not loopback");
      url.pathname = `${url.pathname.replace(/\/$/, "")}/system_stats`;
      url.search = ""; url.hash = "";
      const response = await fetch(url, { signal: AbortSignal.timeout(2_500), redirect: "error" });
      // Gövde okunmaz: kontrol yalnız HTTP erişilebilirliğini doğrular; modellerin hazır olduğunu kanıtlamaz.
      await response.body?.cancel();
      if (!response.ok) throw new Error("not ready");
      add("comfyui", false, "ok", msg("doctor.localReachable"));
    } catch { add("comfyui", false, "warn", msg("doctor.localUnavailable")); }
  }
  return { version: 1, ok: !checks.some(c => c.required && c.status === "fail"), checks };
}

export async function doctorCommand(options: DoctorOptions): Promise<number> {
  const report = await inspectEnvironment(options);
  if (options.json) console.log(JSON.stringify({ ...report, checks: report.checks.map(c => ({ ...c, detail: formatText("en", c.detail) })) }, null, 2));
  else {
    console.log(trText(msg("doctor.heading")));
    for (const c of report.checks) console.log(`[${c.status}] ${c.id}: ${trText(c.detail)}`);
  }
  return report.ok ? 0 : 1;
}

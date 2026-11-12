import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatText } from "@ys/core";

const f = vi.hoisted(() => ({
  run: vi.fn(), read: vi.fn(), stat: vi.fn(), access: vi.fn(), resolve: vi.fn(), cache: vi.fn(), require: vi.fn(), fetch: vi.fn(),
}));
vi.mock("node:child_process", () => ({ execFile: Object.assign(() => {}, {
  [Symbol.for("nodejs.util.promisify.custom")]: async (command: string, args: string[], options: unknown) => f.run(command, args, options),
}) }));
vi.mock("node:fs/promises", () => ({ readFile: f.read, stat: f.stat, access: f.access }));
vi.mock("node:module", () => ({ createRequire: () => Object.assign(f.require, { resolve: f.resolve }) }));
import { doctorCommand, inspectEnvironment } from "../src/doctor.ts";

const filters = ["fps", "scale", "crop", "format", "setpts", "blackdetect", "freezedetect", "loudnorm", "silencedetect", "astats", "ametadata", "aresample", "asetnsamples"].map(name => ` ... ${name} V->V description`).join("\n");
const env = { npm_config_user_agent: "pnpm/11.25.0 npm/? node/v26", YS_MANIM: "/manim", YS_LATEX_BIN: "/latex", COMFYUI_URL: "http://127.0.0.1:8188" };
const check = async (id: string, options = {}, config: Record<string, string | undefined> = env) => (await inspectEnvironment(options, config, "26.13.0")).checks.find(c => c.id === id)!;
beforeEach(() => {
  vi.clearAllMocks();
  f.run.mockImplementation((_command, args) => ({ stdout: args.includes("-filters") ? filters : "version 7.1.2", stderr: "" }));
  f.read.mockImplementation(async (path: string) => {
    if (path.endsWith("package.json")) return JSON.stringify({ packageManager: "pnpm@11.25.0" });
    const bytes = Buffer.alloc(44); bytes.write("wOFF"); bytes.writeUInt32BE(44, 8); return bytes;
  });
  f.stat.mockResolvedValue({ isFile: () => true }); f.access.mockResolvedValue(undefined);
  f.resolve.mockImplementation((path: string) => path); f.require.mockReturnValue({ getRevisionInfo: f.cache });
  f.cache.mockReturnValue({ executablePath: "/cache/chrome" });
  f.fetch.mockResolvedValue({ ok: true, body: { cancel: vi.fn(async () => {}) } });
  vi.stubGlobal("fetch", f.fetch);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("doctor environment report", () => {
  it("accepts FFmpeg 9's two-column flags as well as the three-column format", async () => {
    f.run.mockImplementation((_command, args) => ({ stdout: args.includes("-filters") ? filters.replaceAll(" ... ", " .. ") : "version 9.0.2", stderr: "" }));
    expect((await check("ffmpeg.filters")).status).toBe("ok");
  });
  it("inspects tools, filters and all font faces offline, without starting a browser", async () => {
    const report = await inspectEnvironment({}, env, "24.0.0");
    expect(report.ok).toBe(true);
    expect(report.checks.filter(c => c.required).every(c => c.status === "ok")).toBe(true);
    expect(report.checks.find(c => c.id === "fonts")!.detail.params).toEqual({ count: 14 });
    expect(f.fetch).not.toHaveBeenCalled();
    expect(f.run.mock.calls.every(([command, , options]) => command !== "/cache/chrome" && options.timeout === 5000 && options.windowsHide === true)).toBe(true);
    expect(f.access).toHaveBeenCalledWith("/cache/chrome", expect.any(Number));
  });
  it("uses defaults and reports an unknown or mismatched invoking package manager", async () => {
    vi.stubEnv("npm_config_user_agent", "pnpm/10.1.0");
    expect((await inspectEnvironment()).checks.find(c => c.id === "pnpm")?.status).toBe("warn");
    expect((await check("pnpm", {}, {})).detail.params?.actual).toBe("?");
    expect((await check("pnpm", {}, { npm_config_user_agent: "npm/11.0.0" })).status).toBe("warn");
    expect((await check("pnpm", {}, { npm_config_user_agent: "pnpm/11.25.0-dev.1 node/v26" })).status).toBe("warn");
  });
  it("fails for unsupported Node while optional Manim/LaTeX failures only warn", async () => {
    f.run.mockImplementation((command, args) => { if (args[0] === "--version") throw new Error("timeout secret-token"); return { stdout: command === "ffmpeg" && args.includes("-filters") ? filters : "7.1.0", stderr: "" }; });
    const report = await inspectEnvironment({}, env, "23.9.0");
    expect(report.ok).toBe(false);
    expect(report.checks.find(c => c.id === "node")?.status).toBe("fail");
    expect(report.checks.filter(c => ["manim", "latex"].includes(c.id)).map(c => c.status)).toEqual(["warn", "warn"]);
    expect((await inspectEnvironment({}, env, "26.0.0")).ok).toBe(true);
    expect(JSON.stringify(report)).not.toContain("secret-token");
  });
  it("detects missing executables and missing filters rather than treating process exit zero as filter support", async () => {
    f.run.mockImplementation(() => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); });
    const report = await inspectEnvironment({}, env);
    expect(report.ok).toBe(false);
    expect(report.checks.filter(c => ["ffmpeg", "ffprobe", "ffmpeg.filters"].includes(c.id)).map(c => c.status)).toEqual(["fail", "fail", "fail"]);
    f.run.mockReturnValue({ stdout: " ... scale V->V", stderr: "" });
    expect((await check("ffmpeg.filters")).status).toBe("fail");
    expect((await check("ffmpeg")).detail.params?.version).toBe("?");
    f.run.mockReturnValue({ stdout: "", stderr: "version 8.1" });
    expect((await check("ffprobe")).detail.params?.version).toBe("8.1");
  });
  it("checks explicit browser overrides and reports directories, missing files and permission failures", async () => {
    expect((await check("browser", {}, { ...env, YS_BROWSER_EXECUTABLE: " /custom/chrome " })).status).toBe("ok");
    expect(f.stat).toHaveBeenLastCalledWith("/custom/chrome");
    f.stat.mockResolvedValue({ isFile: () => false });
    expect((await check("browser")).status).toBe("fail");
    f.stat.mockRejectedValue(new Error("missing"));
    expect((await check("browser", {}, { ...env, YS_BROWSER_EXECUTABLE: " " })).status).toBe("fail");
    f.stat.mockResolvedValue({ isFile: () => true }); f.access.mockRejectedValue(new Error("denied"));
    expect((await check("browser")).status).toBe("fail");
    f.require.mockImplementation(() => { throw new Error("module absent"); });
    expect((await check("browser")).status).toBe("fail");
  });
  it.each(["missing", "short", "signature", "length"])("rejects %s font assets", async kind => {
    f.read.mockImplementation(async (path: string) => {
      if (path.endsWith("package.json")) return '{"packageManager":"pnpm@11.25.0"}';
      if (kind === "missing") throw new Error("missing");
      const bytes = Buffer.alloc(kind === "short" ? 12 : 44); bytes.write(kind === "signature" ? "wOF2" : "wOFF"); bytes.writeUInt32BE(kind === "length" ? 100 : bytes.length, 8); return bytes;
    });
    expect((await check("fonts")).status).toBe("fail");
  });
  it("uses repository-local Manim and environment-specific LaTeX paths", async () => {
    await inspectEnvironment({}, { LOCALAPPDATA: "/user" }, "26.0.0", "win32");
    expect(f.run.mock.calls.some(([p]) => /manim-venv.*(?:manim|manim.exe)$/.test(p))).toBe(true);
    expect(f.run.mock.calls.some(([p]) => p.includes("MiKTeX"))).toBe(true);
    await inspectEnvironment({}, { YS_LATEX_BIN: "/tex" }, "26.0.0", "linux");
    expect(f.run.mock.calls.some(([p]) => /bin[/\\]manim$/.test(p))).toBe(true);
    expect(f.run.mock.calls.some(([p]) => /tex[/\\]latex$/.test(p))).toBe(true);
    await inspectEnvironment({}, {});
    expect(f.run.mock.calls.some(([p]) => p === "latex")).toBe(true);
  });
  it("never prints keys or raw tool errors and skips paid provider validation", async () => {
    const report = await inspectEnvironment({}, { ...env, FAL_KEY: "fal-secret", GEMINI_API_KEY: "gemini-secret", ELEVENLABS_API_KEY: "eleven-secret", ANTHROPIC_API_KEY: "anthropic-secret" });
    expect(JSON.stringify(report)).not.toMatch(/fal-secret|gemini-secret|eleven-secret|anthropic-secret/);
    expect(report.checks.find(c => c.id === "providers")?.detail.params?.configured).toBe("FAL_KEY, GEMINI_API_KEY, ELEVENLABS_API_KEY, ANTHROPIC_API_KEY");
    expect(report.checks.find(c => c.id === "providers")?.status).toBe("skipped");
  });
});

describe("explicit local connectivity", () => {
  it.each(["http://127.0.0.1:8188/", "http://localhost:8188/proxy?token=secret#fragment", "https://[::1]:8188"])("checks only the loopback stats endpoint: %s", async url => {
    expect((await check("comfyui", { checkLocal: true }, { ...env, COMFYUI_URL: url })).status).toBe("ok");
    const [target, opts] = f.fetch.mock.calls[0]!;
    expect(target.pathname.endsWith("/system_stats")).toBe(true);
    expect(target.search).toBe(""); expect(target.hash).toBe("");
    expect(opts.redirect).toBe("error"); expect(opts.signal).toBeInstanceOf(AbortSignal);
  });
  it.each(["bad-url", "file:///tmp/model", "http://example.com", "http://127.0.0.1.evil.test", "http://u:p@localhost:8188"])("rejects unsafe or remote URL %s without requesting it", async url => {
    expect((await check("comfyui", { checkLocal: true }, { ...env, COMFYUI_URL: url })).status).toBe("warn");
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it("does not request an unset URL, reports HTTP and timeout failures, and cancels response bodies", async () => {
    expect((await check("comfyui", { checkLocal: true }, {})).status).toBe("skipped");
    const cancel = vi.fn(async () => {});
    f.fetch.mockResolvedValue({ ok: false, body: { cancel } }); expect((await check("comfyui", { checkLocal: true })).status).toBe("warn");
    expect(cancel).toHaveBeenCalledOnce();
    f.fetch.mockRejectedValue(new DOMException("secret", "TimeoutError")); expect((await check("comfyui", { checkLocal: true })).status).toBe("warn");
    f.fetch.mockResolvedValue({ ok: true, body: null }); expect((await check("comfyui", { checkLocal: true })).status).toBe("ok");
  });
});

it("prints readable text or English JSON and returns a failing status for required checks", async () => {
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  expect(await doctorCommand({ json: true })).toBe(0);
  const report = JSON.parse(String(output.mock.calls[0]![0]));
  expect(report.checks.find((c: { id: string }) => c.id === "browser").detail).toContain("Launch and GPU operation were not tested");
  output.mockClear(); f.access.mockRejectedValue(new Error("missing"));
  expect(await doctorCommand({})).toBe(1);
  expect(output.mock.calls.some(([line]) => String(line).includes("[fail] browser"))).toBe(true);
  expect(formatText("tr", (await check("browser")).detail)).toContain("Tarayıcı");
});

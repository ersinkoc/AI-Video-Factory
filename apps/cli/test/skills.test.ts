import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEV_TOOLS, devToolCommand, type DevToolStatus } from "@ys/pipeline/light";

const f = vi.hoisted(() => ({ spawn: vi.fn(), home: "" }));
vi.mock("node:child_process", () => ({ spawn: f.spawn }));
// Varsayılan durum okuması kullanıcının gerçek ~/.claude'una değil, boş bir geçici dizine bakar.
vi.mock("node:os", async (orig) => ({ ...(await orig<object>()), homedir: () => f.home }));
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTool, skillsCommand } from "../src/skills.ts";

f.home = mkdtempSync(join(tmpdir(), "ys-skills-home-"));

const row = (id: string, installed: number, total: number): DevToolStatus => ({ id, installed, total, ready: installed === total });
const fresh = () => DEV_TOOLS.map((t) => row(t.id, 0, t.kind === "mcp" ? 1 : t.skills.length));

function harness(rows: DevToolStatus[][], codes: Record<string, number> = {}) {
  const lines: string[] = [];
  const calls: { command: string; args: string[] }[] = [];
  let i = 0;
  const status = vi.fn(async (): Promise<DevToolStatus[]> => rows[Math.min(i++, rows.length - 1)]!);
  const run = vi.fn(async (command: string, args: string[], line: (t: string) => void) => {
    calls.push({ command, args });
    line("çıktı satırı");
    const id = DEV_TOOLS.find((t) => devToolCommand(t).args.join(" ") === args.join(" "))!.id;
    return codes[id] ?? 0;
  });
  return { lines, calls, status, run, deps: { status, run, print: (l: string) => void lines.push(l) } };
}

describe("skillsCommand", () => {
  it("list ve alt komutsuz çağrı durumu yazar: kurulu, eksik, kısmen; kapsamı başta söyler", async () => {
    const h = harness([[row("threejs-skills", 9, 9), row("webgl-animation-skills", 1, 2), row("cinematic-3d-video", 0, 1), row("threejs-devtools-mcp", 0, 1)]]);
    expect(await skillsCommand(undefined, [], h.deps)).toBe(0);
    expect(await skillsCommand("list", [], h.deps)).toBe(0);
    const out = h.lines.join("\n");
    expect(h.lines[0]).toContain("tüm projelere kurulur");
    expect(out).toContain("✓ threejs-skills [kurulu] github.com/CloudAI-X/threejs-skills (MIT): threejs-fundamentals");
    expect(out).toContain("· webgl-animation-skills [eksik (1/2)]");
    expect(out).toContain("· cinematic-3d-video [kurulu değil]");
    expect(out).toContain("threejs-devtools-mcp [kurulu değil] github.com/DmitriyGolub/threejs-devtools-mcp (MIT): MCP");
    expect(h.run).not.toHaveBeenCalled();
  });

  it("install eksiklerin hepsini katalog sırasıyla kurar, kurulu olanı atlar, sonunda durumu ve yeniden başlatma notunu yazar", async () => {
    const before = fresh();
    before[0] = row("threejs-skills", 9, 9);
    const h = harness([before, before.map((s) => ({ ...s, installed: s.total, ready: true }))]);
    expect(await skillsCommand("install", [], h.deps)).toBe(0);
    expect(h.calls.map((c) => c.command)).toEqual(["npx", "npx", "claude"]);
    expect(h.lines).toContain("threejs-skills zaten kurulu, atlandı.");
    expect(h.lines).toContain("  çıktı satırı");
    expect(h.lines).toContain("cinematic-3d-video kuruldu.");
    expect(h.lines.some((l) => l.startsWith("webgl-animation-skills kuruluyor: npx -y skills@1.9.0 add iart-ai/webgl-animation-skills@"))).toBe(true);
    expect(h.lines.at(-1)).toContain("yeniden başlatılınca");
  });

  it("install verilen araçlarla sınırlıdır; biri başarısızsa 1 döner ve çıkış kodunu yazar", async () => {
    const h = harness([fresh()], { "threejs-devtools-mcp": 2 });
    expect(await skillsCommand("install", ["threejs-devtools-mcp", "cinematic-3d-video"], h.deps)).toBe(1);
    expect(h.calls.map((c) => c.args[0])).toEqual(["-y", "mcp"]);
    expect(h.lines).toContain("threejs-devtools-mcp kurulamadı (çıkış: 2).");
  });

  it("bilinmeyen araç ve alt komut hiçbir şey çalıştırmadan 1 döner", async () => {
    const h = harness([fresh()]);
    expect(await skillsCommand("install", ["threejs-skills", "blender"], h.deps)).toBe(1);
    expect(h.lines.at(-1)).toBe("Bilinmeyen araç: blender. Seçenekler: threejs-skills, webgl-animation-skills, cinematic-3d-video, threejs-devtools-mcp");
    expect(await skillsCommand("remove", [], h.deps)).toBe(1);
    expect(h.lines.at(-1)).toBe("Bilinmeyen araç: remove. Seçenekler: list, install");
    expect(h.run).not.toHaveBeenCalled();
  });

  it("varsayılan bağımlılıklar: durum dosya sisteminden okunur, çıktı konsola gider", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await skillsCommand("list", [])).toBe(0);
    expect(log.mock.calls.length).toBe(DEV_TOOLS.length + 1);
    expect(log.mock.calls.slice(1).every(([l]) => String(l).includes("[kurulu değil]"))).toBe(true);
    log.mockRestore();
  });
});

describe("runTool", () => {
  const platform = process.platform;
  let child: EventEmitter & { stdout: EventEmitter; stderr: EventEmitter };
  beforeEach(() => {
    child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
    f.spawn.mockReset().mockReturnValue(child);
  });
  afterEach(() => {
    Object.defineProperty(process, "platform", { value: platform });
    vi.useRealTimers();
  });

  it("telemetrisiz, girdisiz, zaman sınırlı çalıştırır; ANSI kaçışlarını ve boş satırları atar, çıkış kodunu döndürür", async () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    const lines: string[] = [];
    const done = runTool("npx", ["-y", "skills@1.9.0"], (l) => void lines.push(l));
    child.stdout.emit("data", Buffer.from("\x1b[?25l│ kutu  \r\n\n"));
    child.stderr.emit("data", Buffer.from("\x1b[1G\x1b[Juyarı\n"));
    child.emit("close", 0);
    expect(await done).toBe(0);
    expect(lines).toEqual(["│ kutu", "uyarı"]);
    const [command, args, options] = f.spawn.mock.calls[0]!;
    // Kabukla tek komut satırı (DEP0190 uyarısı çıkmasın).
    expect([command, args]).toEqual(["npx -y skills@1.9.0", []]);
    expect(options).toMatchObject({ stdio: ["ignore", "pipe", "pipe"], shell: true, windowsHide: true });
    expect(options.env).toMatchObject({ DISABLE_TELEMETRY: "1", DO_NOT_TRACK: "1" });
  });

  it("başka sistemde kabuksuz açar; başlatılamazsa ya da sinyalle ölürse -1", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const lines: string[] = [];
    const failed = runTool("claude", [], (l) => void lines.push(l));
    child.emit("error", new Error("spawn claude ENOENT"));
    expect(await failed).toBe(-1);
    expect(lines).toEqual(["spawn claude ENOENT"]);
    expect(f.spawn.mock.calls[0]![2].shell).toBe(false);
    const killed = runTool("npx", [], () => {});
    child.emit("close", null);
    expect(await killed).toBe(-1);
  });

  it("süre dolunca Windows'ta bütün süreç ağacını kapatır, -1 döner; sonra gelen kapanış yok sayılır", async () => {
    vi.useFakeTimers();
    Object.defineProperty(process, "platform", { value: "win32" });
    const lines: string[] = [];
    Object.assign(child, { pid: 4321, kill: vi.fn() });
    const done = runTool("npx", [], (l) => void lines.push(l));
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(await done).toBe(-1);
    expect(lines).toEqual(["5 dakikada bitmedi, durduruldu."]);
    expect(f.spawn.mock.calls[1]!.slice(0, 2)).toEqual(["taskkill", ["/pid", "4321", "/T", "/F"]]);
    child.emit("close", 0);
    expect((child as unknown as { kill: ReturnType<typeof vi.fn> }).kill).not.toHaveBeenCalled();
  });

  it("süre dolunca başka sistemde (ya da pid yoksa) çocuğu öldürür", async () => {
    vi.useFakeTimers();
    for (const [os, pid] of [["linux", 7], ["win32", undefined]] as const) {
      Object.defineProperty(process, "platform", { value: os });
      const kill = vi.fn();
      Object.assign(child, { pid, kill });
      const done = runTool("npx", [], () => {});
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(await done).toBe(-1);
      expect(kill).toHaveBeenCalledTimes(1);
    }
    expect(f.spawn.mock.calls.every(([c]) => c === "npx")).toBe(true);
  });
});

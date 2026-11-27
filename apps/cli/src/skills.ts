import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { msg, trText } from "@ys/core";
import { DEV_TOOL_TIMEOUT_MS, DEV_TOOLS, devToolCommand, devToolOf, devToolStatus, type DevToolStatus } from "@ys/pipeline/light";

/** Komutu çalıştırır, çıktısını satır satır verir, çıkış kodunu döndürür (başlatılamazsa -1). */
export type ToolRun = (command: string, args: string[], line: (text: string) => void) => Promise<number>;

// skills CLI kutu çizimi ve imleç kodları basar; Stüdyo kaydında okunur kalsın diye ANSI kaçışları atılır.
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;

export const runTool: ToolRun = (command, args, line) =>
  new Promise((resolve) => {
    // Windows'ta npx ve claude .cmd'dir, kabukla açılır. Argümanlar katalogdan gelir ve kabuk karakteri içermez (katalog
    // testi); tek komut satırı olarak verilir, çünkü kabukla ayrı argüman dizisi Node'da DEP0190 uyarısı basıyordu.
    const shell = process.platform === "win32";
    const child = spawn(shell ? [command, ...args].join(" ") : command, shell ? [] : args, {
      cwd: homedir(),
      // vercel-labs/skills isimsiz kullanım verisi gönderir; kapatılır.
      env: { ...process.env, DISABLE_TELEMETRY: "1", DO_NOT_TRACK: "1" },
      // Soru sorulursa EOF okur, beklemez.
      stdio: ["ignore", "pipe", "pipe"],
      shell,
      windowsHide: true,
    });
    let settled = false;
    const finish = (code: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(code);
    };
    // spawn'ın kendi `timeout`u yalnız doğrudan çocuğu öldürür; Windows'ta o cmd.exe'dir, npx ve node torunları
    // boruları açık tutup "close"u bekletirdi. Süre dolunca bütün ağaç kapatılır ve beklemeden dönülür.
    const timer = setTimeout(() => {
      line(trText(msg("devtools.timeout", { minutes: DEV_TOOL_TIMEOUT_MS / 60_000 })));
      if (process.platform === "win32" && child.pid) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      else child.kill();
      finish(-1);
    }, DEV_TOOL_TIMEOUT_MS);
    const push = (chunk: Buffer) => {
      for (const text of chunk.toString("utf8").replace(ANSI, "").split(/\r?\n/)) if (text.trim()) line(text.trimEnd());
    };
    child.stdout.on("data", push);
    child.stderr.on("data", push);
    child.on("error", (e: Error) => {
      line(e.message);
      finish(-1);
    });
    child.on("close", (code) => finish(code ?? -1));
  });

export interface SkillsDeps {
  status?: () => Promise<DevToolStatus[]>;
  run?: ToolRun;
  print?: (line: string) => void;
}

function state(s: DevToolStatus): string {
  if (s.ready) return trText(msg("devtools.ready"));
  return s.installed === 0 ? trText(msg("devtools.missing")) : trText(msg("devtools.partial", { installed: s.installed, total: s.total }));
}

function list(rows: DevToolStatus[], print: (line: string) => void): void {
  for (const s of rows) {
    const tool = devToolOf(s.id)!;
    const parts = tool.kind === "mcp" ? "MCP" : tool.skills.join(", ");
    print(`${s.ready ? "✓" : "·"} ${s.id} [${state(s)}] github.com/${tool.repo} (${tool.licence}): ${parts}`);
  }
}

/** `skills [list]` durum; `skills install [araç...]` eksikleri (ya da verilenleri) kurar, kurulu olanı atlar. */
export async function skillsCommand(sub: string | undefined, ids: string[], deps: SkillsDeps = {}): Promise<number> {
  const status = deps.status ?? (() => devToolStatus());
  const run = deps.run ?? runTool;
  const print = deps.print ?? ((line: string) => console.log(line));
  if (sub !== undefined && sub !== "list" && sub !== "install") {
    print(trText(msg("devtools.unknown", { id: sub, ids: "list, install" })));
    return 1;
  }
  print(trText(msg("devtools.heading")));
  if (sub !== "install") {
    list(await status(), print);
    return 0;
  }
  const unknown = ids.find((id) => !devToolOf(id));
  if (unknown) {
    print(trText(msg("devtools.unknown", { id: unknown, ids: DEV_TOOLS.map((t) => t.id).join(", ") })));
    return 1;
  }
  const before = await status();
  let failed = 0;
  for (const tool of DEV_TOOLS) {
    if (ids.length > 0 && !ids.includes(tool.id)) continue;
    if (before.find((s) => s.id === tool.id)?.ready) {
      print(trText(msg("devtools.skip", { id: tool.id })));
      continue;
    }
    const { command, args } = devToolCommand(tool);
    print(trText(msg("devtools.installing", { id: tool.id, command: [command, ...args].join(" ") })));
    const code = await run(command, args, (line) => print(`  ${line}`));
    if (code === 0) print(trText(msg("devtools.done", { id: tool.id })));
    else {
      failed++;
      print(trText(msg("devtools.failed", { id: tool.id, code })));
    }
  }
  list(await status(), print);
  print(trText(msg("devtools.restart")));
  return failed === 0 ? 0 : 1;
}

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Git sınırı sahtedir; dosyalar ve release giriş noktası gerçektir. Yerel Git kanıtı ayrı hedefte çalışır.
const s = vi.hoisted(() => ({ head: "initial", branch: "main", status: "", index: "initial", tag: "", calls: [] as string[][], hook: vi.fn(), check: vi.fn() }));
vi.mock("node:child_process", () => ({
  execFileSync: (command: string, args: string[]) => {
    if (command !== "git") throw new Error("No external publication in tests");
    s.calls.push([...args]); s.hook(args);
    switch (args[0]) {
      case "rev-parse": return args[1] === "--abbrev-ref" ? s.branch : s.head;
      case "status": return s.status;
      case "describe": return "v1.0.0";
      case "log": return "Add fixture feature";
      case "tag": if (args[1] === "--list") return ""; s.tag = s.head; return "";
      case "add": s.index = "release metadata"; return "";
      case "commit": s.head = "release"; return "";
      default: throw new Error(`Unexpected Git mutation: ${args.join(" ")}`);
    }
  },
  spawnSync: (command: string) => { s.check(command); return { status: 0 }; },
}));
const originalCwd = process.cwd(), originalArgv = process.argv;
let dir = "";
const write = (path: string, value: string) => writeFileSync(join(dir, path), value);
const read = (path: string) => readFileSync(join(dir, path), "utf8");
const version = () => (JSON.parse(read("package.json")) as { version: string }).version;
class Exit extends Error { constructor(readonly code: number) { super(`exit ${code}`); } }
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ys-release-unit-"));
  write("package.json", '{"version":"1.0.0"}\n'); write("CHANGELOG.md", "# Changelog\n"); write("notes.txt", "base note\n");
  Object.assign(s, { head: "initial", branch: "main", status: "", index: "initial", tag: "", calls: [] }); s.hook.mockReset(); s.check.mockReset();
  process.chdir(dir);
  vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation((code => { throw new Exit(Number(code)); }) as typeof process.exit);
});
afterEach(() => {
  process.chdir(originalCwd); process.argv = originalArgv; vi.restoreAllMocks();
  const path = resolve(dir);
  if (!path.startsWith(resolve(tmpdir()) + sep) || !basename(path).startsWith("ys-release-unit-")) throw new Error("Unsafe fixture cleanup");
  rmSync(path, { recursive: true, force: true });
  expect(s.calls.some(args => ["reset", "checkout", "restore", "update-index"].includes(args[0]!) || (args[0] === "tag" && args[1] === "-d"))).toBe(false);
});
async function release(): Promise<number> {
  process.argv = [process.execPath, "release.ts", "patch"]; vi.resetModules();
  try { await import("./release.ts"); return 0; } catch (e) { if (e instanceof Exit) return e.code; throw e; }
}
const tagFailure = (action: () => void) => s.hook.mockImplementation((args: string[]) => { if (args[0] === "tag" && args[1] === "-a") { action(); throw new Error("tag failure"); } });
const commitFailure = (action: () => void) => s.hook.mockImplementation((args: string[]) => { if (args[0] === "commit") { action(); throw new Error("commit failure"); } });

describe("release ownership unit boundaries", () => {
  it("CONTROL creates the release and commits explicit metadata paths", async () => {
    expect(await release()).toBe(0); expect(version()).toBe("1.0.1"); expect(s.tag).toBe("release");
    expect(s.calls.find(args => args[0] === "commit")).toEqual(["commit", "--only", "-m", "Release v1.0.1", "--", "package.json", "CHANGELOG.md"]);
    console.info("CONTROL PASSED");
  });
  it("F001 preserves a later saved file and index on tag failure", async () => {
    tagFailure(() => { write("notes.txt", "parallel saved\n"); s.index = "parallel stage"; });
    expect(await release()).toBe(1); expect(read("notes.txt")).toBe("parallel saved\n"); expect(s.index).toBe("parallel stage"); expect(s.head).toBe("release");
  });
  it("F001 edge preserves a newer commit", async () => {
    tagFailure(() => { s.head = "newer commit"; });
    expect(await release()).toBe(1); expect(s.head).toBe("newer commit");
  });
  it("F001 edge preserves another writer's tag", async () => {
    tagFailure(() => { s.tag = "foreign tag"; });
    expect(await release()).toBe(1); expect(s.tag).toBe("foreign tag");
  });
  it("F002 preserves later metadata changes on commit failure", async () => {
    commitFailure(() => { write("CHANGELOG.md", "parallel saved\n"); });
    expect(await release()).toBe(1); expect(read("CHANGELOG.md")).toBe("parallel saved\n"); expect(s.head).toBe("initial");
  });
  it("F002 edge retains generated metadata for inspection", async () => {
    commitFailure(() => {});
    expect(await release()).toBe(1); expect(version()).toBe("1.0.1"); expect(read("CHANGELOG.md")).toContain("## v1.0.1");
  });
  it("F002 edge preserves a distinct index version", async () => {
    commitFailure(() => { s.index = "foreign staged metadata"; });
    expect(await release()).toBe(1); expect(s.index).toBe("foreign staged metadata");
  });
  it("F002 edge retains a newly created changelog", async () => {
    rmSync(join(dir, "CHANGELOG.md")); commitFailure(() => {});
    expect(await release()).toBe(1); expect(existsSync(join(dir, "CHANGELOG.md"))).toBe(true); expect(read("CHANGELOG.md")).toContain("## v1.0.1");
  });
  it("F003 refuses a tree changed during checks before writing metadata", async () => {
    s.check.mockImplementation((command: string) => { if (command === "pnpm test") { s.status = "M notes.txt"; write("notes.txt", "parallel saved\n"); } });
    expect(await release()).toBe(1); expect(version()).toBe("1.0.0"); expect(read("notes.txt")).toBe("parallel saved\n");
  });
  it("F003 edge preserves an advanced HEAD", async () => {
    s.check.mockImplementation((command: string) => { if (command === "pnpm test") s.head = "parallel commit"; });
    expect(await release()).toBe(1); expect(s.head).toBe("parallel commit"); expect(version()).toBe("1.0.0");
  });
  it("F003 edge preserves a branch switch", async () => {
    s.check.mockImplementation((command: string) => { if (command === "pnpm test") s.branch = "parallel"; });
    expect(await release()).toBe(1); expect(s.branch).toBe("parallel"); expect(version()).toBe("1.0.0");
  });
  it("F003 edge scopes the commit when another file is staged after checks", async () => {
    s.hook.mockImplementation((args: string[]) => { if (args[0] === "commit") s.index = "parallel staged file"; });
    expect(await release()).toBe(0); expect(s.index).toBe("parallel staged file");
    expect(s.calls.find(args => args[0] === "commit")?.slice(-3)).toEqual(["--", "package.json", "CHANGELOG.md"]);
  });
});

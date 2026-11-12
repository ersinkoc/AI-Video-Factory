import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const seam = vi.hoisted(() => ({ git: vi.fn(), check: vi.fn() }));
vi.mock("node:child_process", async original => {
  const actual = await original<typeof import("node:child_process")>();
  return { ...actual,
    execFileSync: (command: string, args: string[], options: object) => {
      seam.git(command, args);
      return actual.execFileSync(command, args, options);
    },
    spawnSync: (command: string) => { seam.check(command); return { status: 0 }; },
  };
});
const real = await vi.importActual<typeof import("node:child_process")>("node:child_process");
const initialCwd = process.cwd();
const originalArgs = process.argv;
let dir = "";
let template = "";
const git = (...args: string[]) => real.execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 15_000 }).trim();
const contents = (file: string) => readFileSync(join(dir, file), "utf8");
const write = (file: string, text: string) => writeFileSync(join(dir, file), text);
const version = () => (JSON.parse(contents("package.json")) as { version: string }).version;
class Exit extends Error { constructor(readonly code: number) { super(`exit ${code}`); } }

// Git süreçlerini her senaryoda yeniden kurmak Windows'ta 16–18 sn sürdü; yalnız yerel şablon bir kez hazırlanır.
beforeAll(() => {
  dir = template = mkdtempSync(join(tmpdir(), "ys-release-test-"));
  git("init", "-b", "main");
  writeFileSync(join(dir, ".git/config"), '[core]\nrepositoryformatversion = 0\nbare = false\nautocrlf = false\nfsmonitor = false\nhooksPath = empty-hooks\n[user]\nname = Release Fixture\nemail = fixture@example.invalid\n[commit]\ngpgsign = false\n[tag]\ngpgsign = false\n');
  mkdirSync(join(dir, "empty-hooks"));
  write("package.json", '{"name":"fixture","version":"1.0.0"}\n');
  write("CHANGELOG.md", "# Changelog\n\n## v1.0.0\n\n- Baseline\n");
  write("notes.txt", "base note\n"); git("add", "."); git("commit", "-m", "Initial fixture"); git("tag", "v1.0.0");
  write("feature.txt", "validated feature\n"); git("add", "feature.txt"); git("commit", "-m", "Add fixture feature");
}, 60_000);
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ys-release-test-"));
  cpSync(template, dir, { recursive: true });
  process.chdir(dir); seam.git.mockReset(); seam.check.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(process, "exit").mockImplementation((code => { throw new Exit(Number(code)); }) as typeof process.exit);
});
afterEach(() => {
  process.chdir(initialCwd); process.argv = originalArgs; vi.restoreAllMocks();
  const target = resolve(dir);
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith("ys-release-test-")) throw new Error("Unsafe fixture cleanup");
  rmSync(target, { recursive: true, force: true });
});
afterAll(() => {
  const target = resolve(template);
  if (!target.startsWith(resolve(tmpdir()) + sep) || !basename(target).startsWith("ys-release-test-")) throw new Error("Unsafe template cleanup");
  rmSync(target, { recursive: true, force: true });
});
async function release(...args: string[]): Promise<number> {
  process.argv = [process.execPath, "scripts/release.ts", ...args]; vi.resetModules();
  try { await import("./release.ts"); return 0; } catch (error) { if (error instanceof Exit) return error.code; throw error; }
}
const failTag = (action: () => void = () => {}) => seam.git.mockImplementation((command: string, args: string[]) => {
  if (command === "git" && args[0] === "tag" && args[1] === "-a") { action(); throw new Error("injected tag failure"); }
});

describe("release ownership", () => {
  it("CONTROL creates only its version commit and annotated tag", async () => {
    const before = git("rev-parse", "HEAD");
    expect(await release("patch")).toBe(0);
    expect(git("rev-parse", "HEAD^")).toBe(before);
    expect(git("rev-parse", "v1.0.1^{}")).toBe(git("rev-parse", "HEAD"));
    expect(git("cat-file", "-t", "v1.0.1")).toBe("tag");
    expect(version()).toBe("1.0.1"); expect(git("status", "--porcelain")).toBe("");
    console.info("CONTROL PASSED: normal local release");
  }, 90_000);
  it("F001 preserves a concurrent staged edit when tag creation fails after commit", async () => {
    failTag(() => { write("notes.txt", "parallel edit saved\n"); git("add", "notes.txt"); });
    expect(await release()).toBe(1);
    console.info(`F001 EXPECTED: parallel edit saved; ACTUAL: ${contents("notes.txt").trim()}`);
    expect(contents("notes.txt")).toBe("parallel edit saved\n");
    expect(git("show", ":notes.txt")).toBe("parallel edit saved");
    expect(version()).toBe("1.0.1");
    expect(git("log", "-1", "--format=%s")).toBe("Release v1.0.1");
  }, 90_000);
  it("F002 preserves a later writer's release metadata when commit fails", async () => {
    seam.git.mockImplementation((command: string, args: string[]) => {
      if (command === "git" && args[0] === "commit") { write("CHANGELOG.md", "parallel changelog saved\n"); throw new Error("injected commit failure"); }
    });
    const before = git("rev-parse", "HEAD");
    expect(await release()).toBe(1);
    console.info(`F002 EXPECTED: parallel changelog saved; ACTUAL: ${contents("CHANGELOG.md").trim()}`);
    expect(contents("CHANGELOG.md")).toBe("parallel changelog saved\n");
    expect(git("rev-parse", "HEAD")).toBe(before);
  }, 90_000);
  it("F003 refuses a tree changed by another writer during validation", async () => {
    const before = git("rev-parse", "HEAD");
    seam.check.mockImplementation((command: string) => { if (command === "pnpm test") { write("notes.txt", "unvalidated edit\n"); git("add", "notes.txt"); } });
    const result = await release();
    console.info(`F003 EXPECTED: exit 1 with original HEAD; ACTUAL: exit ${result}, headChanged=${git("rev-parse", "HEAD") !== before}`);
    expect(result).toBe(1); expect(git("rev-parse", "HEAD")).toBe(before);
    expect(version()).toBe("1.0.0"); expect(contents("notes.txt")).toBe("unvalidated edit\n");
    expect(git("show", ":notes.txt")).toBe("unvalidated edit");
  }, 90_000);
  it("F001 edge preserves a newer commit after the release commit", async () => {
    failTag(() => { write("notes.txt", "parallel commit\n"); git("add", "notes.txt"); git("commit", "-m", "Parallel writer"); });
    expect(await release()).toBe(1);
    expect(git("log", "-1", "--format=%s")).toBe("Parallel writer");
    expect(git("log", "-1", "--format=%s", "HEAD^")).toBe("Release v1.0.1");
    expect(contents("notes.txt")).toBe("parallel commit\n");
  }, 90_000);
  it("F001 edge does not delete a tag created by another writer", async () => {
    const original = git("rev-parse", "HEAD");
    failTag(() => { git("tag", "v1.0.1", original); });
    expect(await release()).toBe(1);
    expect(git("rev-parse", "v1.0.1^{}")).toBe(original);
    expect(git("log", "-1", "--format=%s")).toBe("Release v1.0.1");
  }, 90_000);
  it("F002 edge retains generated metadata after a plain commit failure", async () => {
    const head = git("rev-parse", "HEAD");
    seam.git.mockImplementation((command: string, args: string[]) => { if (command === "git" && args[0] === "commit") throw new Error("commit failure"); });
    expect(await release()).toBe(1);
    expect(version()).toBe("1.0.1"); expect(contents("CHANGELOG.md")).toContain("## v1.0.1");
    expect(git("rev-parse", "HEAD")).toBe(head); expect(git("status", "--porcelain")).toContain("package.json");
  }, 90_000);
  it("F002 edge preserves a different index version even when the working file matches release output", async () => {
    let generated = "";
    seam.git.mockImplementation((command: string, args: string[]) => {
      if (command === "git" && args[0] === "commit") {
        generated = contents("CHANGELOG.md"); write("CHANGELOG.md", "parallel staged metadata\n"); git("add", "CHANGELOG.md"); write("CHANGELOG.md", generated); throw new Error("commit failure");
      }
    });
    expect(await release()).toBe(1);
    expect(contents("CHANGELOG.md")).toBe(generated);
    expect(git("show", ":CHANGELOG.md")).toBe("parallel staged metadata");
    expect(version()).toBe("1.0.1");
  }, 90_000);
  it("F002 edge retains its newly created changelog on a plain commit failure", async () => {
    git("rm", "CHANGELOG.md"); git("commit", "-m", "Fixture without changelog");
    seam.git.mockImplementation((command: string, args: string[]) => { if (command === "git" && args[0] === "commit") throw new Error("commit failure"); });
    expect(await release()).toBe(1);
    expect(existsSync(join(dir, "CHANGELOG.md"))).toBe(true);
    expect(version()).toBe("1.0.1"); expect(contents("CHANGELOG.md")).toContain("## v1.0.1");
  }, 90_000);
  it("F003 edge preserves a clean new HEAD committed during validation", async () => {
    let newer = "";
    seam.check.mockImplementation((command: string) => {
      if (command === "pnpm test") { write("notes.txt", "new committed work\n"); git("add", "notes.txt"); git("commit", "-m", "Parallel validated boundary"); newer = git("rev-parse", "HEAD"); }
    });
    expect(await release()).toBe(1); expect(git("rev-parse", "HEAD")).toBe(newer);
    expect(version()).toBe("1.0.0"); expect(git("status", "--porcelain")).toBe("");
  }, 90_000);
  it("F003 edge preserves a branch switch during validation", async () => {
    seam.check.mockImplementation((command: string) => { if (command === "pnpm test") git("switch", "-c", "parallel"); });
    expect(await release()).toBe(1);
    expect(git("branch", "--show-current")).toBe("parallel"); expect(version()).toBe("1.0.0");
  }, 90_000);
  it("F003 edge excludes an unrelated file staged immediately before commit", async () => {
    seam.git.mockImplementation((command: string, args: string[]) => {
      if (command === "git" && args[0] === "commit") { write("notes.txt", "late staged work\n"); git("add", "notes.txt"); }
    });
    expect(await release()).toBe(0);
    expect(git("show", "HEAD:notes.txt")).toBe("base note");
    expect(git("show", ":notes.txt")).toBe("late staged work"); expect(contents("notes.txt")).toBe("late staged work\n");
  }, 90_000);
});

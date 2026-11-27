import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ home: "" }));
// Varsayılan ev dizini kullanıcının gerçek ~/.claude'u değil.
vi.mock("node:os", async (orig) => ({ ...(await orig<object>()), homedir: () => fake.home }));
import { DEV_TOOLS, devToolCommand, devToolIds, devToolOf, devToolStatus } from "../src/dev-tools.ts";

describe("dev-tools kataloğu", () => {
  it("kimlik ve skill adları tekil; skill kaynakları commit'e, MCP paketi tam sürüme sabit", () => {
    expect(new Set(DEV_TOOLS.map((t) => t.id)).size).toBe(DEV_TOOLS.length);
    const skills = DEV_TOOLS.flatMap((t) => t.skills);
    // iart'ın threejs-animation'ı CloudAI-X'inkiyle çakışır; yalnız biri kurulur.
    expect(new Set(skills).size).toBe(skills.length);
    for (const t of DEV_TOOLS) {
      if (t.kind === "skills") expect(t.commit).toMatch(/^[0-9a-f]{40}$/);
      else expect(t.pkg).toMatch(/@\d+\.\d+\.\d+$/);
    }
  });

  it("komut argümanlarında kabuk karakteri yok (Windows'ta kabukla açılır)", () => {
    for (const t of DEV_TOOLS) for (const platform of ["win32", "linux"]) {
      const { command, args } = devToolCommand(t, platform);
      for (const a of [command, ...args]) expect(a).toMatch(/^[\w@./:-]+$/);
    }
  });

  it("skill'ler skills CLI ile genel ve kopya olarak, MCP kullanıcı kapsamında kurulur; Windows'ta npx cmd /c ile sarılır", () => {
    expect(devToolCommand(devToolOf("webgl-animation-skills")!)).toEqual({
      command: "npx",
      args: ["-y", "skills@1.9.0", "add", "iart-ai/webgl-animation-skills@0041933813688c357804f7b13dcb85095c5a3210", "--skill", "shader-glsl", "--skill", "particle-system", "-g", "-a", "claude-code", "-y", "--copy"],
    });
    const mcp = devToolOf("threejs-devtools-mcp")!;
    expect(devToolCommand(mcp, "win32").args).toEqual(["mcp", "add", "--scope", "user", "threejs-devtools-mcp", "--", "cmd", "/c", "npx", "-y", "threejs-devtools-mcp@0.5.0"]);
    expect(devToolCommand(mcp, "darwin").args.slice(-3)).toEqual(["npx", "-y", "threejs-devtools-mcp@0.5.0"]);
    expect(devToolCommand(mcp).command).toBe("claude");
  });

  it("devToolIds: katalog sırasında, tekrarsız; bilinmeyen ya da metin olmayan kimlik undefined", () => {
    expect(devToolIds(["threejs-devtools-mcp", "threejs-skills", "threejs-skills"])).toEqual(["threejs-skills", "threejs-devtools-mcp"]);
    expect(devToolIds([])).toEqual([]);
    expect(devToolIds(["blender"])).toBeUndefined();
    expect(devToolIds([1])).toBeUndefined();
  });
});

describe("devToolStatus", () => {
  const home = () => mkdtempSync(join(tmpdir(), "ys-devtools-"));
  const skill = (h: string, name: string) => {
    mkdirSync(join(h, ".claude", "skills", name), { recursive: true });
    writeFileSync(join(h, ".claude", "skills", name, "SKILL.md"), "---\nname: x\n---\n");
  };

  it("skill dosyalarını sayar, MCP'yi kullanıcı ayarındaki adla bulur", async () => {
    const h = home();
    for (const s of devToolOf("threejs-skills")!.skills) skill(h, s);
    skill(h, "shader-glsl");
    mkdirSync(join(h, ".claude", "skills", "particle-system"), { recursive: true }); // SKILL.md yok: sayılmaz
    writeFileSync(join(h, ".claude.json"), JSON.stringify({ oauthAccount: { secret: "x" }, mcpServers: { "threejs-devtools-mcp": { command: "npx" } } }));
    expect(await devToolStatus(h)).toEqual([
      { id: "threejs-skills", installed: 9, total: 9, ready: true },
      { id: "webgl-animation-skills", installed: 1, total: 2, ready: false },
      { id: "cinematic-3d-video", installed: 0, total: 1, ready: false },
      { id: "threejs-devtools-mcp", installed: 1, total: 1, ready: true },
    ]);
  });

  it("ayar dosyası yoksa, bozuksa ya da sunucu listesi nesne değilse MCP kurulu sayılmaz", async () => {
    const mcp = async (h: string) => (await devToolStatus(h)).find((s) => s.id === "threejs-devtools-mcp")!.installed;
    const h = home();
    expect(await mcp(h)).toBe(0);
    writeFileSync(join(h, ".claude.json"), "{bozuk");
    expect(await mcp(h)).toBe(0);
    writeFileSync(join(h, ".claude.json"), JSON.stringify({ mcpServers: null }));
    expect(await mcp(h)).toBe(0);
    writeFileSync(join(h, ".claude.json"), JSON.stringify({}));
    expect(await mcp(h)).toBe(0);
  });

  it("varsayılan ev dizinini okur", async () => {
    fake.home = home();
    skill(fake.home, "cinematic-3d-video");
    expect((await devToolStatus()).filter((s) => s.ready).map((s) => s.id)).toEqual(["cinematic-3d-video"]);
  });
});

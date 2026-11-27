import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lastChild, resetStudio } from "./fakes.ts";

vi.mock("server-only", () => ({}));
vi.mock("node:child_process", async (orig) => ({ ...(await orig<object>()), spawn: (await import("./fakes.ts")).spawn }));
const home = await vi.hoisted(async () => {
  const { tempRoot } = await import("./fakes.ts");
  process.env.YS_ROOT = tempRoot();
  return tempRoot();
});
// Durum kullanıcının gerçek ~/.claude'una değil, geçici bir ev dizinine bakar.
vi.mock("node:os", async (orig) => ({ ...(await orig<object>()), homedir: () => home }));

const server = await import("../../src/lib/server.ts");
const route = await import("../../src/app/api/dev-tools/route.ts");

const TR = { "accept-language": "tr-TR,tr;q=0.9" };
const post = (body: string) => new Request("http://localhost:3100/api/dev-tools", { method: "POST", body, headers: { "content-type": "application/json", ...TR } });

beforeEach(() => resetStudio());

describe("/api/dev-tools", () => {
  it("GET araçların durumunu ve kurulum işini verir", async () => {
    mkdirSync(join(home, ".claude", "skills", "cinematic-3d-video"), { recursive: true });
    writeFileSync(join(home, ".claude", "skills", "cinematic-3d-video", "SKILL.md"), "x");
    const body = (await (await route.GET()).json()) as { tools: { id: string; ready: boolean }[]; job: unknown };
    expect(body.tools.find((t) => t.id === "cinematic-3d-video")?.ready).toBe(true);
    expect(body.tools.find((t) => t.id === "threejs-skills")?.ready).toBe(false);
    expect(body.job).toBeNull();
  });

  it("POST yalnız katalog kimliklerini kabul eder, kurulumu CLI işine verir; iş sürerken 409", async () => {
    for (const body of ['{"ids":["blender"]}', '{"ids":"threejs-skills"}', '{"ids":[1]}']) {
      const res = await route.POST(post(body));
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toMatch(/^Bilinmeyen araç: /);
    }
    expect((await route.POST(post("null"))).status).toBe(400);
    const ok = await route.POST(post('{"ids":["threejs-devtools-mcp","threejs-skills"]}'));
    expect(ok.status).toBe(200);
    expect(lastChild().args.slice(2)).toEqual(["skills", "install", "threejs-skills", "threejs-devtools-mcp"]);
    expect(server.getJob("dev-tools")?.label).toBe("job.devTools");
    expect((await route.POST(post("{}"))).status).toBe(409);
    lastChild().emit("exit", 0);
    expect((await route.POST(post("{}"))).status).toBe(200);
    expect(lastChild().args.slice(2)).toEqual(["skills", "install"]);
  });
});

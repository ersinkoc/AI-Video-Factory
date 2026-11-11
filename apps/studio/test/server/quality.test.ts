import { mkdtemp, stat, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemStore, makeState } from "../../../../packages/pipeline/test/pipeline-harness.ts";
import { putJson } from "@ys/storage";
import { acquireLock } from "@ys/pipeline/light";

const deps = vi.hoisted(() => ({ store: undefined as unknown, state: undefined as unknown }));
vi.mock("../../src/lib/server.ts", () => ({ store: () => deps.store, repo: () => ({ load: async () => deps.state }) }));
const route = await import("../../src/app/api/episodes/[id]/quality/route.ts");
const dirs: string[] = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
const ctx = { params: Promise.resolve({ id: "e" }) };
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "ys-quality-http-")); dirs.push(dir);
  const path = join(dir, "video.mp4"); await writeFile(path, "media"); const file = await stat(path);
  const store = new MemStore(), key = "episodes/e/render-audits/report.json";
  const state = makeState({}, { render: { path, at: "t", exportId: "v1", audit: { status: "complete", at: "a", renderedAt: "t", exportId: "v1", source: { bytes: file.size, modifiedAt: file.mtime.toISOString() }, findingsCount: 80, findings: [], checks: [], reportKey: key } } }); state.id = "e";
  await putJson(store, key, { renderedAt: "t", exportId: "v1", findings: Array.from({ length: 80 }, (_, i) => ({ id: `s${i}`, kind: "freeze", detail: `Finding ${i}`, startSec: i, endSec: i + 1 })) });
  deps.store = store; deps.state = state; return { store, state };
}
const post = (body: unknown) => new Request("http://localhost/api/episodes/e/quality", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
describe("quality HTTP workflow", () => {
  it("pages the full report and filters before pagination", async () => {
    await fixture();
    const first = await (await route.GET(new Request("http://localhost/?source=audit"), ctx)).json();
    expect(first.total).toBe(80); expect(first.issues).toHaveLength(50);
    const next = await (await route.GET(new Request("http://localhost/?offset=50"), ctx)).json();
    expect(next.issues).toHaveLength(30); expect(next.issues[0].shotId).toBe("s50");
    expect((await (await route.GET(new Request("http://localhost/?target=short"), ctx)).json()).total).toBe(0);
  });
  it("persists a decision without changing production state and refuses stale or concurrent edits", async () => {
    const { store, state } = await fixture(), before = JSON.stringify(state);
    const first = await (await route.GET(new Request("http://localhost/"), ctx)).json();
    const body = { issueKey: first.issues[0].key, exportId: "v1", status: "accepted" };
    expect((await route.POST(post(body), ctx)).status).toBe(200); expect(JSON.stringify(state)).toBe(before);
    expect((await (await route.GET(new Request("http://localhost/?status=accepted"), ctx)).json()).total).toBe(1);
    const release = await acquireLock(store, "e");
    try { expect((await route.POST(post(body), ctx)).status).toBe(400); } finally { await release(); }
    state.render!.exportId = "v2";
    expect((await route.POST(post(body), ctx)).status).toBe(400);
    expect((await route.POST(post({ ...body, status: "approved-for-publication" }), ctx)).status).toBe(400);
    expect((await route.GET(new Request("http://localhost/?offset=-1"), ctx)).status).toBe(400);
  });
  it("rejects invalid episode IDs, oversized decisions and invalid field types before writing", async () => {
    const { store } = await fixture(), bad = { params: Promise.resolve({ id: ".." }) };
    expect((await route.GET(new Request("http://localhost/"), bad)).status).toBe(400); expect((await route.POST(post({}), bad)).status).toBe(400);
    expect((await route.POST(new Request("http://localhost/", { method: "POST", body: "x".repeat(4097) }), ctx)).status).toBe(400);
    for (const body of [null, {}, { issueKey: 1 }, { issueKey: "a", exportId: 1 }, { issueKey: "a", exportId: "x".repeat(129), status: "open" }, { issueKey: "a", exportId: "v1", status: 1 }]) expect((await route.POST(post(body), ctx)).status).toBe(400);
    expect(await store.get("episodes/e/quality-decisions.json")).toBeNull();
  });
});

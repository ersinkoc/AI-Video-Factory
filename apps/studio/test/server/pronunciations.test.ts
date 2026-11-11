import { describe, expect, it, vi } from "vitest";
import { EpisodeRepo } from "@ys/pipeline/light";
import { makeState, MemStore, scene, voiceOf } from "../../../../packages/pipeline/test/pipeline-harness.ts";

const deps = vi.hoisted(() => ({ store: undefined as unknown, repo: undefined as unknown, busy: false }));
vi.mock("../../src/lib/server.ts", () => ({ store: () => deps.store, repo: () => deps.repo, episodeBusy: async () => deps.busy }));
const route = await import("../../src/app/api/episodes/[id]/pronunciations/route.ts");
const ctx = { params: Promise.resolve({ id: "pronunciation-fixture" }) };
const post = (body: unknown) => route.POST(new Request("http://localhost/", { method: "POST", body: JSON.stringify(body), headers: { "accept-language": "en" } }), ctx);
const get = () => route.GET(new Request("http://localhost/"), ctx);
async function fixture() {
  const store = new MemStore(), repo = new EpisodeRepo(store), state = makeState({}, { script: { scenes: [scene("s1", "C++")] }, voice: { s1: { ...voiceOf("s1"), text: "C++", spoken: "si pılas pılas" } }, done: { voice: "done", render: "done" }, render: { path: "old.mp4", at: "old", exportId: "old-export" } }); state.id = "pronunciation-fixture";
  await repo.save(state); deps.store = store; deps.repo = repo; deps.busy = false; return { state, repo };
}
describe("pronunciation dictionary API", () => {
  it("saves shared and episode rules without synthesis, then applies only the reviewed impact", async () => {
    const f = await fixture(), before = await (await get()).json();
    expect((await post({ type: "put", scope: "shared", written: "c++", spoken: "shared", revision: before.revision })).status).toBe(200);
    expect(await f.repo.load(f.state.id)).toEqual(f.state);
    const global = await (await get()).json(); expect(global.shared).toHaveLength(1);
    expect((await post({ type: "put", scope: "episode", written: "C++", spoken: "episode", fingerprint: global.fingerprint })).status).toBe(200);
    const local = await f.repo.load(f.state.id); expect(local.voice).toEqual(f.state.voice); expect(local.done.voice).toBe("done");
    const preview = await (await post({ type: "preview" })).json(); expect(preview.affected).toEqual(["s1"]); expect(preview.scenes[0].spoken).toBe("episode");
    expect((await post({ type: "apply", ...preview })).status).toBe(200);
    const applied = await f.repo.load(f.state.id); expect(applied.voice?.s1).toBeUndefined(); expect(applied.render).toEqual(f.state.render);
    expect((await post({ type: "apply", ...preview })).status).toBe(400);
    expect((await get()).headers.get("cache-control")).toBe("no-store");
  });
  it("rejects stale revisions, forged data and a live producer", async () => {
    await fixture();
    expect((await post({ type: "put", scope: "shared", written: "Alpha", spoken: "alfa", revision: 0 })).status).toBe(200);
    expect((await post({ type: "put", scope: "shared", written: "Beta", spoken: "beta", revision: 0 })).status).toBe(400);
    expect((await post({ type: "put", scope: "episode", written: "__proto__", spoken: "x", fingerprint: "forged" })).status).toBe(400);
    expect((await post({ type: "apply", revision: "bad" })).status).toBe(400);
    deps.busy = true; expect((await post({ type: "preview" })).status).toBe(400);
    expect((await route.GET(new Request("http://localhost/"), { params: Promise.resolve({ id: ".." }) })).status).toBe(400);
  });
  it("removes only a local preference and retains the shared fallback", async () => {
    await fixture();
    let view = await (await get()).json();
    await post({ type: "put", scope: "shared", written: "C++", spoken: "shared", revision: view.revision });
    await post({ type: "put", scope: "episode", written: "C++", spoken: "local", fingerprint: view.fingerprint });
    view = await (await get()).json();
    expect((await post({ type: "remove", scope: "episode", written: "c++", fingerprint: view.fingerprint })).status).toBe(200);
    view = await (await get()).json(); expect(view.effective.find((e: { written: string }) => e.written === "C++").spoken).toBe("shared");
  });
  it("rejects malformed/oversized requests before changing records and reports unreadable dictionaries", async () => {
    const f = await fixture();
    for (const body of [null, {}, { type: "put", scope: "invalid" }, { type: "put", scope: "shared", written: "Word", spoken: "word" }, { type: "put", scope: "episode", written: "Word", spoken: "word" }, { type: "apply", fingerprint: "fp", rulesFingerprint: "rules", revision: .5 }]) expect((await post(body)).status).toBe(400);
    expect((await route.POST(new Request("http://localhost/", { method: "POST", body: "x".repeat(4097) }), ctx)).status).toBe(400);
    expect((await route.POST(new Request("http://localhost/", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: ".." }) })).status).toBe(400);
    expect(await f.repo.load(f.state.id)).toEqual(f.state);
    (deps.store as MemStore).putText("settings/pronunciations.json", "invalid JSON"); expect((await get()).status).toBe(400);
  });
});

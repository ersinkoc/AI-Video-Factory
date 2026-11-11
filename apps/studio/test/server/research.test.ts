import { describe, expect, it, vi } from "vitest";
import { makeState, MemStore, SCRIPT } from "../../../../packages/pipeline/test/pipeline-harness.ts";
import { freezeResearch, loadResearch, mutateResearch, researchView } from "@ys/pipeline/light";

const deps = vi.hoisted(() => ({ store: undefined as unknown, state: undefined as unknown }));
vi.mock("../../src/lib/server.ts", () => ({ store: () => deps.store, repo: () => ({ load: async () => deps.state }) }));
const route = await import("../../src/app/api/episodes/[id]/research/route.ts");
const ctx = { params: Promise.resolve({ id: "e" }) };
const post = (expectedRevision: number, mutation: unknown) => new Request("http://localhost/api/episodes/e/research", { method: "POST", headers: { "content-type": "application/json", "accept-language": "en" }, body: JSON.stringify({ expectedRevision, mutation }) });
async function fixture() {
  const store = new MemStore(), state = makeState({}, { script: SCRIPT }); state.id = "e"; deps.store = store; deps.state = state;
  return { state, store };
}
describe("research HTTP workflow", () => {
  it("registers sources/claims and preserves source review separately from episode state", async () => {
    const { state, store } = await fixture(), before = JSON.stringify(state);
    const sourceResponse = await route.POST(post(0, { type: "put-source", source: { title: "Fixture note", url: "https://example.org/note", excerpt: "A synthetic fixture." } }), ctx);
    expect(sourceResponse.status).toBe(200);
    const first = await (await route.GET(new Request("http://localhost/"), ctx)).json();
    expect(first.sources).toHaveLength(1); expect(first.revision).toBe(1);
    expect((await route.POST(post(1, { type: "put-claim", claim: { sceneId: "s1", quote: SCRIPT.scenes[0]!.narration, statement: "Fixture narration", kind: "fact", links: [{ sourceId: first.sources[0].id, relation: "supports" }] } }), ctx)).status).toBe(200);
    const claim = researchView(await loadResearch(store, "e"), state).claims[0]!;
    expect((await route.POST(post(2, { type: "review-claim", claimId: claim.id, fingerprint: claim.fingerprint, status: "supported" }), ctx)).status).toBe(200);
    expect(JSON.stringify(state)).toBe(before);
    state.render = { path: "main.mp4", at: "at", exportId: "export-1" }; state.render.research = await freezeResearch(store, state);
    const frozen = await route.GET(new Request("http://localhost/?render"), ctx);
    expect(frozen.status).toBe(200); expect((await frozen.json()).claims[0].status).toBe("supported");
    expect(frozen.headers.get("content-disposition")).toContain("e.research.json");
  });
  it("rejects stale/malformed input and cross-episode export pointers", async () => {
    const { state } = await fixture();
    const mutation = { type: "put-source", source: { title: "A", url: "https://example.org/" } };
    expect((await route.POST(post(0, mutation), ctx)).status).toBe(200);
    expect((await route.POST(post(0, mutation), ctx)).status).toBe(400);
    expect((await route.POST(post(1, { ...mutation, source: { title: "Bad", url: "javascript:alert(1)" } }), ctx)).status).toBe(400);
    state.render = { path: "video", at: "at", research: { reportKey: "episodes/other/research/exports/foreign.json", claims: 1, sources: 1, unresolved: 0, revision: 1, fingerprint: "x" } };
    expect((await route.GET(new Request("http://localhost/?render"), ctx)).status).toBe(404);
    expect((await route.POST(post(1, mutation), { params: Promise.resolve({ id: ".." }) })).status).toBe(400);
  });
});

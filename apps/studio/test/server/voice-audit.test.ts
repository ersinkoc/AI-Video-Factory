import { describe, expect, it, vi } from "vitest";
import { collectVoiceAudit } from "@ys/pipeline/light";
import { makeState, MemStore } from "../../../../packages/pipeline/test/pipeline-harness.ts";

const deps = vi.hoisted(() => ({ store: undefined as unknown, state: undefined as unknown }));
vi.mock("../../src/lib/server.ts", () => ({ store: () => deps.store, repo: () => ({ load: async () => deps.state }) }));
const route = await import("../../src/app/api/episodes/[id]/voice-audit/route.ts");
const ctx = { params: Promise.resolve({ id: "voice-fixture" }) };
const unusedDecoder = async (): Promise<never> => { throw new Error("No voice files in this fixture"); };
async function fixture() {
  const store = new MemStore(), state = makeState({}, { script: { scenes: [{ id: "s1", beatId: "b", narration: "Expected voice", visualIntent: "", emotion: "", location: "" }] } }); state.id = "voice-fixture";
  deps.store = store; deps.state = state; return { store, state };
}
describe("voice report API", () => {
  it("serves current full evidence, downloads it and discloses stale script changes", async () => {
    const { store, state } = await fixture(); state.voiceAudit = await collectVoiceAudit(state, store, unusedDecoder);
    const response = await route.GET(new Request("http://localhost/"), ctx), data = await response.json();
    expect(response.headers.get("cache-control")).toBe("no-store"); expect(data.evidence.current).toBe(true);
    expect(data.evidence.report.scenes[0].findings[0].kind).toBe("voice_missing");
    const download = await route.GET(new Request("http://localhost/?download"), ctx);
    expect(download.headers.get("content-disposition")).toContain("voice-fixture.voice-audit.json");
    state.script!.scenes[0]!.narration = "New narration";
    expect((await (await route.GET(new Request("http://localhost/"), ctx)).json()).evidence.current).toBe(false);
  });
  it("handles absent evidence and rejects invalid, cross-episode and corrupted report references", async () => {
    const { store, state } = await fixture();
    expect((await (await route.GET(new Request("http://localhost/"), ctx)).json()).evidence).toBeNull();
    expect((await route.GET(new Request("http://localhost/?download"), ctx)).status).toBe(404);
    expect((await route.GET(new Request("http://localhost/"), { params: Promise.resolve({ id: ".." }) })).status).toBe(400);
    state.voiceAudit = await collectVoiceAudit(state, store, unusedDecoder); const key = state.voiceAudit.reportKey!;
    state.voiceAudit.reportKey = "episodes/other/voice-audits/foreign.json";
    expect((await route.GET(new Request("http://localhost/"), ctx)).status).toBe(400);
    state.voiceAudit.reportKey = key; const value = store.json(key); value.episodeId = "other"; store.putJsonSync(key, value);
    expect((await route.GET(new Request("http://localhost/"), ctx)).status).toBe(400);
  });
});

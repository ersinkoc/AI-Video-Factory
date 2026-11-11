import { createHash } from "node:crypto";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArchiveImage, ArchiveCandidate } from "@ys/core";
import { searchArchives, importArchiveImage } from "../src/archive.ts";
import { archiveCredits } from "../src/archive-credits.ts";
import { redrawShots, replanShots, setArchiveShot } from "../src/actions.ts";
import { buildTimeline } from "../src/timing.ts";
import { MemStore, harness, makeState, scene, STYLE, voiceOf } from "./pipeline-harness.ts";
import { onAgent } from "./pipeline-fakes.ts";
vi.mock("@ys/agents", async (orig) => (await import("./pipeline-fakes.ts")).mockAgents(await orig()));

const response = (data: unknown) => Response.json(data);
function endpoints(url: string) {
  if (url.includes("api.artic.edu")) return response({ data: [{ id: 7, title: "Cat", image_id: "aabb-1234", is_public_domain: true, artist_display: "Artist", date_display: "1900" }] });
  if (url.includes("clevelandart.org")) return response({ data: [{ id: 8, accession_number: "1917.998", title: "Cat coffin", share_license_status: "CC0", images: { web: { url: "https://openaccess-cdn.clevelandart.org/a.jpg" } }, creators: [{ description: "Maker" }] }] });
  return response({ collection: { items: [{ data: [{ nasa_id: "apollo-photo", title: "Apollo 11", center: "NASA", date_created: "1969" }], links: [{ render: "image", href: "https://images-assets.nasa.gov/image/apollo/photo.jpg" }] }] } });
}
const source: ArchiveCandidate = { id: `nasa-${"a".repeat(24)}`, provider: "nasa", title: "Apollo 11", creator: "NASA", date: "1969", sourceId: "apollo-photo", sourceUrl: "https://images.nasa.gov/details/apollo-photo", imageUrl: "https://images-assets.nasa.gov/image/apollo/photo.jpg" };
const photo: ArchiveImage = { key: "assets/archive/photo.jpg", mimeType: "image/jpeg", source, width: 80, height: 120, originalSha256: "original-hash", downloadedAt: "then" };
afterEach(() => vi.unstubAllGlobals());

describe("official archive discovery and ingestion", () => {
  it("searches three official APIs and reuses a successful normalized query", async () => {
    const store = new MemStore();
    const fetcher = vi.fn(async (url: string | URL | Request) => endpoints(String(url))) as unknown as typeof fetch;
    const first = await searchArchives(" cat  ", { store, fetch: fetcher });
    expect(first.items.map((i) => i.provider)).toEqual(["aic", "cleveland", "nasa"]);
    expect(first.errors).toEqual([]);
    expect(first.items[1]!.sourceUrl).toBe("https://www.clevelandart.org/art/1917.998");
    expect(await searchArchives("CAT", { store, fetch: fetcher })).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect([...store.map.keys()].filter((k) => k.includes("/items/"))).toHaveLength(3);
  });
  it("keeps a failed provider explicit and retries instead of caching an empty success", async () => {
    const store = new MemStore();
    const fetcher = vi.fn(async (url: string | URL | Request) => String(url).includes("clevelandart.org") ? new Response("down", { status: 503 }) : endpoints(String(url))) as unknown as typeof fetch;
    const result = await searchArchives("cat", { store, fetch: fetcher });
    expect(result.errors).toEqual([{ provider: "cleveland", message: "HTTP 503" }]);
    expect(result.items).toHaveLength(2);
    await searchArchives("cat", { store, fetch: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(6);
  });
  it("downloads a discovered image once, retaining its content identity and source", async () => {
    const store = new MemStore();
    store.putJsonSync(`library/archive/items/${source.id}.json`, source);
    const png = await sharp({ create: { width: 80, height: 120, channels: 3, background: "#5599aa" } }).png().toBuffer();
    const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => {
      expect(init.redirect).toBe("error"); expect(new Headers(init.headers).get("referer")).toBe(source.sourceUrl);
      return new Response(png, { headers: { "content-type": "image/png" } });
    }) as unknown as typeof fetch;
    const image = await importArchiveImage(source.id, { store, fetch: fetcher });
    expect(image).toMatchObject({ width: 80, height: 120, mimeType: "image/jpeg", source });
    expect(image.originalSha256).toBe(createHash("sha256").update(png).digest("hex"));
    expect((await sharp((await store.get(image.key))!).metadata()).format).toBe("jpeg");
    expect(await importArchiveImage(source.id, { store, fetch: fetcher })).toEqual(image);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("rejects arbitrary URLs, unsupported image hosts and oversized responses", async () => {
    const store = new MemStore();
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(importArchiveImage("https://example.com/image.jpg", { store, fetch: fetcher })).rejects.toThrow("Invalid archive");
    expect(fetcher).not.toHaveBeenCalled();
    store.putJsonSync(`library/archive/items/${source.id}.json`, { ...source, imageUrl: "https://example.com/image.jpg" });
    await expect(importArchiveImage(source.id, { store, fetch: fetcher })).rejects.toThrow("host");
    store.putJsonSync(`library/archive/items/${source.id}.json`, source);
    const big = vi.fn(async () => new Response("x", { headers: { "content-length": "99999999" } })) as unknown as typeof fetch;
    await expect(importArchiveImage(source.id, { store, fetch: big })).rejects.toThrow("size limit");
    expect([...store.map.keys()].some((k) => k.startsWith("assets/"))).toBe(false);
  });
  it("rejects invalid queries before making requests", async () => {
    const store = new MemStore(); const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(searchArchives(" ", { store, fetch: fetcher })).rejects.toThrow("2–180");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reports malformed provider data and missing bodies instead of caching a successful search", async () => {
    for (const fetcher of [async () => Response.json({}), async () => new Response(null), async () => { throw "offline"; }]) {
      const store = new MemStore(), result = await searchArchives("test", { store, fetch: fetcher as typeof fetch });
      expect(result.items).toEqual([]); expect(result.errors).toHaveLength(3);
      expect([...store.map.keys()]).toEqual([]);
    }
  });
  it("discards non-public, incomplete, invalid and unsupported-host candidates", async () => {
    const payloads = [
      { data: [{ id: 1 }, { id: 2, is_public_domain: true, image_id: "invalid!" }, { id: 3, is_public_domain: true, image_id: "abc" }] },
      { data: [{ id: 1 }, { id: 2, share_license_status: "CC-BY", images: { web: { url: source.imageUrl } } }, { id: 3, share_license_status: "CC0", images: { web: { url: "https://example.com/x" } } }] },
      { collection: { items: [{}, { data: [{ nasa_id: "missing-image" }] }, { data: [{ nasa_id: "bad-url", title: "A" }], links: [{ render: "thumbnail", href: source.imageUrl }, { render: "image", href: "invalid-url" }] }] } },
    ];
    let index = 0;
    const result = await searchArchives("test", { store: new MemStore(), fetch: (async () => Response.json(payloads[index++])) as typeof fetch });
    expect(result.items).toEqual([]); expect(result.errors).toEqual([]);
  });
  it("keeps provider metadata optional and uses global fetch only as the explicit default boundary", async () => {
    const payloads = [
      { data: [] },
      { data: [{ id: 8, title: "Object", share_license_status: "CC0", images: { web: { url: "https://openaccess-cdn.clevelandart.org/a.jpg" } }, creators: [{}, { description: "Maker" }] }] },
      { collection: { items: ["photographer", "secondary_creator", "none"].map((field) => ({ data: [{ nasa_id: field, title: field, ...(field === "none" ? {} : { [field]: "Creator" }) }], links: [{ render: "image", href: source.imageUrl }] })) } },
    ];
    let index = 0; vi.stubGlobal("fetch", vi.fn(async () => Response.json(payloads[index++])));
    const result = await searchArchives("test", { store: new MemStore() });
    expect(result.items).toHaveLength(4); expect(result.items[0]!.sourceUrl).toBe("https://www.clevelandart.org/art/8");
    expect(result.items.at(-1)!.creator).toBe("NASA");
  });
  it("bounds streamed responses even without a Content-Length and handles cancellation failure", async () => {
    const cancel = vi.fn(async () => { throw new Error("already closed"); });
    const fetcher = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024 + 1)); }, cancel }));
    const result = await searchArchives("test", { store: new MemStore(), fetch: fetcher as typeof fetch });
    expect(result.errors.map((e) => e.message)).toEqual(Array(3).fill("Archive response exceeds size limit."));
    expect(cancel).toHaveBeenCalledTimes(3);
  });
  it("blocks credentials, non-HTTPS and ports and repairs a missing cached image", async () => {
    for (const imageUrl of ["http://images-assets.nasa.gov/a.jpg", "https://user@images-assets.nasa.gov/a.jpg", "https://:password@images-assets.nasa.gov/a.jpg", "https://images-assets.nasa.gov:444/a.jpg"]) {
      const store = new MemStore(); store.putJsonSync(`library/archive/items/${source.id}.json`, { ...source, imageUrl });
      await expect(importArchiveImage(source.id, { store })).rejects.toThrow("host");
    }
    const store = new MemStore(); store.putJsonSync(`library/archive/items/${source.id}.json`, source);
    store.putJsonSync(`library/archive/imports/${source.id}.json`, photo);
    const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "white" } }).png().toBuffer();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(png)));
    expect((await importArchiveImage(source.id, { store })).width).toBe(1);
  });
});

describe("archive shot selection and credits", () => {
  it("clears old image choices after a successful full replan but retains them if planning fails", async () => {
    const h = harness();
    const state = makeState({ motionMode: "still" }, { style: STYLE, script: { scenes: [scene("s1")] }, voice: { s1: voiceOf("s1") }, archives: { old: photo } });
    const id = await h.seed(state);
    onAgent("director", () => ({ scenes: [{ sceneId: "s1", shots: [{ startWord: 0, kind: "still_motion", description: "New content", imagePrompt: "New image", motionPrompt: "", camera: "static", ambience: "none", characterIds: [], locationId: "" }] }] }));
    expect((await h.pipeline.run(id, { only: "shots" })).archives).toBeUndefined();
    const previous = await h.load(id); previous.archives = { old: photo }; await h.pipeline.save(previous);
    onAgent("director", () => { throw new Error("planning failed"); });
    await expect(h.pipeline.run(id, { only: "shots" })).rejects.toThrow("planning failed");
    expect((await h.load(id)).archives).toEqual({ old: photo });
  });
  it("drops the archive override when the user explicitly redraws a shot", () => {
    const state = makeState({}, { shots: [{ id: "shot", sceneId: "s1", kind: "still_motion", startMs: 0, endMs: 4000, description: "space", imagePrompt: "", motionPrompt: "", camera: "static" }], archives: { shot: photo } });
    redrawShots(state, ["shot"]);
    expect(state.archives?.shot).toBeUndefined();
  });
  it("drops archive overrides only in a scene explicitly queued for replanning", () => {
    const shot = (id: string, sceneId: string) => ({ id, sceneId, kind: "still_motion" as const, startMs: 0, endMs: 4000, description: "space", imagePrompt: "", motionPrompt: "", camera: "static" as const });
    const state = makeState({ motionMode: "vector" }, { shots: [shot("one", "s1"), shot("two", "s1"), shot("other", "s2")], archives: { one: photo, two: photo, other: photo } });
    replanShots(state, ["one"], "Show the launch instead");
    expect(state.archives).toEqual({ other: photo });
  });
  it("uses the complete archive image in place of a generated shot and restores the original plan", () => {
    const original = { key: "assets/generated.jpg", mimeType: "image/jpeg" };
    const state = makeState({}, { style: STYLE, script: { scenes: [{ id: "s1", narration: "Words", beatId: "b", visualIntent: "", emotion: "", location: "" }] }, voice: { s1: voiceOf("s1") },
      shots: [{ id: "shot", sceneId: "s1", kind: "ai_clip", startMs: 0, endMs: 4000, description: "Archive insert", imagePrompt: "", motionPrompt: "", camera: "push_in" }],
      keyframes: { shot: original }, clips: { shot: { key: "clip.mp4", mimeType: "video/mp4", durationSec: 4 } }, done: { keyframes: "t", render: "t", timeline: "t" }, approvals: { preview: "t" } });
    setArchiveShot(state, "shot", photo);
    const selected = buildTimeline(state, (key) => key);
    expect(selected.visuals[0]).toMatchObject({ assetUrl: photo.key, archiveSource: source, fit: "contain", kind: "still_motion", motion: { type: "none" } });
    expect(state.done.render).toBeUndefined(); expect(state.done.keyframes).toBe("t"); expect(state.approvals?.preview).toBeUndefined();
    expect(state.keyframes?.shot).toEqual(original);
    setArchiveShot(state, "shot");
    expect(buildTimeline(state, (key) => key).visuals[0]!.assetUrl).toBe("clip.mp4");
    expect(() => setArchiveShot(state, "unknown", photo)).toThrow();
  });
  it("credits only sources frozen into the successful render and deduplicates repeated uses", () => {
    const state = makeState({}, { archives: { pending: photo }, render: { path: "video.mp4", at: "t" } });
    expect(archiveCredits(state)).toEqual([]);
    state.render!.archiveSources = ["one", "two"].map((shotId) => ({ shotId, key: photo.key, source }));
    expect(archiveCredits(state)).toHaveLength(2);
    expect(archiveCredits(state).join("\n")).toContain(source.sourceUrl);
    state.archives = {};
    expect(archiveCredits(state)).toHaveLength(2);
  });
  it("localizes credits and omits absent creator/date metadata", () => {
    expect(archiveCredits(makeState())).toEqual([]);
    const state = makeState({ lang: "tr" }, { render: { path: "video", at: "t", archiveSources: [{ shotId: "s", key: photo.key, source: { ...source, creator: "", date: "" } }] } });
    expect(archiveCredits(state)).toEqual(["Görsel kaynakları:", `${source.title} — ${source.sourceUrl}`]);
    state.input.lang = "en"; expect(archiveCredits(state)[0]).toBe("Image sources:");
    const noArchive = makeState({ motionMode: "vector" }, { shots: [{ id: "shot", sceneId: "s1", kind: "still_motion", startMs: 0, endMs: 1000, camera: "static", description: "Hero", imagePrompt: "", motionPrompt: "" }] });
    replanShots(noArchive, ["shot"], "Replan"); expect(noArchive.archives).toBeUndefined();
  });
});

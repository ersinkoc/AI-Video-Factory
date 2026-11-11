import { describe, expect, it, vi } from "vitest";
import { auditVoiceEvidence, collectVoiceAudit, readVoiceAudit, voiceInputFingerprint } from "../src/voice-audit.ts";
import { qualityView } from "../src/quality.ts";
import { acquireLock } from "../src/lock.ts";
import { restoreWords, sayPlan, LEXICON } from "../src/pronounce.ts";
import { makeState, MemStore, harness } from "./pipeline-harness.ts";
import type { SceneVoice } from "../src/state.ts";
import type { VoiceAudioMeasurement } from "@ys/video/voice-audit";

const script = "Steve Jobs 2026.";
const voice = (): SceneVoice => ({ key: "voice/test.wav", mimeType: "audio/wav", text: script, spoken: "stiv cobs iki bin yirmi altı", durationMs: 4000, estimatedTiming: false, words: [{ text: "Steve", startMs: 100, endMs: 500 }, { text: "Jobs", startMs: 500, endMs: 1000 }, { text: "2026.", startMs: 2200, endMs: 3500 }] });
const measurement = (silent = false): VoiceAudioMeasurement => ({ durationMs: 4000, sampleRate: 48000, channels: 1, blocks: Array.from({ length: 40 }, (_, i) => ({ startSec: i / 10, endSec: (i + 1) / 10, rmsDbfs: !silent && (i >= 1 && i < 10 || i >= 22 && i < 35) ? -20 : null, sampledPeakDbfs: silent ? null : -15 })) });
function state() { const s = makeState({}, { script: { scenes: [{ id: "s1", beatId: "b", narration: script, visualIntent: "", emotion: "", location: "" }] }, voice: { s1: voice() } }); s.id = "voice-fixture"; return s; }
describe("voice-only evidence", () => {
  it("does not flag intentional pauses between supplied word windows", () => {
    const result = auditVoiceEvidence("s1", script, voice(), measurement());
    expect(result.findings).toEqual([]); expect(result.metrics?.quietWordMs).toBeCloseTo(0);
    expect(result.checks).toContainEqual(expect.objectContaining({ name: "semantic", status: "skipped" }));
  });
  it("detects silence and missing word activity independently of an audible mixed soundtrack", () => {
    const silent = auditVoiceEvidence("s1", script, voice(), measurement(true));
    expect(silent.findings).toContainEqual(expect.objectContaining({ kind: "voice_silent" })); expect(silent.metrics!.rmsDbfs).toBeNull();
    const partial = measurement(); partial.blocks = partial.blocks.map((b) => b.startSec >= 2 ? { ...b, rmsDbfs: null, sampledPeakDbfs: null } : b);
    expect(auditVoiceEvidence("s1", script, voice(), partial).findings).toContainEqual({ sceneId: "s1", kind: "voice_word_gap", startMs: 2200, endMs: 3500 });
  });
  it("discloses estimated or absent timing instead of claiming measured word alignment", () => {
    const v = voice(); v.estimatedTiming = true;
    const result = auditVoiceEvidence("s1", script, v, measurement());
    expect(result.checks).toContainEqual(expect.objectContaining({ name: "word_activity", status: "skipped" }));
    expect(auditVoiceEvidence("s1", script, v, measurement(true)).findings.some((f) => f.kind === "voice_silent")).toBe(true);
    v.words = []; const missing = auditVoiceEvidence("s1", script, v, measurement());
    expect(missing.findings.map((f) => f.kind)).toEqual(expect.arrayContaining(["caption_mismatch", "voice_timing_invalid"]));
    expect(auditVoiceEvidence("pause", "…", undefined).findings).toEqual([]);
  });
  it("retains written long names and numbers while exposing a different spoken form", () => {
    const plan = sayPlan("Steve Jobs 2026.", { ...LEXICON.tr, "Steve Jobs": "stiv cobs" }, "tr");
    const words = plan.spoken.split(" ").map((text, i) => ({ text, startMs: i * 400, endMs: (i + 1) * 400 }));
    const restored = restoreWords(words, plan), v = { ...voice(), words: restored, spoken: plan.spoken };
    const result = auditVoiceEvidence("s1", script, v);
    expect(result.forms.captions).toBe(script); expect(result.forms.spoken).not.toBe(script);
    expect(result.findings.some((f) => f.kind === "caption_mismatch")).toBe(false);
    delete v.text; expect(auditVoiceEvidence("s1", script, v).checks).toContainEqual(expect.objectContaining({ name: "recorded_text", status: "skipped" }));
  });
  it("flags changed text, invalid timing, source duration and undecoded coverage separately", () => {
    const v = voice(); v.text = "Old text"; v.words[0]!.startMs = -1;
    expect(auditVoiceEvidence("s1", script, v, measurement()).findings.map((f) => f.kind)).toEqual(expect.arrayContaining(["voice_text_mismatch", "voice_timing_invalid"]));
    const short = measurement(); short.durationMs = 3000; short.blocks = short.blocks.slice(0, 30);
    const truncated = auditVoiceEvidence("s1", script, voice(), short);
    expect(truncated.findings.map((f) => f.kind)).toEqual(expect.arrayContaining(["voice_duration_mismatch", "voice_decode_coverage"]));
    expect(truncated.checks).toContainEqual(expect.objectContaining({ name: "word_activity", status: "failed" }));
  });
  it("keeps absent decoded blocks unmeasured and reports string decoder/storage failures", async () => {
    const empty = measurement(); empty.blocks = [];
    expect(auditVoiceEvidence("s1", script, voice(), empty).findings).toContainEqual(expect.objectContaining({ kind: "voice_decode_coverage", startMs: 0 }));
    const v = voice(); delete v.spoken;
    expect(auditVoiceEvidence("s1", script, v).forms.spoken).toBe(script);
    const store = new MemStore(), s = state(); await store.put(voice().key, new Uint8Array([1]));
    s.voiceAudit = await collectVoiceAudit(s, store, async () => { throw "decoder offline"; });
    expect((await readVoiceAudit(store, s))!.report.scenes[0]!.checks).toContainEqual(expect.objectContaining({ name: "source", reason: "decoder offline" }));
    await store.delete(voice().key); expect((await readVoiceAudit(store, s))!.current).toBe(false);
    store.put = async () => { throw "storage offline"; };
    expect(await collectVoiceAudit(s, store, async () => measurement())).toMatchObject({ status: "failed", error: "storage offline" });
  });
});
describe("voice audit persistence and integration", () => {
  it("saves a bounded summary, verifies byte identity and exposes read-only working findings", async () => {
    const store = new MemStore(), s = state(); await store.put(voice().key, new Uint8Array([1]));
    s.voiceAudit = await collectVoiceAudit(s, store, async () => measurement(true));
    expect(s.voiceAudit.status).toBe("complete"); expect(s.voiceAudit.findingsCount).toBe(1);
    expect((await readVoiceAudit(store, s))?.current).toBe(true);
    const q = await qualityView(s, store); expect(q.issues).toContainEqual(expect.objectContaining({ target: "plan", source: "voice", kind: "voice_silent" }));
    expect(q.issues.every((i) => !i.exportId)).toBe(true);
    await store.put(voice().key, new Uint8Array([2]));
    expect((await readVoiceAudit(store, s))?.current).toBe(false);
    expect((await qualityView(s, store)).issues.filter((i) => i.source === "voice")).toEqual([]);
  });
  it("does not upgrade missing files or failed decoding to clean measurements", async () => {
    const store = new MemStore(), s = state();
    s.voiceAudit = await collectVoiceAudit(s, store, async () => measurement());
    expect(s.voiceAudit.status).toBe("incomplete"); expect(s.voiceAudit.findings.some((f) => f.kind === "voice_missing")).toBe(true);
    await store.put(voice().key, new Uint8Array([1])); expect((await readVoiceAudit(store, s))?.current).toBe(false);
    const decode = vi.fn(async () => { throw new Error("Decoder failed"); });
    s.voiceAudit = await collectVoiceAudit(s, store, decode); expect(s.voiceAudit.status).toBe("incomplete");
    const report = (await readVoiceAudit(store, s))!.report; expect(report.scenes[0]!.checks).toContainEqual(expect.objectContaining({ status: "failed", reason: "Decoder failed" }));
  });
  it("invalidates metadata changes, rejects corrupted reports and preserves prior export evidence", async () => {
    const store = new MemStore(), s = state(); await store.put(voice().key, new Uint8Array([1]));
    s.voiceAudit = await collectVoiceAudit(s, store, async () => measurement()); const fp = voiceInputFingerprint(s);
    s.input.budgetUsd++; expect(voiceInputFingerprint(s)).toBe(fp);
    s.script!.scenes[0]!.narration += " Changed."; expect((await readVoiceAudit(store, s))?.current).toBe(false);
    const record = store.json(s.voiceAudit.reportKey!); record.scenes[0].forms.script = "Tampered"; store.putJsonSync(s.voiceAudit.reportKey!, record);
    await expect(readVoiceAudit(store, s)).rejects.toThrow("changed");
    expect((await qualityView(s, store)).notices.some((n) => n.startsWith("voice: failed"))).toBe(true);
  });
  it("runs under producer ownership without generating media and keeps all production state", async () => {
    const analyzeVoice = vi.fn(async () => measurement()), h = harness({ analyzeVoice }), s = state();
    s.render = { path: "old.mp4", at: "old", exportId: "old-export" }; s.done = { voice: "done", render: "done" };
    await h.store.put(voice().key, new Uint8Array([1])); const id = await h.seed(s);
    const audited = await h.pipeline.auditVoice(id); expect(audited.render).toEqual(s.render); expect(audited.done).toEqual(s.done); expect(audited.voice).toEqual(s.voice);
    expect(h.gateway.requests).toEqual([]); expect(await h.ledger.list()).toEqual([]); expect(analyzeVoice).toHaveBeenCalledTimes(1);
    const release = await acquireLock(h.store, id); try { await expect(h.pipeline.auditVoice(id)).rejects.toThrow(); } finally { await release(); }
  });
  it("keeps full findings outside the twelve-item polling summary and reports storage failure", async () => {
    const store = new MemStore(), s = state(); s.script!.scenes = Array.from({ length: 25 }, (_, i) => ({ ...s.script!.scenes[0]!, id: `s${i}` })); s.voice = {};
    s.voiceAudit = await collectVoiceAudit(s, store, async () => measurement()); expect(s.voiceAudit.findingsCount).toBe(25); expect(s.voiceAudit.findings).toHaveLength(12);
    expect((await readVoiceAudit(store, s))!.report.scenes).toHaveLength(25);
    store.failPut = () => true; expect((await collectVoiceAudit(s, store, async () => measurement())).status).toBe("failed");
    expect((await collectVoiceAudit({ ...s, script: undefined }, store, async () => measurement())).status).toBe("failed");
  });
});

import { createHash, randomUUID } from "node:crypto";
import { getJson, putJson, type AssetStore } from "@ys/storage";
import type { VoiceAudioMeasurement } from "@ys/video/voice-audit";
import type { EpisodeState, SceneVoice } from "./state.ts";

export type VoiceMeasure = (bytes: Uint8Array, mimeType: string) => Promise<VoiceAudioMeasurement>;
export const VOICE_AUDIT_POLICY = { quietRmsDbfs: -50, minWordGapMs: 400, silentShare: .98, edgeToleranceMs: 100, durationToleranceMs: 250, durationToleranceShare: .01 } as const;
export interface VoiceFinding { sceneId: string; kind: "voice_missing" | "voice_silent" | "voice_word_gap" | "voice_text_mismatch" | "caption_mismatch" | "voice_timing_invalid" | "voice_duration_mismatch" | "voice_decode_coverage"; startMs?: number; endMs?: number }
export interface VoiceCheck { name: "source" | "recorded_text" | "caption_text" | "timing" | "stem_audio" | "word_activity" | "semantic"; status: "complete" | "skipped" | "failed"; reason?: string }
export interface VoiceSceneAudit {
  sceneId: string; forms: { script: string; recorded?: string; spoken?: string; captions: string };
  checks: VoiceCheck[]; findings: VoiceFinding[];
  source?: { key: string; sha256: string | null; bytes: number };
  metrics?: { durationMs: number; coveredMs: number; sampleRate: number; channels: number; rmsDbfs: number | null; expectedWordMs: number; quietWordMs?: number };
}
export interface VoiceAuditReport { version: 1; episodeId: string; at: string; fingerprint: string; policy: typeof VOICE_AUDIT_POLICY; scenes: VoiceSceneAudit[] }
export interface VoiceAuditSummary { status: "complete" | "incomplete" | "failed"; at: string; fingerprint: string; reportKey?: string; reportHash?: string; scenes: number; findingsCount: number; findings: VoiceFinding[]; error?: string }
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const bytesHash = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const normalize = (text: string) => text.normalize("NFKC").replace(/\s+/gu, " ").trim();
export const voiceInputFingerprint = (state: EpisodeState): string => hash((state.script?.scenes ?? []).map((s) => [s.id, s.narration, state.voice?.[s.id] ?? null]));
type Span = { start: number; end: number };
function merged(spans: Span[]): Span[] {
  const out: Span[] = [];
  for (const span of spans) {
    const last = out.at(-1);
    if (last && span.start <= last.end + 0.01) last.end = Math.max(last.end, span.end);
    else out.push({ ...span });
  }
  return out;
}
function overlap(a: Span[], b: Span[]): Span[] {
  const out: Span[] = []; let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const x = a[i]!, y = b[j]!, start = Math.max(x.start, y.start), end = Math.min(x.end, y.end);
    if (end > start) out.push({ start, end });
    if (x.end < y.end) i++; else j++;
  }
  return merged(out);
}
const length = (spans: Span[]) => spans.reduce((n, s) => n + s.end - s.start, 0);

/** Kelime boşlukları sessizlik kanıtı değildir; yalnız ölçülmüş kelime aralıklarıyla kesişim değerlendirilir. */
export function auditVoiceEvidence(sceneId: string, script: string, voice?: SceneVoice, audio?: VoiceAudioMeasurement): VoiceSceneAudit {
  const result: VoiceSceneAudit = { sceneId, forms: { script, ...(voice?.text !== undefined ? { recorded: voice.text } : {}), ...(voice ? { spoken: voice.spoken ?? voice.text } : {}), captions: (voice?.words ?? []).map((w) => w.text).join(" ") }, checks: [], findings: [] };
  const check = (name: VoiceCheck["name"], status: VoiceCheck["status"], reason?: string) => result.checks.push({ name, status, ...(reason ? { reason } : {}) });
  const finding = (kind: VoiceFinding["kind"], span?: Span) => result.findings.push({ sceneId, kind, ...(span ? { startMs: span.start, endMs: span.end } : {}) });
  check("semantic", "skipped", "Energy and supplied timings cannot establish spoken words, pronunciation or intelligibility.");
  if (!/[\p{L}\p{N}]/u.test(script)) { check("source", "skipped", "No lexical narration is expected for this scene."); return result; }
  if (!voice) { check("source", "failed", "No scene voice record."); finding("voice_missing"); return result; }
  if (voice.text === undefined) check("recorded_text", "skipped", "Legacy voice has no recorded script identity.");
  else { check("recorded_text", "complete"); if (normalize(voice.text) !== normalize(script)) finding("voice_text_mismatch"); }
  check("caption_text", "complete"); if (normalize(result.forms.captions) !== normalize(script)) finding("caption_mismatch");
  const lexical = voice.words.filter((w) => /[\p{L}\p{N}]/u.test(w.text));
  const valid = lexical.length > 0 && voice.words.length <= 8000 && Number.isFinite(voice.durationMs) && voice.durationMs > 0 && voice.words.every((w, i) => Number.isFinite(w.startMs) && Number.isFinite(w.endMs) && w.startMs >= 0 && w.endMs >= w.startMs && (!/[\p{L}\p{N}]/u.test(w.text) || w.endMs > w.startMs) && w.endMs <= voice.durationMs + 100 && (!i || w.startMs >= voice.words[i - 1]!.startMs && w.endMs >= voice.words[i - 1]!.endMs));
  check("timing", valid ? "complete" : "failed", valid ? undefined : "Missing, unordered, non-finite, out-of-range or excessive word timings.");
  if (!valid) finding("voice_timing_invalid");
  if (!audio) { check("stem_audio", "failed", "No decoded voice samples."); return result; }
  const durationMs = audio.durationMs, coveredMs = Math.min(durationMs, (audio.blocks.at(-1)?.endSec ?? 0) * 1000);
  check("stem_audio", coveredMs >= durationMs - VOICE_AUDIT_POLICY.edgeToleranceMs ? "complete" : "failed", coveredMs >= durationMs - VOICE_AUDIT_POLICY.edgeToleranceMs ? undefined : "Decoded samples do not cover the declared audio duration.");
  if (coveredMs < durationMs - VOICE_AUDIT_POLICY.edgeToleranceMs) finding("voice_decode_coverage", { start: coveredMs, end: durationMs });
  if (Math.abs(durationMs - voice.durationMs) > Math.max(VOICE_AUDIT_POLICY.durationToleranceMs, durationMs * VOICE_AUDIT_POLICY.durationToleranceShare)) finding("voice_duration_mismatch");
  let energy = 0, decodedMs = 0;
  for (const block of audio.blocks) { const ms = (block.endSec - block.startSec) * 1000; decodedMs += ms; energy += (block.rmsDbfs === null ? 0 : 10 ** (block.rmsDbfs / 10)) * ms; }
  const quiet = merged(audio.blocks.filter((b) => b.rmsDbfs === null || b.rmsDbfs < VOICE_AUDIT_POLICY.quietRmsDbfs).map((b) => ({ start: b.startSec * 1000, end: b.endSec * 1000 })));
  const expected = valid ? merged(lexical.map((w) => ({ start: w.startMs, end: w.endMs }))) : [];
  result.metrics = { durationMs, coveredMs, sampleRate: audio.sampleRate, channels: audio.channels, rmsDbfs: energy > 0 ? 10 * Math.log10(energy / decodedMs) : null, expectedWordMs: length(expected) };
  if (coveredMs >= durationMs - VOICE_AUDIT_POLICY.edgeToleranceMs && length(quiet) >= durationMs * VOICE_AUDIT_POLICY.silentShare) finding("voice_silent", { start: 0, end: durationMs });
  if (!valid || voice.estimatedTiming) check("word_activity", "skipped", voice.estimatedTiming ? "Word timings are estimated, not independently measured alignment." : "Valid word timing windows are required.");
  else {
    const absent = overlap(expected, quiet); result.metrics.quietWordMs = length(absent);
    const uncovered = expected.some((s) => s.end > coveredMs + VOICE_AUDIT_POLICY.edgeToleranceMs);
    check("word_activity", uncovered ? "failed" : "complete", uncovered ? "Decoded samples do not cover the supplied word windows." : undefined);
    if (!result.findings.some((f) => f.kind === "voice_silent")) for (const span of absent.filter((s) => s.end - s.start >= VOICE_AUDIT_POLICY.minWordGapMs)) finding("voice_word_gap", span);
    if (uncovered) { finding("voice_decode_coverage", { start: coveredMs, end: Math.max(...expected.map((s) => s.end)) }); }
  }
  return result;
}

export async function collectVoiceAudit(state: EpisodeState, store: AssetStore, measure: VoiceMeasure): Promise<VoiceAuditSummary> {
  const at = new Date().toISOString(), fingerprint = voiceInputFingerprint(state), scenes: VoiceSceneAudit[] = [];
  try {
    if (!state.script?.scenes.length || state.script.scenes.length > 300) throw new Error("Voice audit requires 1–300 script scenes");
    for (const scene of state.script.scenes) {
      const voice = state.voice?.[scene.id]; let audio: VoiceAudioMeasurement | undefined, source: VoiceSceneAudit["source"], reason: string | undefined;
      if (voice && /[\p{L}\p{N}]/u.test(scene.narration)) try {
        const bytes = await store.get(voice.key);
        source = { key: voice.key, sha256: bytes ? bytesHash(bytes) : null, bytes: bytes?.length ?? 0 };
        if (!bytes) throw new Error("Voice source file is missing");
        audio = await measure(bytes, voice.mimeType);
      } catch (error) { reason = (error instanceof Error ? error.message : String(error)).slice(0, 500); }
      const result = auditVoiceEvidence(scene.id, scene.narration, voice, audio);
      if (source) result.source = source;
      if (voice && /[\p{L}\p{N}]/u.test(scene.narration)) result.checks.push({ name: "source", status: reason ? "failed" : "complete", ...(reason ? { reason } : {}) });
      if (source?.sha256 === null) result.findings.push({ sceneId: scene.id, kind: "voice_missing" });
      scenes.push(result);
    }
    const report: VoiceAuditReport = { version: 1, episodeId: state.id, at, fingerprint, policy: VOICE_AUDIT_POLICY, scenes };
    const findings = scenes.flatMap((s) => s.findings), reportKey = `episodes/${state.id}/voice-audits/${randomUUID()}.json`;
    await putJson(store, reportKey, report);
    return { status: scenes.some((s) => s.checks.some((c) => c.status === "failed")) ? "incomplete" : "complete", at, fingerprint, reportKey, reportHash: hash(report), scenes: scenes.length, findingsCount: findings.length, findings: findings.slice(0, 12) };
  } catch (error) { return { status: "failed", at, fingerprint, scenes: scenes.length, findingsCount: 0, findings: [], error: (error instanceof Error ? error.message : String(error)).slice(0, 500) }; }
}

export async function readVoiceAudit(store: AssetStore, state: EpisodeState) {
  const summary = state.voiceAudit, prefix = `episodes/${state.id}/voice-audits/`;
  if (!summary?.reportKey) return undefined;
  if (!summary.reportKey.startsWith(prefix) || !/^[a-z0-9-]+\.json$/.test(summary.reportKey.slice(prefix.length))) throw new Error("Invalid voice audit artifact");
  const report = await getJson<VoiceAuditReport>(store, summary.reportKey);
  if (!report || report.episodeId !== state.id || report.fingerprint !== summary.fingerprint || hash(report) !== summary.reportHash) throw new Error("Voice audit artifact changed or does not match this episode");
  const reasons: string[] = [];
  if (voiceInputFingerprint(state) !== report.fingerprint) reasons.push("Script or voice metadata changed; rerun the voice audit.");
  else for (const scene of report.scenes) if (scene.source) {
    const bytes = await store.get(scene.source.key);
    if ((bytes ? bytesHash(bytes) : null) !== scene.source.sha256) { reasons.push("Voice source bytes changed or disappeared; rerun the voice audit."); break; }
  }
  return { report, current: !reasons.length, reasons };
}

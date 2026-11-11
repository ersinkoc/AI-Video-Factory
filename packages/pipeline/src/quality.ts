import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { getJson, putJson, type AssetStore } from "@ys/storage";
import type { RenderAudit } from "@ys/video/audit";
import type { EpisodeState } from "./state.ts";
import { acquireLock } from "./lock.ts";
import { collectIntentFindings } from "./intent.ts";
import { loadResearch, researchView } from "./research.ts";
import { readVoiceAudit } from "./voice-audit.ts";

export type QualityTarget = "main" | "short" | "plan";
export type QualitySource = "audit" | "style" | "lint" | "draft" | "review" | "intent" | "research" | "voice";
export type QualityStatus = "open" | "reviewed" | "accepted" | "fix-needed";
export interface QualityIssue {
  key: string; target: QualityTarget; source: QualitySource; kind: string; detail: string;
  shotId?: string; seconds?: number; endSec?: number; exportId?: string; evidence: string;
  status: QualityStatus; decidedAt?: string;
}
export interface QualityDecision { exportId: string; status: QualityStatus; at: string }
export interface QualityView { issues: QualityIssue[]; notices: string[]; historicalDecisions: number }
const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const exportIdentity = (output: { path: string; at: string; exportId?: string }) => output.exportId ?? sha([output.path, output.at]);
const decisionKey = (id: string) => `episodes/${id}/quality-decisions.json`;

/** Read only on demand: full reports never enter the normal episode polling payload. */
export async function qualityView(state: EpisodeState, store: AssetStore): Promise<QualityView> {
  const issues: QualityIssue[] = [], notices: string[] = [];
  const seen = new Set<string>();
  const decisions = await getJson<Record<string, QualityDecision>>(store, decisionKey(state.id)) ?? {};
  const current = new Set<string>();
  const add = (issue: Omit<QualityIssue, "key" | "status">) => {
    const key = sha(issue), decision = decisions[key];
    if (seen.has(key)) return;
    seen.add(key);
    const applied = decision && issue.exportId && decision.exportId === issue.exportId;
    issues.push({ ...issue, key, status: applied ? decision.status : "open", ...(applied ? { decidedAt: decision.at } : {}) });
  };
  for (const target of ["main", "short"] as const) {
    const output = target === "main" ? state.render : state.short;
    if (!output) continue;
    const exportId = exportIdentity(output); current.add(exportId);
    const audit = output.audit;
    let measuredFileCurrent = false;
    if (audit?.source) {
      try {
        const file = await stat(output.path);
        measuredFileCurrent = file.size === audit.source.bytes && file.mtime.toISOString() === audit.source.modifiedAt;
      } catch { /* Missing files cannot inherit editorial decisions. */ }
      if (!measuredFileCurrent) notices.push(`${target}: export file changed or missing; rerun measurements`);
    }
    if (!audit) notices.push(`${target}: audit absent`);
    else {
      notices.push(`${target}: audit ${audit.status}`);
      for (const check of audit.checks) if (check.status !== "complete") notices.push(`${target}: ${check.name} ${check.status}${check.reason ? ` — ${check.reason}` : ""}`);
      if (audit.error) notices.push(`${target}: ${audit.error}`);
      if (audit.exportId && audit.exportId !== output.exportId || audit.renderedAt && audit.renderedAt !== output.at) {
        notices.push(`${target}: stale audit; rerun measurements`);
      } else if (audit.reportKey) {
        const prefix = `episodes/${state.id}/render-audits/`;
        try {
          if (!audit.reportKey.startsWith(prefix) || !/^[a-z0-9-]+\.json$/.test(audit.reportKey.slice(prefix.length))) throw new Error("Invalid audit artifact");
          const report = await getJson<RenderAudit & { renderedAt: string; target?: string; exportId?: string }>(store, audit.reportKey);
          if (!report || report.renderedAt !== output.at || (report.target ?? "main") !== target || report.exportId !== output.exportId) throw new Error("Audit artifact does not match export");
          for (const finding of report.findings) add({ target, source: "audit", kind: finding.kind, detail: finding.detail.slice(0, 1000), shotId: finding.id, seconds: finding.startSec, endSec: finding.endSec, ...(measuredFileCurrent ? { exportId } : {}), evidence: audit.reportKey });
        } catch (error) { notices.push(`${target}: ${error instanceof Error ? error.message : String(error)}`); }
      } else if (audit.findingsCount) notices.push(`${target}: findings unavailable without the full report`);
    }
    if (target === "main" && state.render?.styleComparison) {
      const comparison = state.render.styleComparison;
      notices.push(`main: style ${comparison.status}`);
      if (comparison.error) notices.push(`main: ${comparison.error}`);
      let styleCurrent = false;
      const prefix = `episodes/${state.id}/style-comparisons/`;
      try {
        if (comparison.reportKey?.startsWith(prefix) && /^[a-z0-9-]+\.json$/.test(comparison.reportKey.slice(prefix.length))) {
          const report = await getJson<{ renderedAt: string; source: { size: number; mtimeMs: number } }>(store, comparison.reportKey);
          const file = await stat(output.path);
          styleCurrent = Boolean(report && report.renderedAt === output.at && report.source.size === file.size && report.source.mtimeMs === file.mtimeMs);
        }
      } catch { /* A stale or missing comparison remains visible without an approval control. */ }
      if (!styleCurrent) notices.push("main: style evidence changed or missing; compare again");
      for (const finding of comparison.findings) add({ target, source: "style", kind: "reference_palette", detail: finding.flags.join(", "), shotId: finding.shotId, seconds: finding.seconds, ...(styleCurrent ? { exportId } : {}), evidence: comparison.reportKey ?? comparison.at });
    }
  }
  // These are critiques of authoring previews, not proof about the encoded export.
  if (state.voiceAudit) {
    notices.push(`voice: ${state.voiceAudit.status}${state.voiceAudit.error ? ` — ${state.voiceAudit.error}` : ""}`);
    try {
      const voice = await readVoiceAudit(store, state);
      if (!voice) notices.push("voice: report absent");
      else {
        notices.push(...voice.reasons.map((reason) => `voice: stale — ${reason}`));
        for (const scene of voice.report.scenes) {
          for (const check of scene.checks) if (check.status !== "complete") notices.push(`voice ${scene.sceneId}: ${check.name} ${check.status}${check.reason ? ` — ${check.reason}` : ""}`);
          if (voice.current) for (const finding of scene.findings) add({ target: "plan", source: "voice", kind: finding.kind, detail: `${scene.sceneId}: ${finding.kind}${finding.startMs !== undefined ? ` (${finding.startMs}–${finding.endMs} ms in the voice stem)` : ""}`, shotId: scene.sceneId, evidence: state.voiceAudit.reportKey! });
        }
      }
    } catch (error) { notices.push(`voice: failed — ${error instanceof Error ? error.message : String(error)}`); }
  }
  for (const source of ["draft", "review"] as const) {
    const review = source === "draft" ? state.draftReview : state.review;
    if (!review) continue;
    for (const [shotId, shot] of Object.entries(review.shots)) for (const finding of shot.issues) add({ target: "plan", source, kind: finding.type, detail: finding.detail.slice(0, 1000), shotId, evidence: review.at });
  }
  for (const finding of state.lint?.issues ?? []) add({ target: "plan", source: "lint", kind: finding.code, detail: finding.detail.slice(0, 1000), shotId: finding.shotId, evidence: sha(state.lint) });
  for (const finding of collectIntentFindings(state)) add({ target: "plan", source: "intent", kind: finding.code, detail: finding.detail, shotId: finding.shotId, evidence: sha(state.shots?.find((s) => s.id === finding.shotId)) });
  try {
    const research = researchView(await loadResearch(store, state.id), state);
    for (const claim of research.claims.filter((c) => !["supported", "excluded"].includes(c.status))) add({ target: "plan", source: "research", kind: `claim_${claim.status}`, detail: claim.statement, shotId: claim.sceneId, evidence: claim.fingerprint });
  } catch (error) { notices.push(`research: failed — ${error instanceof Error ? error.message : String(error)}`); }
  return { issues, notices, historicalDecisions: Object.values(decisions).filter((d) => !current.has(d.exportId)).length };
}

/** Compare render and issue identities while holding the same lock as producers. */
export async function decideQuality(opts: {
  id: string; store: AssetStore; load: () => Promise<EpisodeState>;
  issueKey: string; exportId: string; status: QualityStatus;
}): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(opts.issueKey) || !["open", "reviewed", "accepted", "fix-needed"].includes(opts.status)) throw new Error("Invalid quality decision");
  const release = await acquireLock(opts.store, opts.id);
  try {
    const state = await opts.load();
    const issue = (await qualityView(state, opts.store)).issues.find((i) => i.key === opts.issueKey && i.exportId === opts.exportId);
    if (!issue || issue.target === "plan") throw new Error("Evidence changed; reload the quality issues");
    const output = issue.target === "short" ? state.short! : state.render!;
    if (issue.source === "audit") {
      const source = output.audit?.source;
      if (!source) throw new Error("Rerun the audit before recording a decision");
      const file = await stat(output.path);
      if (file.size !== source.bytes || file.mtime.toISOString() !== source.modifiedAt) throw new Error("Export file changed; rerun the audit");
    } else {
      const prefix = `episodes/${opts.id}/style-comparisons/`;
      /* v8 ignore next -- qualityView yalnız doğrulanmış stil raporu yollarına exportId ekler */
      if (!issue.evidence.startsWith(prefix) || !/^[a-z0-9-]+\.json$/.test(issue.evidence.slice(prefix.length))) throw new Error("Rerun the style comparison before recording a decision");
      const report = await getJson<{ renderedAt: string; source: { size: number; mtimeMs: number } }>(opts.store, issue.evidence);
      const file = await stat(output.path);
      if (!report || report.renderedAt !== output.at || report.source.size !== file.size || report.source.mtimeMs !== file.mtimeMs) throw new Error("Export file changed; rerun the style comparison");
    }
    const decisions = await getJson<Record<string, QualityDecision>>(opts.store, decisionKey(opts.id)) ?? {};
    if (Object.keys(decisions).length >= 5000 && !Object.hasOwn(decisions, issue.key)) throw new Error("Quality decision history limit reached");
    decisions[issue.key] = { exportId: opts.exportId, status: opts.status, at: new Date().toISOString() };
    await putJson(opts.store, decisionKey(opts.id), decisions);
  } finally { await release(); }
}

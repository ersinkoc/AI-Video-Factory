import { createHash } from "node:crypto";
import sharp from "sharp";
import { AgentError, models, styleAnalyst, type AgentDeps } from "@ys/agents";
import { LocalizedError, modelFor, msg, StyleRecipe, usd, type StyleRecipe as Recipe } from "@ys/core";
import { getJson, putJson, type AssetStore } from "@ys/storage";
import type { CostLedger } from "@ys/media-gateway";

export const STYLE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export { measureStyleReference } from "./image-profile.ts";
export interface StyleAnalysis { recipe: Recipe; referenceKey: string; costUsd: number; cached: boolean }
const running = new WeakMap<AssetStore, Map<string, Promise<StyleAnalysis>>>();

/** Girdi türü görüntünün kendisiyle doğrulanır; EXIF atılır, boyut ve çözülmüş piksel sayısı sınırlıdır. */
export async function normalizeStyleReference(mimeType: unknown, base64: unknown): Promise<Uint8Array> {
  const invalid = () => new LocalizedError(msg("api.style.reference"));
  if (typeof base64 !== "string" || base64.length > Math.ceil(STYLE_IMAGE_MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || !["image/png", "image/jpeg", "image/webp"].includes(String(mimeType))) throw invalid();
  const data = Buffer.from(base64, "base64");
  if (!data.length || data.length > STYLE_IMAGE_MAX_BYTES || data.toString("base64") !== base64) throw invalid();
  try {
    const image = sharp(data, { limitInputPixels: 16_000_000, animated: false });
    const metadata = await image.metadata();
    if ("image/" + metadata.format !== mimeType || (metadata.pages ?? 1) > 1) throw invalid();
    return new Uint8Array(await image.rotate().resize(1536, 1536, { fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toBuffer());
  } catch { throw invalid(); }
}

/** Başarılı analiz tekrarında model çağrılmaz; aynı süreçte çakışan istekler tek çağrıyı paylaşır. */
export async function analyzeStyleReference(store: AssetStore, ledger: CostLedger, bytes: Uint8Array, deps: AgentDeps = {}): Promise<StyleAnalysis> {
  const hash = createHash("sha256").update(bytes).digest("hex");
  const model = modelFor("style-analyst", models().fast, deps.models);
  const key = "library/style-drafts/" + createHash("sha256").update(JSON.stringify(["style-analyst-v2", hash, model])).digest("hex") + ".json";
  let pending = running.get(store);
  if (!pending) { pending = new Map(); running.set(store, pending); }
  const active = pending.get(key);
  if (active) return active;
  const task = (async (): Promise<StyleAnalysis> => {
    const cached = await getJson<StyleAnalysis>(store, key);
    if (cached && StyleRecipe.safeParse(cached.recipe).success && cached.referenceKey === "library/style-references/" + hash + ".jpg") return { ...cached, cached: true };
    const referenceKey = "library/style-references/" + hash + ".jpg";
    await store.put(referenceKey, bytes, "image/jpeg");
    let result;
    try { result = await styleAnalyst({ data: bytes, mimeType: "image/jpeg" }, deps); }
    catch (e) {
      await ledger.record({ at: new Date().toISOString(), stage: "style-reference", refId: "style-analyst", providerId: "claude:" + model, capability: "llm", estimateMicros: usd(e instanceof AgentError ? e.costUsd : 0), cacheHit: false, requestHash: key, error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
    await ledger.record({ at: new Date().toISOString(), stage: "style-reference", refId: "style-analyst", providerId: "claude:" + result.model, capability: "llm", estimateMicros: usd(result.costUsd), cacheHit: false, requestHash: key, durationMs: result.durationMs });
    const out: StyleAnalysis = { recipe: result.data, referenceKey, costUsd: result.costUsd, cached: false };
    await putJson(store, key, out);
    return out;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

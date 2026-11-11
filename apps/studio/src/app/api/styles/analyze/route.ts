import { analyzeStyleReference, measureStyleReference, normalizeStyleReference } from "@ys/pipeline/style-authoring";
import { loadModelSettings } from "@ys/pipeline/light";
import { errorResponse } from "../../../../lib/api";
import { readStyleJson } from "../../../../lib/style-request";
import { ledger, store } from "../../../../lib/server";

export const maxDuration = 600;
export async function POST(req: Request) {
  try {
    const body = await readStyleJson(req, 6 * 1024 * 1024) as { mimeType?: unknown; base64?: unknown } | null;
    const bytes = await normalizeStyleReference(body?.mimeType, body?.base64);
    const models = await loadModelSettings(store());
    const measured = await measureStyleReference(store(), bytes);
    return Response.json({ ...await analyzeStyleReference(store(), ledger(), bytes, { models }), profile: measured.profile }, { headers: { "cache-control": "no-store" } });
  } catch (e) { return errorResponse(req, e); }
}

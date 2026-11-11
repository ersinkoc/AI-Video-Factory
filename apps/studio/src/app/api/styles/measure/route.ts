import { measureStyleReference, normalizeStyleReference } from "@ys/pipeline/style-authoring";
import { errorResponse } from "../../../../lib/api";
import { readStyleJson } from "../../../../lib/style-request";
import { store } from "../../../../lib/server";

export async function POST(req: Request) {
  try {
    const body = await readStyleJson(req, 6 * 1024 * 1024) as { mimeType?: unknown; base64?: unknown } | null;
    const bytes = await normalizeStyleReference(body?.mimeType, body?.base64);
    return Response.json(await measureStyleReference(store(), bytes), { headers: { "cache-control": "no-store" } });
  } catch (e) { return errorResponse(req, e); }
}

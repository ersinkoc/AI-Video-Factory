import { StyleRecipe, STYLE_REFERENCE_KEY } from "@ys/core";
import { msg } from "@ys/core/messages";
import { listCustomStyles, saveCustomStyle } from "@ys/pipeline/light";
import { apiError, errorResponse } from "../../../../lib/api";
import { readStyleJson } from "../../../../lib/style-request";
import { store } from "../../../../lib/server";

export async function GET() {
  return Response.json(await listCustomStyles(store()), { headers: { "cache-control": "no-store" } });
}
export async function POST(req: Request) {
  try {
    const body = await readStyleJson(req) as { recipe?: unknown; referenceKey?: unknown } | null;
    const parsed = StyleRecipe.safeParse(body?.recipe);
    if (!parsed.success || (body?.referenceKey !== undefined && (typeof body.referenceKey !== "string" || !STYLE_REFERENCE_KEY.test(body.referenceKey)))) return apiError(req, msg("api.style.recipe"));
    return Response.json(await saveCustomStyle(store(), parsed.data, body?.referenceKey as string | undefined));
  } catch (e) { return errorResponse(req, e); }
}

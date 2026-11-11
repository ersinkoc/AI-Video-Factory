import { importArchiveImage } from "@ys/pipeline/archive";
import { store } from "../../../../../lib/server";
import { errorResponse } from "../../../../../lib/api";
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const image = await importArchiveImage(id, { store: store() });
    const data = await store().get(image.key);
    if (!data) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(data), { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff" } });
  } catch (error) { return errorResponse(req, error); }
}

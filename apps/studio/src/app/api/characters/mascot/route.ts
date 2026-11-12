import { setMascot } from "@ys/pipeline/light";
import { errorResponse, readJson } from "../../../../lib/api";
import { store } from "../../../../lib/server";

/** Karakteri serinin maskotu yapar ya da çıkarır: serinin her bölümünün kadrosuna kendiliğinden girer. */
export async function POST(req: Request) {
  try {
    const b = await readJson<{ id?: unknown; series?: unknown; on?: unknown }>(req);
    await setMascot(store(), String(b.id ?? ""), String(b.series ?? ""), b.on !== false);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(req, e);
  }
}

import { msg } from "@ys/core";
import { DEV_TOOLS, DEV_TOOLS_JOB, devToolIds, devToolStatus } from "@ys/pipeline/light";
import { apiError, errorResponse, readJson } from "../../../lib/api";
import { getJob, startJob } from "../../../lib/server";

/** Kodlama oturumları için 3D araçlarının kurulum durumu ve kurulum işinin durumu. */
export async function GET() {
  return Response.json({ tools: await devToolStatus(), job: getJob(DEV_TOOLS_JOB) ?? null });
}

/**
 * Seçilen araçları (boşsa eksiklerin hepsini) `ys skills install` işiyle kurar. Gövdede yalnız katalog kimlikleri olur;
 * komut ve argümanlar katalogdan gelir, istekten hiçbir metin komuta geçmez.
 */
export async function POST(req: Request) {
  let body: { ids?: unknown };
  try {
    body = await readJson<{ ids?: unknown }>(req);
  } catch (e) {
    return errorResponse(req, e);
  }
  const raw = body.ids === undefined ? [] : body.ids;
  const ids = Array.isArray(raw) ? devToolIds(raw) : undefined;
  if (!ids) return apiError(req, msg("devtools.unknown", { id: String(raw), ids: DEV_TOOLS.map((t) => t.id).join(", ") }));
  try {
    return Response.json({ job: startJob(DEV_TOOLS_JOB, "job.devTools", ["skills", "install", ...ids]) });
  } catch (e) {
    // Bir kurulum zaten sürüyor.
    return errorResponse(req, e, 409);
  }
}

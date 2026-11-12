import { loadModelSettings, saveModelSettings } from "@ys/pipeline/light";
import { errorResponse, readJson } from "../../../../lib/api";
import { store } from "../../../../lib/server";

/** Ajan başına model seçimi (Modeller sayfası). Değişiklik bir sonraki çalıştırmada geçerli olur. */
export async function GET() {
  return Response.json(await loadModelSettings(store()));
}

export async function PUT(req: Request) {
  try {
    return Response.json(await saveModelSettings(store(), await readJson(req)));
  } catch (e) {
    return errorResponse(req, e);
  }
}

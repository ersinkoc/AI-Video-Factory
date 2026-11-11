import { searchArchives } from "@ys/pipeline/archive";
import { store } from "../../../lib/server";
import { errorResponse } from "../../../lib/api";

export async function GET(req: Request) {
  try { return Response.json(await searchArchives(new URL(req.url).searchParams.get("q") ?? "", { store: store() }), { headers: { "cache-control": "no-store" } }); }
  catch (error) { return errorResponse(req, error); }
}

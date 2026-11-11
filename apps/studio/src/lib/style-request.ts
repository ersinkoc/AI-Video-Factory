import { LocalizedError, msg } from "@ys/core";

/** JSON gövdesini sınırlı okur; büyük referans daha ayrıştırılmadan reddedilir. */
export async function readStyleJson(req: Request, limit = 64 * 1024): Promise<unknown> {
  const invalid = () => new LocalizedError(msg("api.style.reference"));
  const reader = req.body?.getReader();
  if (!reader) throw invalid();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > limit) { await reader.cancel(); throw invalid(); }
    chunks.push(part.value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw invalid(); }
}

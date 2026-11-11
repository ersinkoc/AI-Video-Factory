import { createHash } from "node:crypto";
import sharp from "sharp";
import { ArchiveCandidate, type ArchiveImage, type ArchiveSearch } from "@ys/core";
import { getJson, putJson, type AssetStore } from "@ys/storage";

type Deps = { store: AssetStore; fetch?: typeof fetch };
const hash = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
const itemKey = (id: string) => `library/archive/items/${id}.json`;
const clean = (v: unknown, limit = 400) => typeof v === "string" ? v.replace(/<[^>]*>/g, "").replace(/[\r\n\t]+/g, " ").trim().slice(0, limit) : "";
const IMAGE_HOSTS = { aic: ["www.artic.edu"], cleveland: ["openaccess-cdn.clevelandart.org"], nasa: ["images-assets.nasa.gov"] };
function imageAllowed(url: string, provider: ArchiveCandidate["provider"]): boolean {
  try { const u = new URL(url); return u.protocol === "https:" && !u.username && !u.password && !u.port && IMAGE_HOSTS[provider].includes(u.hostname); } catch { return false; }
}
async function bytes(res: Response, limit: number): Promise<Uint8Array> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (Number(res.headers.get("content-length")) > limit) { await res.body?.cancel(); throw new Error("Archive response exceeds size limit."); }
  if (!res.body) throw new Error("Empty archive response.");
  const reader = res.body.getReader(); const parts: Uint8Array[] = []; let total = 0;
  try {
    for (;;) { const next = await reader.read(); if (next.done) break; total += next.value.length; if (total > limit) throw new Error("Archive response exceeds size limit."); parts.push(next.value); }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; } finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}
const json = async <T,>(url: string, fetchFn: typeof fetch): Promise<T> => JSON.parse(new TextDecoder().decode(await bytes(await fetchFn(url, { signal: AbortSignal.timeout(20_000), redirect: "error", headers: { accept: "application/json" } }), 4 * 1024 * 1024))) as T;
function candidate(provider: ArchiveCandidate["provider"], sourceId: string, fields: Omit<ArchiveCandidate, "id" | "provider" | "sourceId">): ArchiveCandidate[] {
  if (!imageAllowed(fields.imageUrl, provider)) return [];
  const parsed = ArchiveCandidate.safeParse({ ...fields, provider, sourceId, id: `${provider}-${hash(JSON.stringify({ sourceId, ...fields })).slice(0, 24)}` });
  return parsed.success ? [parsed.data] : [];
}
async function searchAic(query: string, fetchFn: typeof fetch): Promise<ArchiveCandidate[]> {
  const params = new URLSearchParams({ q: query, limit: "4", fields: "id,title,image_id,artist_display,date_display,is_public_domain", "query[term][is_public_domain]": "true" });
  const data = await json<{ data?: { id: number; title?: string; image_id?: string; artist_display?: string; date_display?: string; is_public_domain?: boolean }[] }>(`https://api.artic.edu/api/v1/artworks/search?${params}`, fetchFn);
  if (!Array.isArray(data.data)) throw new Error("Invalid Chicago archive response.");
  return data.data.slice(0, 4).flatMap((item) => item.is_public_domain === true && item.image_id && /^[a-f0-9-]+$/i.test(item.image_id) && Number.isSafeInteger(item.id) ? candidate("aic", String(item.id), {
    title: clean(item.title), creator: clean(item.artist_display), date: clean(item.date_display, 120),
    sourceUrl: `https://www.artic.edu/artworks/${item.id}`, imageUrl: `https://www.artic.edu/iiif/2/${item.image_id}/full/843,/0/default.jpg`,
  }) : []);
}
async function searchCleveland(query: string, fetchFn: typeof fetch): Promise<ArchiveCandidate[]> {
  const params = new URLSearchParams({ q: query, limit: "4", has_image: "1", cc0: "1" });
  const data = await json<{ data?: { id: number; accession_number?: string; title?: string; creation_date?: string; share_license_status?: string; creators?: { description?: string }[]; images?: { web?: { url?: string } } }[] }>(`https://openaccess-api.clevelandart.org/api/artworks/?${params}`, fetchFn);
  if (!Array.isArray(data.data)) throw new Error("Invalid Cleveland archive response.");
  return data.data.slice(0, 4).flatMap((item) => item.images?.web?.url && item.share_license_status === "CC0" && Number.isSafeInteger(item.id) ? candidate("cleveland", String(item.id), {
    title: clean(item.title), creator: clean(item.creators?.map((c) => c.description).filter(Boolean).join("; ")), date: clean(item.creation_date, 120),
    sourceUrl: `https://www.clevelandart.org/art/${encodeURIComponent(item.accession_number ?? String(item.id))}`, imageUrl: item.images.web.url,
  }) : []);
}
async function searchNasa(query: string, fetchFn: typeof fetch): Promise<ArchiveCandidate[]> {
  const params = new URLSearchParams({ q: query, media_type: "image", page_size: "4" });
  const data = await json<{ collection?: { items?: { data?: { nasa_id?: string; title?: string; photographer?: string; secondary_creator?: string; center?: string; date_created?: string }[]; links?: { href?: string; render?: string }[] }[] } }>(`https://images-api.nasa.gov/search?${params}`, fetchFn);
  if (!Array.isArray(data.collection?.items)) throw new Error("Invalid NASA archive response.");
  return data.collection.items.slice(0, 4).flatMap((item) => {
    const info = item.data?.[0]; const imageUrl = item.links?.find((l) => l.render === "image")?.href;
    return info?.nasa_id && imageUrl ? candidate("nasa", info.nasa_id, { title: clean(info.title), creator: clean(info.photographer || info.secondary_creator || info.center || "NASA"), date: clean(info.date_created, 120), sourceUrl: `https://images.nasa.gov/details/${encodeURIComponent(info.nasa_id)}`, imageUrl }) : [];
  });
}

/** Search only official collection APIs; successful searches are cached, provider failures remain visible and retryable. */
export async function searchArchives(query: string, deps: Deps): Promise<ArchiveSearch> {
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < 2 || q.length > 180) throw new Error("Archive query must contain 2–180 characters.");
  const key = `library/archive/search/v1-${hash(q.toLowerCase()).slice(0, 24)}.json`;
  const cached = await getJson<ArchiveSearch>(deps.store, key);
  if (cached && Date.now() - Date.parse(cached.at) < 24 * 60 * 60 * 1000) return cached;
  const providers = [["aic", searchAic], ["cleveland", searchCleveland], ["nasa", searchNasa]] as const;
  const found = await Promise.allSettled(providers.map(([, search]) => search(q, deps.fetch ?? fetch)));
  const result: ArchiveSearch = { query: q, items: [], errors: [], at: new Date().toISOString() };
  for (let i = 0; i < found.length; i++) {
    const value = found[i]!;
    if (value.status === "fulfilled") result.items.push(...value.value.slice(0, 4));
    else result.errors.push({ provider: providers[i]![0], message: String(value.reason instanceof Error ? value.reason.message : value.reason).slice(0, 300) });
  }
  for (const item of result.items) await putJson(deps.store, itemKey(item.id), item);
  if (!result.errors.length) await putJson(deps.store, key, result);
  return result;
}

/** Download a previously discovered item, never a URL supplied by the browser. */
export async function importArchiveImage(id: string, deps: Deps): Promise<ArchiveImage> {
  if (!/^(aic|cleveland|nasa)-[a-f0-9]{24}$/.test(id)) throw new Error("Invalid archive item.");
  const source = ArchiveCandidate.parse(await getJson(deps.store, itemKey(id)));
  if (!imageAllowed(source.imageUrl, source.provider)) throw new Error("Unsupported archive image host.");
  const cached = await getJson<ArchiveImage>(deps.store, `library/archive/imports/${id}.json`);
  if (cached && await deps.store.get(cached.key)) return cached;
  const raw = await bytes(await (deps.fetch ?? fetch)(source.imageUrl, { signal: AbortSignal.timeout(20_000), redirect: "error", headers: { "user-agent": "AI-Video-Factory/1.0", referer: source.sourceUrl } }), 16 * 1024 * 1024);
  const output = await sharp(raw, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
  const key = `assets/archive/${hash(output.data)}.jpg`;
  await deps.store.put(key, output.data, "image/jpeg");
  const image: ArchiveImage = { key, mimeType: "image/jpeg", source, width: output.info.width, height: output.info.height, originalSha256: hash(raw), downloadedAt: new Date().toISOString() };
  await putJson(deps.store, `library/archive/imports/${id}.json`, image);
  return image;
}

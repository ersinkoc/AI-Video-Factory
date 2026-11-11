import { createHash } from "node:crypto";
import { CUSTOM_STYLE_ID, LocalizedError, msg, SavedStyle, StyleRecipe, type StyleRecipe as Recipe } from "@ys/core";
import { getJson, putJson, type AssetStore } from "@ys/storage";
import { measureStyleReference } from "./image-profile.ts";

const PREFIX = "library/custom-styles/";
/** Anahtar kullanıcı yolundan kurulmaz; kayıtlar içerik kimlikli ve değişmezdir. */
export async function loadCustomStyle(store: AssetStore, id: string): Promise<SavedStyle | undefined> {
  if (!CUSTOM_STYLE_ID.test(id)) return undefined;
  const parsed = SavedStyle.safeParse(await getJson(store, PREFIX + id + ".json"));
  return parsed.success && parsed.data.id === id ? parsed.data : undefined;
}
export async function listCustomStyles(store: AssetStore): Promise<SavedStyle[]> {
  const keys = (await store.list(PREFIX)).filter((k) => k.endsWith(".json"));
  const out: SavedStyle[] = [];
  for (const key of keys) {
    const style = await loadCustomStyle(store, key.slice(PREFIX.length, -5));
    if (style) out.push(style);
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.recipe.name.localeCompare(b.recipe.name));
}
export async function saveCustomStyle(store: AssetStore, raw: Recipe, referenceKey?: string): Promise<SavedStyle> {
  const recipe = StyleRecipe.parse(raw);
  if (referenceKey && (!/^library\/style-references\/[a-f0-9]{64}\.jpg$/.test(referenceKey) || !await store.get(referenceKey))) throw new LocalizedError(msg("api.style.reference"));
  const id = createHash("sha256").update(JSON.stringify([recipe, referenceKey ?? null])).digest("hex").slice(0, 32);
  const existing = await loadCustomStyle(store, id);
  if (existing) return existing;
  const referenceProfile = referenceKey ? (await measureStyleReference(store, (await store.get(referenceKey))!)).profile : undefined;
  const saved = SavedStyle.parse({ id, createdAt: new Date().toISOString(), recipe, referenceKey, referenceProfile });
  await putJson(store, PREFIX + id + ".json", saved);
  return saved;
}

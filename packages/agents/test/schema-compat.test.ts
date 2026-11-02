import { readdirSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { toOutputSchema } from "../src/runner.ts";

/**
 * Ajan çıktı şemaları API'ye araç şeması olarak gider ve JSON Schema 2020-12'ye uymak zorunda: draft-07'nin dizi biçimli
 * `items`'ı (z.tuple) 2020-12'de geçersiz, yönetmen çağrısı 400 ile düşüyordu (Manim grafik noktaları, 2 Kas).
 */
function invalid(node: unknown, path = "$"): string[] {
  if (!node || typeof node !== "object") return [];
  const n = node as Record<string, unknown>;
  const own = [...(Array.isArray(n.items) ? [`${path}.items`] : []), ...("additionalItems" in n ? [`${path}.additionalItems`] : [])];
  return [...own, ...Object.entries(n).flatMap(([k, v]) => invalid(v, `${path}.${k}`))];
}

const dir = join(import.meta.dirname, "..", "src");
const modules = await Promise.all(readdirSync(dir).filter((f) => f.endsWith(".ts")).map(async (f) => [f, await import(`../src/${f}`)] as const));
const schemas = modules.flatMap(([file, mod]) => Object.entries(mod as Record<string, unknown>).filter(([, v]) => v instanceof z.ZodType).map(([name, v]) => [`${file}:${name}`, v as z.ZodType] as const));

describe("ajan şemaları JSON Schema 2020-12 ile uyumlu", () => {
  it("dışa aktarılan şemalar bulunur (yönetmen dahil)", () => {
    expect(schemas.map(([name]) => name)).toContain("vector.ts:VectorSceneOut");
  });

  it.each(schemas)("%s: dizi biçimli items / additionalItems yok", (_name, schema) => {
    expect(invalid(toOutputSchema(schema))).toEqual([]);
  });

  it("denetleyici tuple'ı yakalar", () => {
    expect(invalid(toOutputSchema(z.object({ p: z.array(z.tuple([z.number(), z.number()])) })))).not.toEqual([]);
  });
});

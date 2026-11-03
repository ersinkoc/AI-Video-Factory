import { z } from "zod";

/**
 * Gerçek dünyaya dayanan vektör varlıklar: harita ve bayrak. Claude bunları çizmez (uydurma sınır ve yanlış bayrak
 * çıkıyordu, 30 Eki geri bildirimi); yalnız bu kısa tarifi yazar, kod Natural Earth sınırları ve flag-icons
 * bayraklarından üretir.
 */

export const GeoPoint = z.object({
  lon: z.number().min(-180).max(180),
  lat: z.number().min(-90).max(90),
});
export type GeoPoint = z.infer<typeof GeoPoint>;

export const MapSpec = z.object({
  projection: z.enum(["flat", "globe"]).default("flat").describe("flat: regional/world map; globe: the planet seen from space"),
  year: z
    .number()
    .int()
    .min(-3400)
    .max(2024)
    .optional()
    .describe(
      "The year the map shows (negative = BCE). Set it for every historical subject: the political borders are then that year's, from a historical atlas dataset, and today's countries are not drawn",
    ),
  focus: z
    .array(z.string())
    .default([])
    .describe("ISO 3166-1 alpha-3 codes the view fits to (e.g. TUR, GRC; only their area, also with year); empty = whole world (or fit to markers/routes)"),
  highlight: z
    .array(
      z.object({
        countries: z.array(z.string()).default([]).describe("Today's countries, ISO alpha-3 codes (maps without year)"),
        polities: z
          .array(z.string())
          .default([])
          .describe('Historical states that existed in "year", by their English Wikipedia title (e.g. "Ottoman Empire", "Byzantine Empire", "Republic of Venice")'),
        tone: z.enum(["accent", "warm", "cool", "muted"]).default("accent"),
        label: z
          .string()
          .optional()
          .describe("One label naming the highlighted state(s), in the episode language; else each country gets its name (historical states get none)"),
      }),
    )
    .max(6)
    .default([]),
  markers: z
    .array(GeoPoint.extend({ label: z.string().describe("City or place name in the episode language") }))
    .max(10)
    .default([]),
  routes: z
    .array(z.object({ points: z.array(GeoPoint).min(2).max(12), label: z.string().optional() }))
    .max(4)
    .default([])
    .describe("Journeys/campaigns/trade routes; drawn progressively during the shot"),
});
export type MapSpec = z.infer<typeof MapSpec>;

export const FlagSpec = z.object({
  code: z.string().describe('ISO 3166-1 alpha-2 code (tr, us, gb, fr…) or a historical flag id ("ottoman")'),
  pole: z.boolean().default(false).describe("true: flag on a standing pole (grounded); false: plain flag (held, on a wall or desk)"),
});
export type FlagSpec = z.infer<typeof FlagSpec>;

/** Haritanın üstüne kodla yazılan etiket (SVG içine metin gömülmez; temizleyici metni siler). */
export const MapLabel = z.object({
  x: z.number(),
  y: z.number(),
  text: z.string(),
  kind: z.enum(["country", "city", "route"]),
  /** Kaçıncı sırada belirir (rotalar ve şehirler sırayla). */
  order: z.number().int().nonnegative().default(0),
});
export type MapLabel = z.infer<typeof MapLabel>;

import { z } from "zod";

/**
 * 3D figür tarifi (kullanıcı isteği, 3 Kas: gerçekçi olmayan ama özel 3D karakterler). Karakter SVG yerine koddan
 * kurulan yumuşak ışıklı 3D bir figürdür; tarif yalnız parametrelerdir (model geometri yazmaz). Kukla iskeletinin
 * (RIG) eklemleri ve pozları aynen kullanılır: hareket fiziği, jestler, ağız ve göz kırpma değişmeden çalışır.
 */
const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const FigureSpec = z.object({
  skin: Hex,
  hair: z.object({
    style: z.enum(["bald", "buzz", "short", "side-part", "curly", "long", "bun", "ponytail"]),
    color: Hex,
  }),
  beard: z.enum(["none", "stubble", "short", "full"]).default("none"),
  glasses: z.boolean().default(false),
  top: z.object({
    style: z.enum(["tshirt", "shirt", "sweater", "hoodie", "vest", "jacket", "dress"]),
    color: Hex,
    /** Yelek/ceketin altındaki gömlek, kapüşonun iç rengi. */
    inner: Hex.optional(),
  }),
  bottom: z.object({ style: z.enum(["trousers", "shorts", "skirt"]), color: Hex }),
  shoes: Hex,
  build: z.enum(["slim", "average", "broad"]).default("average"),
  /** Yüzey: mat (yumuşak 3D), kil (çok mat), parlak (oyuncak). */
  finish: z.enum(["matte", "clay", "glossy"]).default("matte"),
});
export type FigureSpec = z.infer<typeof FigureSpec>;

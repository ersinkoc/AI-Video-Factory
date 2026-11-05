import { SET_PIECES } from "@ys/core";
import { z } from "zod";
import { models, runStructured, type AgentDeps, type AgentResult } from "./runner.ts";

/**
 * Set düzenleyici (5 Kas, kullanıcının seçimi: "oda başına set eşyası"; en yeni incelemelerde çekimlerin %37'sinde
 * "boş" notu: çıplak duvar, boş zemin, tek kişi ve bir iki nesne). Arka planlar bilerek boş oda kabuğu; yönetmen sahne
 * başına yalnız hikâyenin nesnelerini koyuyor. Ajan her mekân için o yerde ve o dönemde gerçekten duran, yere basan en
 * çok SET_PIECES eşya seçer (kitaplık, dolap, uzun saksı, askılık…); her biri referansla bir kez çizilir, kod onları
 * o mekânın geniş ve orta çekimlerinde eylemin arkasına yerleştirir. Tek çağrı, bütün mekânlar birlikte.
 */

export const SetDressOut = z.object({
  locations: z
    .array(
      z.object({
        id: z.string().describe("Place id exactly as listed"),
        pieces: z
          .array(
            z.object({
              name: z.string().max(40).describe("Short English name of the piece, e.g. 'oak bookcase', 'steel filing cabinet'"),
              description: z
                .string()
                .max(300)
                .describe("English. The one object alone, front view: what it is, era-appropriate materials, shape and colours; generic, no brand, no text"),
              reference: z
                .string()
                .max(60)
                .describe("Short English Wikimedia Commons search query for a photo of this kind of object from that era and region, e.g. '1970s steel filing cabinet', 'Ottoman wooden chest', 'Victorian bookcase'"),
            }),
          )
          .max(SET_PIECES),
      }),
    )
    .describe("Every listed place, with up to two pieces each; an empty list where nothing would stand"),
});
export type SetDressOut = z.infer<typeof SetDressOut>;

export interface SetDressInput {
  /** Bölümün konusu ve başlığı (dönem ve bölge buradan anlaşılır). */
  topic: string;
  /** Döşenecek mekânlar: kimlik, ad, görünüş ve yönetmenin orada kullandığı nesneler (tekrarlanmasın). */
  places: { id: string; name: string; description: string; props: string[] }[];
}

export function setDresser(input: SetDressInput, deps?: AgentDeps): Promise<AgentResult<SetDressOut>> {
  return runStructured(
    {
      name: "set-dresser",
      model: models().fast,
      effort: "low",
      schema: SetDressOut,
      system: `You are the set dresser of an animated explainer video. The backgrounds are empty room shells and the director only places the objects the story needs, so wide shots show bare walls and empty floors. For every place listed, choose up to ${SET_PIECES} pieces of furniture or fixtures that really stand on the floor of that place at that time and in that region, so the room looks lived in. Code places them at the back of the room, behind the action, in the wide and medium shots of that place.
Rules:
- Each piece stands on the floor by itself, is drawn alone and is at least about 1 m tall: a bookcase, a filing cabinet, a cupboard, a tall potted plant, a coat stand, a floor lamp, a grandfather clock, a server rack, a chest of drawers, a statue on a plinth; outdoors a tree, a lamp post, a bush, a fence section.
- Fit the era and region exactly (no plastic or electronics before their time); when unsure, choose plain wooden or stone pieces that existed then.
- Never a person, animal or vehicle; never a table, desk, counter, bench or chair (people would be expected to use them); never anything with a screen, readable text, a logo, a poster, a flag or a map; nothing the story is about and nothing already listed among the director's props for that place; nothing small.
- A place where nothing would stand on the ground (open sea, sky, outer space, an abstract or diagram backdrop) gets no pieces.
- Keep each description generic enough to draw from a reference photo of that kind of object.`,
      prompt: `Episode: ${input.topic}\n\nPlaces:\n${input.places
        .map((p) => `- ${p.id}: ${p.name}. ${p.description}${p.props.length ? `\n  Director's props here: ${p.props.join("; ")}` : ""}`)
        .join("\n")}`,
    },
    deps,
  );
}

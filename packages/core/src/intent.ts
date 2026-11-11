import { z } from "zod";

// Bunlar sahne amacı etiketleri; yeni bir render efekti ya da serbest kod değildir.
export const INTENT_ACTIONS = [
  "hold", "reveal", "compare", "walk", "move", "typing", "writing", "reading", "show", "give", "point",
  "nod", "shake_head", "think", "cheer", "clap", "wave", "shrug", "surprised", "arms_crossed", "hands_on_hips",
] as const;
export const ShotIntent = z.object({
  subject: z.string().trim().min(1).max(160).describe("Vector: exact visible asset id, background, text:N or three:N (zero-based). Media: concise visible subject."),
  action: z.enum(INTENT_ACTIONS).describe("One narrated action; hold is an intentional quiet beat, reveal/compare use existing composition primitives"),
  target: z.string().trim().min(1).max(160).optional().describe("Vector: exact interaction target asset id; for give, the receiver; for point, the pointed-at layer"),
  payoff: z.string().trim().min(1).max(300).describe("What the viewer should visibly understand at the reveal; direction, not proof that it happened"),
  narration: z.object({
    startWord: z.number().int().nonnegative(),
    endWord: z.number().int().nonnegative().describe("Inclusive final word index, relative to this scene's indexed narration"),
  }).refine((r) => r.endWord >= r.startWord, "Narration word range must be increasing"),
  reveal: z.number().min(0).max(1).describe("Fraction of this shot when the intended visible result is established"),
  holdSec: z.number().min(0).max(30).describe("Planned readable hold after the reveal, in seconds; do not extend narration to fit it"),
});
export type ShotIntent = z.infer<typeof ShotIntent>;

/** İnceleyiciye tasarım niyetini verir; gerçekleştiğini ileri sürmez. */
export function shotIntentText(intent: ShotIntent | undefined): string {
  return intent ? `Planned narrative intent (not measured evidence): ${JSON.stringify(intent)}` : "";
}

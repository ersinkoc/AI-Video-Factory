import { baseBackgroundId, ShotIntent } from "@ys/core";
import { revealWindow } from "@ys/video/text-timing";
import type { EpisodeState } from "./state.ts";
import { sceneOffsets } from "./timing.ts";

export interface IntentFinding { shotId: string; code: string; detail: string }

/** Planın denetlenebilir tutarlılığı; gerçek görüntüde anlam/okunurluk kanıtı değildir. */
export function collectIntentFindings(state: Pick<EpisodeState, "shots" | "voice" | "script" | "archives">): IntentFinding[] {
  const findings: IntentFinding[] = [];
  const offsets = sceneOffsets(state.script?.scenes.map((s) => s.id) ?? [], state.voice ?? {});
  for (const shot of state.shots ?? []) {
    if (!shot.intent) continue; // Eski planlar kendiliğinden taşınmaz ya da kusurlu sayılmaz.
    const add = (code: string, detail: string) => findings.push({ shotId: shot.id, code, detail });
    const parsed = ShotIntent.safeParse(shot.intent);
    if (!parsed.success) { add("intent_invalid", "Structured intent is invalid; review its fields before using it."); continue; }
    const intent = parsed.data, duration = (shot.endMs - shot.startMs) / 1000;
    if (!Number.isFinite(duration) || duration <= 0) { add("intent_duration", "The shot has no positive finite duration."); continue; }
    const available = duration * (1 - intent.reveal);
    if (intent.holdSec > available + .001) add("intent_hold_overrun", `Planned hold ${intent.holdSec.toFixed(2)}s exceeds ${available.toFixed(2)}s after the declared reveal.`);
    const voice = state.voice?.[shot.sceneId], start = voice?.words[intent.narration.startWord], end = voice?.words[intent.narration.endWord], offset = offsets[shot.sceneId];
    if (!start || !end || offset === undefined) add("intent_narration_unavailable", "The declared narration words have no saved alignment in this scene.");
    else if (offset + start.startMs < shot.startMs - 1 || offset + end.endMs > shot.endMs + 1) add("intent_narration_outside_shot", "The declared narration word range extends outside this shot's saved timing.");
    const spec = state.archives?.[shot.id] ? undefined : shot.vector;
    if (!spec) {
      if (shot.kind === "still_motion" && !state.archives?.[shot.id] && !["hold", "reveal", "compare"].includes(intent.action)) add("intent_still_action", "Still media may depict this action but cannot execute its independent motion; use a clip when motion is required.");
      continue;
    }
    const index = (prefix: string) => {
      const match = new RegExp(`^${prefix}:(0|[1-9][0-9]*)$`).exec(intent.subject);
      return match ? Number(match[1]) : -1;
    };
    const subject = spec.layers.find((l) => l.asset === intent.subject), text = spec.texts[index("text")];
    if (!subject && !(intent.subject === "background" && spec.background) && !(spec.background && baseBackgroundId(intent.subject) === baseBackgroundId(spec.background)) && !text && !spec.three?.[index("three")]) add("intent_subject_missing", `Intended subject ${JSON.stringify(intent.subject)} is not present in this vector plan.`);
    const targetIndex = intent.target === undefined ? -1 : spec.layers.findIndex((l) => l.asset === intent.target);
    if (intent.target !== undefined && (targetIndex < 0 || spec.layers[targetIndex]?.asset === intent.subject)) add("intent_target_missing", `Interaction target ${JSON.stringify(intent.target)} is absent or is the actor itself.`);
    if (!["hold", "reveal", "compare"].includes(intent.action)) {
      const actions = subject?.anims.filter((a) => a.type === intent.action) ?? [];
      if (!actions.length) add("intent_action_missing", `The intended subject has no ${intent.action} animation in the plan.`);
      else if ((intent.action === "point" || intent.action === "give") && targetIndex >= 0 && actions.some((a) => a.target !== targetIndex)) add("intent_target_mismatch", "The planned gesture points to a different layer than the declared interaction target.");
    }
    if (text) {
      const words = text.text.trim().split(/\s+/).filter(Boolean).length;
      const minimum = .5 + .3 * words;
      if (intent.holdSec + .001 < minimum) add("intent_text_hold", `The declared ${intent.holdSec.toFixed(2)}s hold is shorter than the ${minimum.toFixed(2)}s reading guideline for ${words} words; shorten the text or revise the plan.`);
      const reveals = text.anims.filter((a) => ["typewriter", "kinetic", "count_up", "fade_in", "slide_in", "pop", "draw_on"].includes(a.type));
      const ready = Math.max(intent.reveal, ...reveals.map((a) => revealWindow(a, text.text, duration).end));
      const exit = Math.min(1, ...text.anims.filter((a) => a.type === "fade_out").map((a) => a.start));
      if ((exit - ready) * duration + .001 < intent.holdSec) add("intent_text_timing", "The text's planned reveal/exit leaves less time than the declared hold; this checks animation timing, not pixel legibility.");
    }
  }
  return findings;
}

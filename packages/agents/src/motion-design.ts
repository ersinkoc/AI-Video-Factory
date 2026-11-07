/**
 * Compact runtime policy adapted from the installed HyperFrames motion and 3D runbooks.
 * These agents have no tools/skills: describe executable shots, never pretend to run the authoring workflow.
 * Maintainer workflow and provenance: AGENTS.md and docs/SCENE_MOTION.md.
 */
export const MOTION_DESIGN_POLICY = `Visual storytelling and motion craft:
- Give each shot one clear hero, a narrated action or change, and a reveal/payoff. Describe the meaningful movement in the shot description. Decorative orbit, pulse, float or particles do not replace the narrated action.
- Use camera movement to reveal a relationship, detail or consequence. Vary framing with purpose; do not repeat the same entrance or treatment across consecutive shots. A quiet emotional hold is intentional, not a failure to animate.
- Keep titles and key numbers steady after their entrance. Budget a readable hold (about 0.5 seconds plus 0.3 seconds per word; a final line needs about 2 seconds). If the available shot is too short, shorten or omit the on-screen text instead of changing the narration timing.
- Preserve the channel's chosen style, palette and identity. Keep important subjects and text inside the format's safe area; effects must not obscure faces, the narrated object, captions or data.
- Use 3D to explain structure or a process, with a clear subject and deliberate lighting, rather than as unrelated decoration. Use actual supplied numbers for labels; do not invent data or replace factual geography with a schematic model.
- Express every choice through fields and values supported by the supplied output schema and selected rendering mode. Do not invent a HyperFrames block, external render, simulation, camera path or asset that this request cannot execute. You have no CLI or skill access in this call; do not claim registry searches or completed renders.`;

export const MOTION_REVIEW_POLICY = `Motion-design review evidence:
- Judge the visible hierarchy: the narrated subject must read clearly, and effects, highlights or particles must not obscure it or compete with text. Preserve the chosen style and palette; do not demand extra visual noise or 3D when the narrative does not need it.
- A single still cannot prove animation timing, a frozen simulation, reading duration, transition continuity or backwards-seek correctness. Compare frames only for evidence they actually contain; reference images are identity references, not an animation sequence. Report visible defects using the existing issue types, and do not invent motion failures or claim a complete motion review from still images.`;

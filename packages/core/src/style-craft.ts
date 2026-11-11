/** Stil paketlerinin çalıştırılabilir hareket ve malzeme sözleşmesi; isteğe bağlı pilotlar. */
export interface StyleCraft {
  material: "paper" | "ink" | "line" | "poster";
  entrance: "slide_in" | "fade_in" | "draw_on";
  entranceSec: number;
  motion: string;
  typography: { family: string; weight: number; tracking: number; rule: string };
  continuity: string;
  checks: string[];
  avoid: string[];
}

export const STYLE_CRAFTS: Readonly<Record<string, StyleCraft>> = {
  "paper-cutout": {
    material: "paper", entrance: "slide_in", entranceSec: 0.55,
    motion: "Assemble separate paper object layers with short horizontal slides and stable contact shadows. Preserve their silhouette; settle before the narrated payoff. Folding and arbitrary shape morphing are not supported.",
    typography: { family: "'Segoe UI', sans-serif", weight: 800, tracking: 0.2, rule: "Bold short headings; reveal once, then hold still. No floating letters." },
    continuity: "Reuse the same paper object id across adjacent ideas; preserve its place when the setting continues and reveal the next relationship around it.",
    checks: ["Separate matte cut-paper silhouettes and restrained layer shadows", "One clear hero and readable negative space"],
    avoid: ["Elastic pop entrances", "Glossy plastic shading", "Texture that changes randomly each frame"],
  },
  risograph: {
    material: "ink", entrance: "fade_in", entranceSec: 0.5,
    motion: "Reveal solid spot-colour plates in a short overlapping print pass. Keep tiny registration offsets fixed to each object throughout the shot; hold the finished print still.",
    typography: { family: "'Arial Black', 'Segoe UI', sans-serif", weight: 900, tracking: -0.5, rule: "Heavy compact headings and tabular numbers; keep essential lettering crisp above the print layers." },
    continuity: "Keep a recurring printed subject as the visual anchor; change the surrounding diagram or camera to explain the next idea.",
    checks: ["Limited spot inks with visible, restrained plate registration", "Printed shapes remain recognizable and text stays sharp"],
    avoid: ["Generic full-frame grain as the only print treatment", "Per-frame random registration", "Blurring essential labels"],
  },
  isometric: {
    material: "line", entrance: "draw_on", entranceSec: 1.1,
    motion: "Construct object contours with arc-length-based draw_on, then reveal fills. Use assembled structures and supported move animations to explain a process; maintain one consistent projection in the drawing.",
    typography: { family: "Consolas, 'Courier New', monospace", weight: 700, tracking: 0, rule: "Short technical labels and aligned numbers; keep labels horizontal and still after revealing them." },
    continuity: "Keep the same machine or system id between steps; reveal a component or change framing instead of replacing the whole system with an unrelated card.",
    checks: ["Consistent parallel axes, coherent occlusion and clear line hierarchy", "Recognizable mechanism rather than arbitrary wireframe boxes"],
    avoid: ["Decorative orbit", "Inconsistent perspective", "Drawing rigged people stroke by stroke"],
  },
  "paper-poster": {
    material: "poster", entrance: "fade_in", entranceSec: 0.4,
    motion: "Use a single flat printed hero per idea with calm supported moves and readable holds. Direct cuts preserve the stage; reserve a motivated camera move for a revealed relationship. No cinematic grading, dimensional shadows or idle drift.",
    typography: { family: "'Arial Narrow', Impact, sans-serif", weight: 800, tracking: 0, rule: "Short condensed headings printed in the light ink on solid dark ink, without shadows; land and hold." },
    continuity: "Keep the same printed object and geometry between ideas, building the next relationship around it rather than replacing the poster.",
    checks: ["Flat palette and subtle stationary paper grain without vignette or lighting gradients", "One hero, restrained lime accent and short stable headings"],
    avoid: ["Dimensional cut-paper shadows", "Automatic decorative scene transitions", "Per-frame random grain"],
  },
};

/** Bilinmeyen ve eski paketler eski render davranışını korur. */
export function styleCraftOf(pack: string | undefined): StyleCraft | undefined {
  return pack === undefined || !Object.hasOwn(STYLE_CRAFTS, pack) ? undefined : STYLE_CRAFTS[pack];
}

/** Araçsız ajanlara yalnız ilgili pilotun kısa sözleşmesi gider. */
export function styleCraftBlock(pack: string | undefined, review = false): string {
  const craft = styleCraftOf(pack);
  if (!craft) return "";
  return review
    ? "Style-specific visible checks: " + craft.checks.join("; ") + ". Report concrete deviations as other with a style-specific explanation. A still does not prove motion or plate timing."
    : "Style-specific craft: " + craft.motion + " Typography: " + craft.typography.rule + " Continuity: " + craft.continuity + " Avoid: " + craft.avoid.join("; ") + ". Use only supported schema values; the renderer supplies the material entrance on scene establishment.";
}

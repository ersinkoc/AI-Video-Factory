import { z } from "zod";
import { models, runStructured, type AgentDeps, type AgentResult } from "./runner.ts";
import type { ScriptOut, StoryOut } from "./schemas.ts";

export const PackageOut = z.object({
  title: z.string().max(100).describe("YouTube title in the episode language, ideally under 70 characters: a concrete promise or question, no clickbait lies, no ALL CAPS"),
  thumbnailText: z.string().max(40).describe("2-5 punchy words for the thumbnail in the episode language; must not repeat the title"),
  description: z
    .string()
    .max(3000)
    .describe("Video description in the episode language: first two lines hook the viewer (they show in search), then 2-4 short paragraphs on what the video covers. No links, no chapter list, no hashtags (code adds them)"),
  chapters: z
    .array(z.object({ scene: z.string().describe("Id of the scene where the chapter starts (s1, s4, ...)"), title: z.string().max(60) }))
    .max(12)
    .describe("3-8 chapters in story order, the first starting at the first scene; short titles in the episode language"),
  tags: z.array(z.string().max(30)).max(15).describe("Search tags in the episode language (plus well-known English names), most specific first"),
  hashtags: z.array(z.string().max(30)).max(3).describe("Up to 3 hashtags without the # sign, no spaces"),
  short: z
    .object({
      from: z.string().describe("Id of the first scene of the Short"),
      to: z.string().describe("Id of the last scene of the Short (inclusive; may equal from)"),
      title: z.string().max(100).describe("YouTube Shorts title in the episode language, under 60 characters"),
    })
    .describe("The best stretch of consecutive scenes for a vertical YouTube Short, 20-60 s in total: it must make sense on its own, open with a hook and end on a payoff"),
});
export type PackageOut = z.infer<typeof PackageOut>;

export interface PackageInput {
  story: StoryOut;
  script: ScriptOut;
  lang: string;
  /** Video süresi (sn): açıklamanın ve bölümlerin ölçüsü. */
  durationSec: number;
  /** Sahne süreleri (sn): Short için uygun aralığı seçebilsin. */
  sceneSec?: Record<string, number>;
}

/**
 * Yayın paketi: YouTube başlığı, küçük resim metni, açıklama, bölüm başlıkları, etiketler, hashtag'ler ve Short'a
 * kesilecek sahne aralığı. Bölüm zamanları ve Short'un süre sınırı kodda sahne başlangıçlarından hesaplanır; burada
 * yalnız metinler ve seçim.
 */
export function packager(input: PackageInput, deps?: AgentDeps): Promise<AgentResult<PackageOut>> {
  const sec = (id: string) => (input.sceneSec?.[id] !== undefined ? ` (${Math.round(input.sceneSec[id]!)} s)` : "");
  const scenes = input.script.scenes.map((s) => `${s.id}${sec(s.id)}: ${s.narration.slice(0, 280)}`).join("\n");
  return runStructured(
    {
      name: "packager",
      model: models().fast,
      effort: "low",
      schema: PackageOut,
      system: `You package a finished narrative YouTube video for publishing: title, thumbnail text, description, chapters, tags, and the stretch to cut as a vertical Short. Write everything in the episode language (${input.lang}); keep names of real people, companies and products as they are spelled. Be specific and honest: promise only what the video delivers.`,
      prompt: `Working title: ${input.story.title}\nLogline: ${input.story.logline}\nHook: ${input.story.hook}\nLength: ${Math.round(input.durationSec / 60)} min\n\nScenes (id (length): narration start):\n${scenes}`,
    },
    deps,
  );
}

/** Saniyeyi YouTube bölüm zamanına çevirir (0:00, 4:05, 1:02:03). */
export function chapterTime(sec: number): string {
  const s = Math.floor(sec);
  const pad = (n: number) => String(n).padStart(2, "0");
  return s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

/**
 * YouTube'un bölüm kuralına uyan satırlar: ilk bölüm 0:00'da, bölümler en az 10 sn, en az 3 bölüm (yoksa hiç). Sahne
 * kimliği bilinmeyen bölüm atılır; aynı ana düşen ya da 10 sn'den yakın bölümlerden ilki kalır.
 */
export function chapterLines(chapters: PackageOut["chapters"], sceneStartSec: Record<string, number>): string[] {
  const known = chapters.filter((c) => sceneStartSec[c.scene] !== undefined).map((c) => ({ title: c.title.trim(), at: sceneStartSec[c.scene]! }));
  known.sort((a, b) => a.at - b.at);
  if (known.length) known[0]!.at = 0;
  const kept: typeof known = [];
  for (const c of known) if (!kept.length || c.at - kept.at(-1)!.at >= 10) kept.push(c);
  return kept.length >= 3 ? kept.map((c) => `${chapterTime(c.at)} ${c.title}`) : [];
}

/** Yüklemeye hazır açıklama: modelin metni, bölüm satırları, kaynak satırları (lisansın istediği atıf) ve hashtag'ler. */
export function fullDescription(pkg: PackageOut, chapters: string[], credits: string[] = []): string {
  const tags = pkg.hashtags.map((h) => `#${h.replace(/^#/, "").replace(/\s+/g, "")}`).filter((h) => h.length > 1);
  return [pkg.description.trim(), chapters.join("\n"), credits.join("\n"), tags.join(" ")].filter(Boolean).join("\n\n");
}

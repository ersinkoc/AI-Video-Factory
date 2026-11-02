import { describe, expect, it } from "vitest";
import { AgentError, chapterLines, chapterTime, fullDescription, packager, PackageOut, type AgentDeps, type QueryFn } from "../src/index.ts";

/** Ajanın modele gönderdiği istemi yakalar (sahte sorgu sonuç vermez, çağrı hata ile biter). */
async function capture(run: (deps: AgentDeps) => Promise<unknown>) {
  let params: { prompt: string; options: Record<string, unknown> } | undefined;
  const queryFn = ((p: typeof params) => {
    params = p;
    return (async function* () {
      yield { type: "result", subtype: "error_max_turns", duration_ms: 1, total_cost_usd: 0 };
    })();
  }) as unknown as QueryFn;
  await expect(run({ queryFn })).rejects.toThrow(AgentError);
  return { prompt: params!.prompt, system: params!.options.systemPrompt as string };
}

const PKG = PackageOut.parse({ title: "T", thumbnailText: "K", description: "  Açıklama.  ", chapters: [], tags: ["a"], hashtags: ["tarih", "#tek noloji", "#"] });

describe("yayın paketi", () => {
  it("istem hikâyeyi, süreyi ve sahnelerin başını verir; dil ve özel ad kuralı talimatta", async () => {
    const story = { title: "Çalışma başlığı", logline: "Bir cümle", premise: "", hook: "İlk 15 saniye", beats: [] };
    const script = { scenes: [{ id: "s1", beatId: "b1", narration: "x".repeat(400), visualIntent: "", emotion: "", location: "" }] };
    const c = await capture((d) => packager({ story, script, lang: "tr", durationSec: 600 }, d));
    expect(c.system).toContain("episode language (tr)");
    expect(c.system).toContain("keep names of real people, companies and products");
    expect(c.prompt).toContain("Working title: Çalışma başlığı\nLogline: Bir cümle\nHook: İlk 15 saniye\nLength: 10 min");
    expect(c.prompt).toContain(`s1: ${"x".repeat(280)}`);
    expect(c.prompt).not.toContain("x".repeat(281));
  });

  it("bölüm zamanı YouTube biçiminde", () => {
    expect([chapterTime(0), chapterTime(65.9), chapterTime(600), chapterTime(3723)]).toEqual(["0:00", "1:05", "10:00", "1:02:03"]);
  });

  it("bölümler: ilki 0:00, 10 sn'den yakın ya da bilinmeyen sahne atılır, 3'ten azsa hiç", () => {
    const starts = { s1: 2.5, s2: 40, s3: 45, s4: 130, s5: 700 };
    const ch = (scenes: string[]) => scenes.map((scene, i) => ({ scene, title: ` Bölüm ${i + 1} ` }));
    expect(chapterLines(ch(["s1", "s2", "s3", "s4", "yok", "s5"]), starts)).toEqual(["0:00 Bölüm 1", "0:40 Bölüm 2", "2:10 Bölüm 4", "11:40 Bölüm 6"]);
    // Sırasız gelen bölümler sıralanır.
    expect(chapterLines(ch(["s4", "s1", "s2"]), starts)).toEqual(["0:00 Bölüm 2", "0:40 Bölüm 3", "2:10 Bölüm 1"]);
    expect(chapterLines(ch(["s1", "s2"]), starts)).toEqual([]);
    expect(chapterLines(ch(["s2", "s3"]), starts)).toEqual([]);
    expect(chapterLines([], starts)).toEqual([]);
  });

  it("açıklama: metin, bölümler ve # ile boşluksuz hashtag'ler; boş parçalar atlanır", () => {
    expect(fullDescription(PKG, ["0:00 A", "1:00 B", "2:00 C"])).toBe("Açıklama.\n\n0:00 A\n1:00 B\n2:00 C\n\n#tarih #teknoloji");
    expect(fullDescription({ ...PKG, hashtags: [] }, [])).toBe("Açıklama.");
  });
});

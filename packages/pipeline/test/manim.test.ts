import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { MathSpec } from "@ys/core";
import { afterAll, describe, expect, it } from "vitest";
import { exitCode, boardAccent, boardScript, boardTiming, cleanMath, latexBin, manimPath, niceRange, renderBoard, safeLatex, spawnRun, type BoardRun } from "../src/manim.ts";

const tmp = mkdtempSync(join(tmpdir(), "ys-manim-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("Manim tahtası: güvenlik", () => {
  it("matematik LaTeX'i geçer", () => {
    for (const ok of ["E = mc^2", "c = \\sqrt{a^2 + b^2}", "\\frac{\\Delta x}{\\Delta t}", "\\left( \\sum_{i=1}^{n} i \\right)", "\\{ x \\mid x > 0 \\}", "a \\, b \\; c \\! d \\: e \\ f", "\\|v\\|"]) {
      expect(safeLatex(ok), ok).toBe(true);
    }
  });

  it("dosya/makro komutu, TeX kaçışı, ASCII dışı ve dengesiz parantez reddedilir", () => {
    for (const bad of [
      "\\input{/etc/passwd}",
      "\\write18{calc}",
      "\\def\\x{1}",
      "\\text{gizli}",
      "^^5cinput{x}",
      "a % yorum",
      "$x$",
      "#1",
      "x\\\\y",
      "x \\",
      "π r^2",
      "{a",
      "a}",
      "   ",
    ]) {
      expect(safeLatex(bad), bad).toBe(false);
    }
  });

  it("izinsiz adımlar ayrılır, grafik kalır", () => {
    const spec = MathSpec.parse({ steps: ["x^2", "\\input{a}"], graph: { points: [{ x: 0, y: 1 }, { x: 1, y: 2 }] } });
    expect(cleanMath(spec)).toEqual({ spec: { ...spec, steps: ["x^2"] }, dropped: ["\\input{a}"] });
  });
});

describe("Manim tahtası: sahne", () => {
  it("vurgu rengi paletin parlak doygun rengi, yoksa sarı", () => {
    expect(boardAccent(["#1d2433", "#ff6b35", "#22aa88"])).toBe("#ff6b35");
    expect(boardAccent(["#1d2433", "#808080", "kırmızı"])).toBe("#ffd84d");
  });

  it("eksen aralıkları yuvarlak", () => {
    expect(niceRange(1971, 1993)).toEqual([1970, 1995, 5]);
    expect(niceRange(0, 3_100_000)).toEqual([0, 4_000_000, 1_000_000]);
    expect(niceRange(0, 0.37)).toEqual([0, 0.4, 0.1]);
    expect(niceRange(5, 5)).toEqual([5, 6, 1]);
    expect(niceRange(0, 0)).toEqual([0, 0.2, 0.2]);
  });

  it("süre: animasyonlar sığar, kalan süre eşit bekleme; kısa çekimde animasyonlar kısalır", () => {
    const spec = MathSpec.parse({ steps: ["a", "b"], graph: { points: [{ x: 0, y: 1 }, { x: 1, y: 2 }] } });
    expect(boardTiming(spec, 10)).toEqual({ runs: [1.2, 1, 0.8, 1.5], wait: 1.3 });
    const short = boardTiming(spec, 2.3);
    expect(short.wait).toBe(0);
    expect(short.runs.reduce((a, b) => a + b, 0)).toBeCloseTo(2, 2);
    expect(boardTiming(MathSpec.parse({ steps: ["a"] }), 0.5).runs).toEqual([1]);
  });

  it("yalnız formül: ortada yazılır, sonraki adım ona dönüşür; metin JSON dizesi olarak gömülür", () => {
    const py = boardScript(MathSpec.parse({ steps: ["E = mc^2", 'm = \\frac{E}{c^2}'] }), 5, "#ff6b35");
    expect(py).toContain('ACCENT = "#ff6b35"');
    expect(py).toContain('nxt = fit(MathTex("E = mc^2", color=INK), 13, 3).move_to(ORIGIN)');
    expect(py).toContain("self.play(Write(nxt), run_time=1.2)");
    expect(py).toContain('MathTex("m = \\\\frac{E}{c^2}"');
    expect(py).toContain("self.play(TransformMatchingTex(eq, nxt), run_time=1)");
    expect(py).not.toContain("Axes");
  });

  it("formül + çizgi grafik: formül üstte, eksenler altta, nokta nokta çizilir; etiketler kaçışlı", () => {
    const py = boardScript(MathSpec.parse({ steps: ["x^2"], graph: { points: [{ x: 1971, y: 2300 }, { x: 1993, y: 3100000 }], xLabel: 'Yıl "x"', yLabel: "Transistör" } }), 8, "#ff6b35");
    expect(py).toContain(".move_to(UP * 2.6)");
    expect(py).toContain("ax = Axes(x_range=[1970, 1995, 5], y_range=[0, 4000000, 1000000], x_length=11, y_length=4.4");
    expect(py).toContain('"num_decimal_places": 0, "group_with_commas": False');
    expect(py).toContain('Text("Yıl \\"x\\"", font_size=26, color=INK), Text("Transistör"');
    expect(py).toContain("for x, y in [(1971, 2300), (1993, 3100000)]");
    expect(py).toContain("self.play(Create(curve)");
  });

  it("çubuk grafik: değerler ve adlar, çubuklar alttan büyür; etiketsiz eksen boş yazı; kesirli adımda ondalık", () => {
    const py = boardScript(MathSpec.parse({ graph: { kind: "bar", points: [{ x: 2019, y: 0.12 }, { x: 2020, y: 0.31 }] } }), 6, "#ff6b35");
    expect(py).toContain('ax = BarChart(values=[0.12, 0.31], bar_names=["2019", "2020"], y_range=[0, 0.4, 0.1], x_length=12.5, y_length=6.2');
    expect(py).toContain('"num_decimal_places": 1');
    expect(py).toContain('Text("", font_size=26');
    expect(py).toContain("GrowFromEdge(b, DOWN) for b in ax.bars");
    expect(py).toContain(".move_to(ORIGIN)");
  });
});

describe("Manim tahtası: çalıştırma", () => {
  it("Manim ve LaTeX yolu ortamdan ya da varsayılan yerden", () => {
    expect(manimPath({ YS_MANIM: "C:/m.exe" })).toBe("C:/m.exe");
    expect(manimPath({}, "win32")).toMatch(/[\\/]\.data[\\/]tools[\\/]manim-venv[\\/]Scripts[\\/]manim\.exe$/);
    expect(manimPath({}, "linux")).toMatch(/[\\/]manim-venv[\\/]bin[\\/]manim$/);
    expect(latexBin({ YS_LATEX_BIN: "/tex" })).toBe("/tex");
    expect(latexBin({ LOCALAPPDATA: "C:/L" })).toBe(join("C:/L", "Programs", "MiKTeX", "miktex", "bin", "x64"));
    expect(latexBin({})).toBeUndefined();
  });

  const spec = MathSpec.parse({ steps: ["x^2"] });
  const exe = join(tmp, "manim.exe");
  writeFileSync(exe, "");

  it("boş tarif ve kurulu olmayan Manim net hata verir", async () => {
    await expect(renderBoard(MathSpec.parse({}), 3, "#fff", join(tmp, "a"))).rejects.toThrow("Manim tarifi boş");
    await expect(renderBoard(spec, 3, "#fff", join(tmp, "a"), undefined, { YS_MANIM: join(tmp, "yok.exe") })).rejects.toThrow(/^Manim bulunamadı/);
  });

  it("betiği yazar, Manim'i tahta boyutunda saydam WebM için çağırır, LaTeX'i PATH'e ekler, klibi döndürür ve klasörü siler", async () => {
    const dir = join(tmp, "ok");
    let seen: { cmd: string; args: string[]; env: Record<string, string | undefined>; cwd: string; script: string } | undefined;
    const run: BoardRun = async (cmd, args, env, cwd) => {
      seen = { cmd, args, env, cwd, script: "" };
      seen.script = (await import("node:fs")).readFileSync(join(cwd, "board.py"), "utf8");
      const out = join(cwd, "media", "videos", "board", "560p30");
      mkdirSync(out, { recursive: true });
      mkdirSync(join(cwd, "media", "images"), { recursive: true });
      writeFileSync(join(cwd, "media", "log.txt"), "");
      writeFileSync(join(out, "board.webm"), "klip");
      return { code: 0, output: "" };
    };
    const bytes = await renderBoard(spec, 3, "#fff", dir, run, { YS_MANIM: exe, YS_LATEX_BIN: "/tex", PATH: "/bin" });
    expect(new TextDecoder().decode(bytes)).toBe("klip");
    expect(seen!.cmd).toBe(exe);
    expect(seen!.cwd).toBe(dir);
    expect(seen!.args.slice(0, 5)).toEqual(["render", "board.py", "MathBoard", "-r", "1040,560"]);
    expect(seen!.args).toEqual(expect.arrayContaining(["--transparent", "--format", "webm", "--disable_caching"]));
    expect(seen!.env.PATH).toBe(`/tex${delimiter}/bin`);
    expect(seen!.script).toContain('MathTex("x^2"');
    expect(existsSync(dir)).toBe(false);

    // LaTeX klasörü yoksa PATH olduğu gibi; PATH de yoksa yalnız LaTeX.
    await renderBoard(spec, 3, "#fff", dir, run, { YS_MANIM: exe, PATH: "/bin" });
    expect(seen!.env.PATH).toBe("/bin");
    await renderBoard(spec, 3, "#fff", dir, run, { YS_MANIM: exe, YS_LATEX_BIN: "/tex" });
    expect(seen!.env.PATH).toBe(`/tex${delimiter}`);
  });

  it("Manim hata kodu ya da çıktısız başarı hata olur; klasör yine silinir", async () => {
    const dir = join(tmp, "bad");
    const fail: BoardRun = async () => ({ code: 2, output: `${"x".repeat(500)} LaTeX Error  ` });
    await expect(renderBoard(spec, 3, "#fff", dir, fail, { YS_MANIM: exe })).rejects.toThrow(/^Manim render hatası \(çıkış 2\): x+ LaTeX Error$/);
    expect(existsSync(dir)).toBe(false);
    await expect(renderBoard(spec, 3, "#fff", dir, async () => ({ code: 0, output: "" }), { YS_MANIM: exe })).rejects.toThrow("board.webm");
    const empty: BoardRun = async (_c, _a, _e, cwd) => {
      mkdirSync(join(cwd, "media"), { recursive: true });
      return { code: 0, output: "" };
    };
    await expect(renderBoard(spec, 3, "#fff", dir, empty, { YS_MANIM: exe })).rejects.toThrow("board.webm");
  });

  it("alt süreç çıktısı ve çıkış kodu toplanır; çalışmayan komut hata verir", async () => {
    const res = await spawnRun(process.execPath, ["-e", "process.stdout.write('a');process.stderr.write('b');process.exit(3)"], process.env, tmp);
    expect(res).toEqual({ code: 3, output: "ab" });
    await expect(spawnRun(join(tmp, "olmayan-komut"), [], process.env, tmp)).rejects.toThrow();
    expect([exitCode(null), exitCode(0)]).toEqual([1, 0]);
  });
});

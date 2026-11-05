import { VectorAsset, VectorScreen } from "@ys/core";
import { describe, expect, it } from "vitest";
import { luminance, SCREEN_LINES, SCREEN_READ, screenBox, screenFor, screenOf, screenSvg } from "../src/screen.ts";

// Monitör: kasa (dış dikdörtgen), ekran (içinde, koyu), altta ayak.
const MONITOR = `<svg viewBox="0 0 200 180"><rect x="0" y="0" width="200" height="140" rx="10" fill="#ddd"/><rect x="20" y="15" width="160" height="105" rx="6" fill="#1b2430"/><rect x="40" y="30" width="20" height="10" fill="#fff"/><rect x="80" y="140" width="40" height="40" fill="#999"/></svg>`;
const parse = (s: object) => VectorScreen.parse(s);

describe("ekranın bulunması", () => {
  it("kasanın içindeki en büyük dikdörtgensi şekil; rengi ve köşe yuvarlaması da", () => {
    expect(screenOf(MONITOR)).toEqual({ x: 20, y: 15, w: 160, h: 105, rx: 6, fill: "#1b2430" });
  });

  it("tasarımcının 'screen' adlı öğesi (grup ya da şekil) önce gelir; grup dönüşümü ve style dolgusu sayılır", () => {
    const named = `<svg viewBox="0 0 200 180"><rect width="200" height="140" fill="#ddd"/><g id="tv-screen" transform="translate(10,5)"><rect x="10" y="10" width="50" height="40" style="fill:#123456"/><circle cx="100" cy="60" r="20"/></g></svg>`;
    expect(screenOf(named)).toEqual({ x: 20, y: 15, w: 110, h: 70, rx: 0, fill: "#123456" });
    // Degrade dolgulu ekranın rengi bilinmez (düz yazı ekranın varsayılan renginde).
    expect(screenOf(`<svg viewBox="0 0 10 10"><path id="screen" d="M1 1H9V9H1Z" fill="url(#g)"/></svg>`)).toEqual({ x: 1, y: 1, w: 8, h: 8, rx: 0 });
  });

  it("çerçevesiz, çok küçük, uzun ince, yuvarlak, dolgusuz şekil ekran değil; viewBox'sız çizimde aranmaz", () => {
    expect(screenOf('<svg viewBox="0 0 100 100"><rect width="100" height="60" fill="#ddd"/></svg>')).toBeUndefined();
    const inside = (shape: string) => screenOf(`<svg viewBox="0 0 100 100"><rect width="100" height="100" fill="#ddd"/>${shape}</svg>`);
    expect(inside('<rect x="10" y="10" width="5" height="5" fill="#000"/>')).toBeUndefined();
    expect(inside('<rect x="5" y="40" width="90" height="10" fill="#000"/>')).toBeUndefined();
    expect(inside('<circle cx="50" cy="50" r="30" fill="#000"/>')).toBeUndefined();
    expect(inside('<ellipse cx="50" cy="50" rx="30" ry="20" fill="#000"/>')).toBeUndefined();
    expect(inside('<rect x="10" y="10" width="60" height="50" fill="none"/>')).toBeUndefined();
    expect(inside('<rect x="10" y="10" width="60" height="50"/>')).toBeUndefined();
    expect(screenOf('<svg width="10" height="10"><rect width="10" height="10"/></svg>')).toBeUndefined();
    expect(screenOf('<svg viewBox="0 0 0 10"></svg>')).toBeUndefined();
  });

  it("çokgen ve yol da aday; tanım, bozuk ve boş şekiller ve kendini kapatan grup atlanır", () => {
    const svg = `<svg viewBox="0 0 100 100"><defs><linearGradient id="g"><stop offset="0"/></linearGradient><clipPath id="c"><rect width="100" height="100"/></clipPath></defs><linearGradient id="h"/><g/>
      <polygon points="0,0 100,0 100,100 0,100" fill="#ccc"/><path d="Z"/><path/><polygon/><use href="#g"/><text>yazı</text><rect x="75" y="70" width="20" height="20" fill="#333"/><rect width="0" height="5" fill="#000"/><polyline points="10,10 70,10 70,60 10,60" fill="#222"/></svg>`;
    expect(screenOf(svg)).toEqual({ x: 10, y: 10, w: 60, h: 50, rx: 0, fill: "#222" });
  });

  it("varlık başına bir kez ölçülür; bulunamayan da önbelleğe girer", () => {
    const asset = VectorAsset.parse({ id: "p-tv", kind: "prop", svg: MONITOR, width: 200, height: 180 });
    expect(screenFor(asset)).toBe(screenFor(asset));
    const plain = VectorAsset.parse({ id: "p-cup", kind: "prop", svg: '<svg viewBox="0 0 1 1"></svg>', width: 1, height: 1 });
    expect(screenFor(plain)).toBeUndefined();
    expect(screenFor(plain)).toBeUndefined();
  });

  it("katman kutusundaki yer: çizim kutuya oranı korunarak ortalanır", () => {
    const rect = screenOf(MONITOR)!;
    // 400×180 kutuda çizim 200×180 boyunda kalır (k = 1), 100 px sağa ortalanır.
    expect(screenBox(MONITOR, rect, 400, 180)).toEqual({ x: 120, y: 15, w: 160, h: 105, k: 1 });
    expect(screenBox(MONITOR, rect, 100, 90)).toEqual({ x: 10, y: 7.5, w: 80, h: 52.5, k: 0.5 });
  });
});

describe("ekranın içeriği", () => {
  const o = { prefix: "p-" };
  it("kod: koyu zemin, satır numarası, dize/sayı/yorum/anahtar sözcük renkleri, girinti korunur; başlık dosya sekmesi", () => {
    // Kamera iki kat yaklaşık: satır kesilmeden küçülür.
    const svg = screenSvg(parse({ kind: "code", title: "app.py", lines: ['def f(x):', '    return "a" + 42 # yorum', "x = 'b'"] }), 400, 300, { ...o, scale: 2 });
    expect(svg).toContain('fill="#1e2130"');
    expect(svg).toContain(">app.py<");
    expect(svg).toContain('<tspan fill="#c792ea">def</tspan>');
    expect(svg).toContain('<tspan fill="#c3e88d">&quot;a&quot;</tspan>');
    expect(svg).toContain('<tspan fill="#f78c6c">42</tspan>');
    expect(svg).toContain('<tspan fill="#7f848e"># yorum</tspan>');
    expect(svg).toContain('xml:space="preserve">    <tspan');
    expect(svg).toMatch(/>1<\/text>.*>2<\/text>.*>3<\/text>/);
    // Başlıksız kod da çizilir.
    expect(screenSvg(parse({ kind: "code", lines: ["x"] }), 400, 300, o)).not.toContain("#2a2e3f");
  });

  it("terminal yeşil eş aralıklı; sohbet balonları iki yana; web ve arama tarayıcı çubuğuyla", () => {
    const term = screenSvg(parse({ kind: "terminal", title: "bash", lines: ["$ ls"] }), 300, 200, o);
    expect(term).toContain('fill="#0c0f0c"');
    expect(term).toContain('fill="#7cfc7c"');
    const chat = screenSvg(parse({ kind: "chat", title: "Sohbet", lines: ["Merhaba", "Selam"] }), 300, 200, o);
    expect(chat.match(/fill="#ffffff" stroke/g)).toHaveLength(1);
    expect(chat.match(/fill="#d6f5d1"/g)).toHaveLength(1);
    expect(screenSvg(parse({ kind: "chat", lines: ["a"] }), 300, 200, o)).not.toContain("#3b5b8c");
    const web = screenSvg(parse({ kind: "web", title: "Ana sayfa", lines: ["Hakkımda"] }), 300, 200, o);
    expect(web).toContain("#ff5f57");
    expect(web).toContain(">Ana sayfa<");
    expect(screenSvg(parse({ kind: "web", lines: [] }), 300, 200, o)).not.toContain("font-weight");
    const search = screenSvg(parse({ kind: "search", title: "uçak bileti", lines: ["Ucuz bilet"] }), 300, 200, o);
    expect(search).toContain('fill="#1a0dab"');
    expect(search).toContain(">uçak bileti<");
    expect(screenSvg(parse({ kind: "search", lines: [] }), 300, 200, o)).not.toContain("uçak");
  });

  it("düz yazı ekranın (tahtanın) kendi renginde: koyu zeminde açık, açık zeminde koyu mürekkep; renk yoksa açık zemin", () => {
    const board = screenSvg(parse({ title: "BASIC", lines: ["10 PRINT"] }), 400, 250, { ...o, fill: "#1f6f5c" });
    expect(board).toContain('fill="#1f6f5c"');
    expect(board).toContain('fill="#f5f3ee" font-weight="800"');
    const paper = screenSvg(parse({ lines: ["Not"] }), 400, 250, { ...o, fill: "rgb(250, 250, 240)" });
    expect(paper).toContain('fill="#1d1a24" text-anchor');
    expect(screenSvg(parse({ lines: ["Not"] }), 400, 250, o)).toContain('fill="#f5f3ee"/>');
  });

  it("uzun satır sözcük sınırından sarılır; sarılamayan önce okunur boya kadar küçülür, sonra okunur boyda kesilir", () => {
    const size = (s: string) => Number(/<text[^>]*font-size="([\d.]+)"[^>]*text-anchor/.exec(s)![1]);
    const rows = (s: string) => [...s.matchAll(/text-anchor="middle"[^>]*>([^<]*)</g)].map((m) => m[1]);
    const short = screenSvg(parse({ lines: ["kısa"] }), 400, 200, o);
    const long = screenSvg(parse({ lines: ["biraz daha uzun bir satır"] }), 400, 200, o);
    expect(rows(long)).toEqual(["biraz daha uzun bir", "satır"]);
    expect(size(long)).toBe(size(short));
    // Tek sözcük sarılamaz: okunur boyun (SCREEN_READ) üstünde sığdığı boya küçülür, kesilmez.
    const word = screenSvg(parse({ lines: ["x".repeat(30)] }), 400, 200, o);
    expect(size(word)).toBeLessThan(size(short));
    expect(size(word)).toBeGreaterThanOrEqual(SCREEN_READ * 0.95);
    expect(word).not.toContain("…");
    // Sığması için okunmaz boy gerekirse okunur boyda kesilir.
    const huge = screenSvg(parse({ lines: ["x".repeat(300)] }), 400, 200, o);
    expect(huge).toContain("…</text>");
    expect(size(huge)).toBe(SCREEN_READ);
    // Kamera yaklaştıkça (scale) ekran px'inde daha küçük yazı da karede okunur: kesmeden küçülür.
    expect(screenSvg(parse({ lines: ["x".repeat(50)] }), 400, 200, o)).toContain("…");
    expect(screenSvg(parse({ lines: ["x".repeat(50)] }), 400, 200, { ...o, scale: 2 })).not.toContain("…");
    // Yalnız boşluktan oluşan uzun satır boş kalır.
    expect(rows(screenSvg(parse({ lines: [" ".repeat(80)] }), 400, 200, o))).toEqual([""]);
  });

  it("satırlar okunur boyda sığmıyorsa azalır: sohbette en yeni mesajlar (sıraları korunur), kodda ilk satırlar", () => {
    const chat = screenSvg(parse({ kind: "chat", lines: ["m1", "m2", "m3", "m4", "m5", "m6"] }), 300, 200, o);
    expect([...chat.matchAll(/>(m\d)</g)].map((m) => m[1])).toEqual(["m4", "m5", "m6"]);
    // m4 dördüncü mesaj: sağda (yeşil), m5 solda; sırayla.
    expect(chat.match(/fill="#d6f5d1"/g)).toHaveLength(2);
    expect(chat.match(/fill="#ffffff" stroke/g)).toHaveLength(1);
    const six = ["a = 1", "b = 2", "c = 3", "d = 4", "e = 5", "f = 6"];
    const lettersOf = (s: string) => [...s.matchAll(/preserve">([a-f]) /g)].map((m) => m[1]);
    expect(lettersOf(screenSvg(parse({ kind: "code", title: "x.py", lines: six }), 400, 230, o))).toEqual(["a", "b", "c", "d", "e"]);
    // Karede okunur boya hiç varamayan ekranda satır atılmaz: en büyük boyda sığmayan altı satır bir adım küçülür.
    expect(lettersOf(screenSvg(parse({ kind: "code", lines: six }), 300, 120, o))).toEqual(["a", "b", "c", "d", "e", "f"]);
    // Sarılınca sığmayan başlık okunur boya varamıyorsa kesilmez, tek satıra küçülür.
    const sign = screenSvg(parse({ title: "Amjad Masad özür diledi", lines: ["x"] }), 200, 80, o);
    expect(sign).toContain('font-weight="800" text-anchor="middle" font-family="Inter, \'Noto Sans\', \'Segoe UI\', sans-serif">Amjad Masad özür diledi<');
  });

  it("en çok SCREEN_LINES satır; yazı kaçışlanır; köşeler ekranın yuvarlamasıyla", () => {
    const many = screenSvg(parse({ lines: Array.from({ length: 9 }, (_, k) => `satır ${k}`) }), 400, 400, o);
    expect(many.match(/>satır \d</g)).toHaveLength(SCREEN_LINES);
    expect(screenSvg(parse({ title: 'a < b & "c"', lines: [] }), 400, 200, o)).toContain("a &lt; b &amp; &quot;c&quot;");
    expect(screenSvg(parse({ lines: [] }), 400, 200, { ...o, rx: 500 })).toContain('rx="50.0"');
  });

  it("kişi: başı ve omuzları ekranı doldurur, kimlikleri öneklenir, başlık alt bantta", () => {
    const person = { svg: '<svg viewBox="0 0 400 800" width="400" height="800"><circle id="head" cx="200" cy="180" r="80"/></svg>', head: { x: 120, y: 96, w: 160, h: 160 } };
    const svg = screenSvg(parse({ title: "Bill Gates", person: "c2" }), 320, 180, { ...o, person });
    expect(svg).toContain('id="p-p-head"');
    expect(svg).toContain('x="0" y="0" width="400" height="800"');
    expect(svg).toContain('viewBox="-24.0 56.0 448.0 252.0"');
    expect(svg).toContain(">Bill Gates<");
    expect(screenSvg(parse({ person: "c2" }), 320, 180, { ...o, person })).not.toContain("#c62828");
  });

  it("renk parlaklığı: kısa ve uzun onaltılık, rgb(); okunamayan renk açık sayılır", () => {
    expect(luminance("#000")).toBe(0);
    expect(luminance("#ffffff")).toBeCloseTo(1);
    expect(luminance("#1f6f5c")).toBeCloseTo(0.363, 2);
    expect(luminance("rgb(0, 0, 0)")).toBe(0);
    expect(luminance("white")).toBeCloseTo(1);
  });
});

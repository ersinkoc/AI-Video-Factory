import { describe, expect, it } from "vitest";
import { faceOf, neckOf, noseOf, noseShift, transformOf, withNose } from "../src/rigGeometry.ts";

const face = (inner: string, viewBox = "0 0 400 800") => faceOf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${inner}</svg>`);

describe("çizimin yüz geometrisi", () => {
  it("baş, göz ve ağız gruplarının sınırları; çene ağzın altında göz-ağız mesafesine göre", () => {
    const f = face(`
      <defs><circle id="x" cx="0" cy="0" r="999"/></defs>
      <g id="body"><rect x="120" y="300" width="160" height="220"/></g>
      <g id="head">
        <circle cx="200" cy="150" r="80"/>
        <g id="eyes"><circle cx="180" cy="140" r="10"/><circle cx="220" cy="140" r="10"/></g>
        <g transform="translate(0,10)"><g id="mouth" transform="translate(0,99)"><path d="M180 200 L220 200 L220 210 L180 210 Z"/></g></g>
      </g>`);
    expect(f.head).toEqual({ x: 120, y: 70, w: 160, h: 160 });
    expect(f.eyes).toEqual({ x: 170, y: 130, w: 60, h: 20 });
    // Ağzın kendi transform'u sayılmaz (render pozu CSS ile ezer), sarmalayan grubunki sayılır.
    expect(f.mouth).toEqual({ x: 180, y: 210, w: 40, h: 10 });
    // Ağzın altı 220, göz ortası 140: 220 + 80 × 0,45.
    expect(f.chin).toEqual([200, 256]);
    expect(f.mouthFrame).toEqual([1, 0, 0, 1, 0, 10]);
    expect(f.mouthInk).toBeUndefined();
  });

  it("ağzın ebeveyn matrisi ve çizgi rengi: iskelet parçasının transform'u yok sayılır; renk kalıtılır, yoksa dolgu", () => {
    const f = face(`
      <g id="head" transform="translate(500,0)"><circle cx="200" cy="150" r="80"/>
        <g id="hat" transform="translate(0,0)" stroke="#123">
          <g transform="scale(2)"><g id="mouth"><path d="M90 100 L110 100" stroke="url(#g)" fill="#ff0000"/><path d="M95 101 L105 101" stroke="#999"/></g></g>
        </g>
      </g>`);
    expect(f.head).toEqual({ x: 120, y: 70, w: 160, h: 160 });
    expect(f.mouth).toEqual({ x: 180, y: 200, w: 40, h: 2 });
    expect(f.mouthFrame).toEqual([2, 0, 0, 2, 0, 0]);
    // Geçersiz boya (url) atlanır, gruptan kalıtılan çizgi rengi kullanılır; ilk bulunan kalır.
    expect(f.mouthInk).toBe("#123");
    // Çizgi yoksa (none) dolgu; style özniteliği de okunur; doğrudan şekildeki ağız kimliği.
    expect(face('<g id="mouth"><path d="M190 300 L210 300 L210 310 Z" style="stroke:none; fill: #aa0000"/></g>').mouthInk).toBe("#aa0000");
    const shape = face('<path id="mouth" d="M190 300 L210 300" stroke="rgb(10, 20, 30)" transform="translate(0,50)"/>');
    expect([shape.mouth, shape.mouthFrame, shape.mouthInk]).toEqual([{ x: 190, y: 300, w: 20, h: 0 }, [1, 0, 0, 1, 0, 0], "rgb(10, 20, 30)"]);
    // Ölçülemeyen ağızda matris ve renk de yok; boya hiç yoksa renk yok.
    expect(face('<g id="mouth" stroke="#000"><path d="Z"/></g>')).toEqual({});
    expect(face('<g id="mouth"><path d="M190 300 L210 300" fill="none" stroke="currentColor"/></g>').mouthInk).toBeUndefined();
  });

  it("kolun en alt noktası (ön kol + el; el grubu yoksa ön kolun içindeki el): parmakların nereye uzandığı", () => {
    const f = face(`
      <g id="arm-l"><rect x="130" y="290" width="20" height="110"/><g id="forearm-l" transform="rotate(90 140 400)"><rect x="130" y="400" width="20" height="130"/></g></g>
      <g id="arm-r"><g id="forearm-r"><rect x="250" y="400" width="20" height="90"/><g id="hand-r"><rect x="250" y="490" width="20" height="62"/></g></g></g>`);
    // İskelet parçasının kendi transform'u sayılmaz (dinlenme duruşu).
    expect(f.hands).toEqual({ l: 530, r: 552 });
    expect(face('<g id="forearm-r"><rect x="250" y="400" width="20" height="100"/></g>').hands).toEqual({ r: 500 });
    expect(face('<g id="hand-l"><rect x="130" y="490" width="20" height="40"/></g>').hands).toEqual({ l: 530 });
    expect(face('<g id="head"><circle cx="200" cy="150" r="80"/></g>').hands).toBeUndefined();
  });

  it("viewBox iskelet tuvaline ölçeklenir ve ortalanır; yalnız baş varsa çene başın altına yakın", () => {
    const f = face('<g id="head"><ellipse cx="100" cy="75" rx="40" ry="50"/></g>', "0 0 200 400");
    expect(f.head).toEqual({ x: 120, y: 50, w: 160, h: 200 });
    expect(f.chin![1]).toBeCloseTo(50 + 200 * 0.92, 6);
    // Oranı farklı viewBox ortalanır (meet); viewBox yoksa iskelet tuvali sayılır.
    expect(face('<g id="head"><rect x="0" y="0" width="100" height="100"/></g>', "0 0 800 800").head).toEqual({ x: 0, y: 200, w: 50, h: 50 });
    expect(faceOf('<svg><g id="head"><rect x="10" y="20" width="30" height="40"/></g></svg>').head).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });

  it("her şekil türü ölçülür; ölçülemeyen, sıfır boylu ve parça dışındaki şekil sayılmaz", () => {
    const f = face(`
      <rect x="0" y="0" width="400" height="800"/>
      <g id="mouth">
        <line x1="190" y1="300" x2="210" y2="302"/>
        <polyline points="185,305 215,305 200,310"/>
        <polygon points="190,296 210,296 200,292"/>
        <rect x="0" y="0" width="0" height="0"/>
        <path d="not a path"/>
        <g/>
      </g>
      <g id="eyes"><circle cx="200" cy="250" r="5" transform="scale(1)"/></g>`);
    expect(f.mouth).toEqual({ x: 185, y: 292, w: 30, h: 18 });
    expect(f.chin![1]).toBeCloseTo(310 + (310 - 250) * 0.45, 6);
    expect(face('<g id="body"><rect x="0" y="0" width="10" height="10"/></g>')).toEqual({});
    // Ağız ve göz çok yakınsa çene en az 6 px aşağıda.
    const close = face('<g id="eyes"><rect x="190" y="200" width="20" height="2"/></g><g id="mouth"><rect x="190" y="200" width="20" height="2"/></g>');
    expect(close.chin).toEqual([200, 208]);
  });

  it("bozuk, sonsuz ve öznitelikleri eksik şekiller sayılmaz; tek tırnaklı öznitelik ve yazı öğesi sorun olmaz", () => {
    const f = face(`
      <defs/>
      <g id='mouth'>
        <path d="Z"/>
        <path d="M0,0 L1e999,5"/>
        <path></path>
        <polygon/>
        <text x="0" y="0">yazı</text>
        <rect x='190' y='300' width='20' height='10'/>
      </g>
      <circle id="eyes" cx="200" cy="250" r="4"/>
      <rect id="belt" x="0" y="500" width="10" height="10"/>`);
    expect(f.mouth).toEqual({ x: 190, y: 300, w: 20, h: 10 });
    // Parça kimliği doğrudan şekilde de olabilir; başka kimlikli şekil sayılmaz.
    expect(f.eyes).toEqual({ x: 196, y: 246, w: 8, h: 8 });
  });

  it("dönüşümler: öteleme, ölçek, dönme, matris; tanınmayanlar ve eksik matris yok sayılır", () => {
    const at = (t: string) => {
      const m = transformOf(t);
      return [m.a, m.b, m.c, m.d, m.tx, m.ty].map((v) => Math.round(v * 1000) / 1000 || 0);
    };
    expect(at("translate(5)")).toEqual([1, 0, 0, 1, 5, 0]);
    expect(at("scale(2)")).toEqual([2, 0, 0, 2, 0, 0]);
    expect(at("scale(2, 3)")).toEqual([2, 0, 0, 3, 0, 0]);
    expect(at("rotate(90)")).toEqual([0, 1, -1, 0, 0, 0]);
    expect(at("rotate(90 10 10)")).toEqual([0, 1, -1, 0, 20, 0]);
    expect(at("matrix(1 0 0 1 7 8)")).toEqual([1, 0, 0, 1, 7, 8]);
    expect(at("matrix(1 0 0)")).toEqual([1, 0, 0, 1, 0, 0]);
    expect(at("skewX(10) translate(1 2)")).toEqual([1, 0, 0, 1, 1, 2]);
    expect(at("")).toEqual([1, 0, 0, 1, 0, 0]);
    expect(at("translate()")).toEqual([1, 0, 0, 1, 0, 0]);
    expect(at("scale()")).toEqual([1, 0, 0, 1, 0, 0]);
    expect(at("rotate()")).toEqual([1, 0, 0, 1, 0, 0]);
  });
});

describe("burun", () => {
  // Gözler 172–188 ve 212–228 (y 152–168), ağız y 205; burun 192–200 (y 158–187), sol gözün iç köşesine 4 px.
  const NOSE = '<path d="M196 158 L192 185 L200 187"/>';
  const draw = (nose: string, eyes = '<circle cx="180" cy="160" r="8"/><circle cx="220" cy="160" r="8"/>', mouth = '<path d="M185 205 L215 205"/>') =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 800"><defs><circle cx="196" cy="170" r="3"/></defs><g id="body"><rect x="120" y="300" width="160" height="220"/></g><g id="head"><circle cx="200" cy="170" r="80"/><g id="brows"><rect x="194" y="150" width="12" height="4"/></g><g id="eyes">${eyes}</g>${nose}<g id="mouth">${mouth}</g></g></svg>`;

  it("başta, göz, kaş ve ağız dışında, gözlerin arasında kalan küçük şekiller; gözlerin burna değmeden kayabileceği boşluk", () => {
    const svg = draw(NOSE);
    const nose = noseOf(svg)!;
    expect(nose.box).toEqual({ x: 192, y: 158, w: 8, h: 29 });
    // Sağa kayan sol göz 4 px'te değer (1 px pay), sola kayan sağ göz 12 px'te.
    expect(nose.room).toEqual({ r: 3, l: 11 });
    expect(svg.slice(nose.from, nose.to)).toBe(NOSE);
    expect(withNose(svg, nose)).toContain(`<g id="nose">${NOSE}</g>`);
  });

  it("burun birkaç ardışık şekil olabilir (burun delikleri); arada başka öğe varsa gruplanamaz", () => {
    const two = `${NOSE} <circle cx="204" cy="186" r="2"/>`;
    const nose = noseOf(draw(two))!;
    expect(nose.box).toEqual({ x: 192, y: 158, w: 14, h: 30 });
    expect(draw(two).slice(nose.from, nose.to)).toBe(two);
    expect(noseOf(draw(`${NOSE}<g id="blush"><rect x="150" y="180" width="8" height="4"/></g><circle cx="204" cy="186" r="2"/>`))).toBeUndefined();
  });

  it("gözlerin altında başlayan burun gözlere değmez; gözlüğün köprüsüyle örtüşen burun gözlerle birlikte kayar", () => {
    expect(noseOf(draw('<path d="M196 175 L192 190"/>'))!.room).toEqual({ r: Infinity, l: Infinity });
    expect(noseOf(draw('<path d="M186 158 L190 185"/>'))!.room.r).toBe(0);
  });

  it("burun yoksa, kapanış etiketli şekilse, çizimde zaten bir burun grubu varsa ya da gözler veya ağız ölçülemiyorsa yok", () => {
    expect(noseOf(draw(""))).toBeUndefined();
    expect(noseOf(draw('<path d="M196 158 L192 185 L200 187"></path>'))).toBeUndefined();
    expect(noseOf(draw(`<g id="nose">${NOSE}</g>`))).toBeUndefined();
    expect(noseOf(draw(NOSE, ""))).toBeUndefined();
    expect(noseOf(draw(NOSE, undefined, ""))).toBeUndefined();
    // Tek göz: iki yana ayrılamaz.
    expect(noseOf(draw(NOSE, '<circle cx="200" cy="160" r="8"/>'))).toBeUndefined();
  });

  it("viewBox'tan iskelet tuvaline çevrilir; grup dönüşümleri sayılır, iskelet parçasınınki ve ölçülemeyen şekiller sayılmaz", () => {
    const svg = `<svg viewBox="0 0 200 400"><g/><desc/><text>x</text><g id="head" transform="translate(999,0)"><g transform="translate(10,0)"><g id="eyes"><circle cx="80" cy="80" r="4"/><circle cx="100" cy="80" r="4"/></g><path d=""/><path id="n" d="M88 79 L86 92 L90 93"/><g id="mouth"><path d="M82 102 L98 102"/></g></g></g></svg>`;
    const nose = noseOf(svg)!;
    // Yarım ölçekli çizim iki kat büyür; sarmalayan grubun kaydırması (10) sayılır, başınki sayılmaz.
    expect(nose.box).toEqual({ x: 192, y: 158, w: 8, h: 28 });
    expect(noseOf(svg.replace(' viewBox="0 0 200 400"', ""))).toBeDefined();
  });

  it("burun gözlerle kayar: boşluk kadar yerinde, aşınca aşan kadar", () => {
    const room = { r: 3, l: 11 };
    expect(noseShift(2, room)).toBe(0);
    expect(noseShift(-10, room)).toBe(0);
    expect(noseShift(11, room)).toBe(8);
    expect(noseShift(-14, room)).toBe(-3);
    expect(noseShift(40, { r: Infinity, l: Infinity })).toBe(0);
  });
});

describe("boyun", () => {
  // Yüz 140–260 × 110–230 (çene 230); boyun 185–215 × 210–290, yüzden önce çizilmiş.
  const NECK = '<rect x="185" y="210" width="30" height="80"/>';
  const draw = (neck: string, face = '<circle cx="200" cy="170" r="60"/>', mouth = '<path d="M185 205 L215 205"/>') =>
    `<svg viewBox="0 0 400 800"><g id="body"><rect x="140" y="270" width="120" height="250"/></g><g id="head">${neck}<ellipse cx="140" cy="170" rx="8" ry="12"/>${face}<g id="eyes"><circle cx="180" cy="160" r="6"/></g><g id="mouth">${mouth}</g></g></svg>`;

  it("başın doğrudan içinde, yüzden önce çizilen, ortada, dar ve çenenin altına uzanan ardışık şekiller", () => {
    const svg = draw(NECK);
    const neck = neckOf(svg)!;
    expect(svg.slice(neck.from, neck.to)).toBe(NECK);
    // Gölgesiyle birlikte (ardışık); kulak (yanda) boyun sayılmaz.
    const shaded = `${NECK} <rect x="203" y="215" width="12" height="70"/>`;
    const two = neckOf(draw(shaded))!;
    expect(draw(shaded).slice(two.from, two.to)).toBe(shaded);
    // Ağzı içine alan daha küçük şekil (sakal) yüz sayılmaz: yüz en büyüğü.
    const bearded = draw(NECK, '<circle cx="200" cy="170" r="60"/><ellipse cx="200" cy="205" rx="25" ry="10"/>');
    expect(bearded.slice(neckOf(bearded)!.from, neckOf(bearded)!.to)).toBe(NECK);
  });

  it("yüzün üstüne çizilen, iç içe grupta duran, kapanış etiketli, arası bölünen ya da ağzı ve yüzü olmayan çizimde yok", () => {
    expect(neckOf(draw("", `<circle cx="200" cy="170" r="60"/>${NECK}`))).toBeUndefined();
    expect(neckOf(draw(`<g transform="translate(0,4)">${NECK}</g>`))).toBeUndefined();
    expect(neckOf(draw('<rect x="185" y="210" width="30" height="80"></rect>'))).toBeUndefined();
    expect(neckOf(draw(`${NECK}<g id="x"><rect x="150" y="150" width="4" height="4"/></g><rect x="203" y="215" width="12" height="70"/>`))).toBeUndefined();
    expect(neckOf(draw(NECK, undefined, ""))).toBeUndefined();
    expect(neckOf(draw(NECK, '<circle cx="200" cy="120" r="20"/>'))).toBeUndefined();
    expect(neckOf(draw(""))).toBeUndefined();
  });
});

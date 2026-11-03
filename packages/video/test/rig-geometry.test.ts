import { describe, expect, it } from "vitest";
import { faceOf, transformOf } from "../src/rigGeometry.ts";

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

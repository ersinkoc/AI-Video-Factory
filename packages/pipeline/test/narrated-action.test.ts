import { VectorShot } from "@ys/core";
import { describe, expect, it } from "vitest";
import { addsNoDefect, NARRATED, narratedActions, withNarratedActions } from "../src/narrated-action.ts";

const CAST = [
  { id: "c1", name: "Charles Babbage", kind: "person" },
  { id: "c2", name: "Joseph Clement", kind: "person" },
  { id: "c3", name: "Sultan Murad II" },
  { id: "c4", name: "Rudolf Diesel", kind: "person" },
  { id: "c5", name: "Eugen Diesel", kind: "person" },
  { id: "c6", name: "Star Seven", kind: "object" },
  // Adında kimseyi tanıtan sözcük yok.
  { id: "c7", name: "dj" },
];
const layer = (asset: string, anims: object[] = [], extra: object = {}) => ({ asset, x: 900, depth: 0.5, anims, ...extra });
const spec = (...layers: object[]) => VectorShot.parse({ layers });
/** Açıklamada kime hangi eylem düşer: katman varlığı → jest. */
const who = (description: string, ...assets: string[]) => {
  const s = spec(...assets.map((a) => layer(a)));
  return Object.fromEntries([...narratedActions(description, s, CAST)].map(([i, g]) => [assets[i], g]));
};

describe("anlatılan eylemin öznesi", () => {
  it("fiilden hemen önce adı geçen kişi; unvan, sıra numarası ve iki kişide ortak ad kimseyi tanıtmaz", () => {
    expect(who("Babbage sketches a column of gears.", "c1", "c2")).toEqual({ c1: "writing" });
    expect(who("Close on Clement reading a column.", "c1", "c2")).toEqual({ c2: "reading" });
    expect(who("Murad nods.", "c3")).toEqual({ c3: "nod" });
    expect(who("Sultan points at the map.", "c3")).toEqual({});
    // "Diesel" ikisinde de var: kimseyi göstermez; ilk adlar gösterir.
    expect(who("Diesel nods.", "c4", "c5")).toEqual({});
    expect(who("Eugen nods.", "c4", "c5")).toEqual({ c5: "nod" });
    // Nesne olarak çizilen kadro üyesi kişi değildir; kadroda olmayan, çekimde olmayan kimse.
    expect(who("Star types.", "c6")).toEqual({});
    expect(who("Babbage types.", "c2")).toEqual({});
  });

  it("edattan sonra gelen ve iyelik eki alan ad özne değil; who önündeki ad öznedir", () => {
    expect(who("An examiner beside Babbage reads the dials.", "c1")).toEqual({});
    expect(who("Babbage's assistant types.", "c1")).toEqual({});
    expect(who("Babbage' typing.", "c1")).toEqual({});
    expect(who("Babbage hands the drawing to Clement, who nods.", "c1", "c2")).toEqual({ c1: "give", c2: "nod" });
    expect(who("A crowd, who nods.", "c1")).toEqual({});
    expect(who("Who nods first?", "c1")).toEqual({});
  });

  it("and/then ve zamir cümlenin son öznesini gösterir; adsız kişi sözcüğü tek kişilik çekimin kişisidir", () => {
    expect(who("Clement walks in and nods.", "c1", "c2")).toEqual({ c2: "nod" });
    expect(who("Clement then writes.", "c2")).toEqual({ c2: "writing" });
    expect(who("A clerk enters, then types.", "c1")).toEqual({});
    // Önceki cümledeki ad bu cümlede yok: zamir tek kişilik çekimin kişisi.
    expect(who("Babbage sits; he writes.", "c1")).toEqual({ c1: "writing" });
    expect(who("Babbage sits; he writes.", "c1", "c2")).toEqual({});
    expect(who("Babbage sits, and he quietly writes.", "c1")).toEqual({ c1: "writing" });
    expect(who("Next to Babbage he writes.", "c1")).toEqual({});
    expect(who("Alone at night, he writes.", "c1")).toEqual({ c1: "writing" });
    expect(who("The student types at a teleprinter.", "c2")).toEqual({ c2: "typing" });
    expect(who("A student types.", "c1", "c2")).toEqual({});
    // Adı geçen biri varken "a colleague" o değildir.
    expect(who("Babbage beside the machines, a colleague nodding.", "c1")).toEqual({});
  });

  it("kişi olmayan ad, which/that ve ad yerine geçen fiil biçimi eylem sayılmaz", () => {
    expect(who("The clock reads four.", "c1")).toEqual({});
    expect(who("Babbage watches as the clock reads four.", "c1")).toEqual({});
    expect(who("A machine, which writes a sentence.", "c1")).toEqual({});
    expect(who("A page that reads PASCAL.", "c1")).toEqual({});
    expect(who("A sheet reading PASCAL.", "c1")).toEqual({});
    expect(who("Babbage under a reading lamp.", "c1")).toEqual({});
    expect(who("Babbage raises his hands the moment it starts.", "c1")).toEqual({});
    expect(who("Babbage lists the types of gears.", "c1")).toEqual({});
    expect(who("Babbage counts the points on the chart.", "c1")).toEqual({});
  });

  it("aradaki yer öbeği atlanır; öbekten sonraki ulaç cümlenin öznesine bağlanır, çekimli fiil bağlanmaz", () => {
    expect(who("Babbage in his study sketches.", "c1")).toEqual({ c1: "writing" });
    expect(who("Babbage at a small desk with a computer writes the plan.", "c1")).toEqual({ c1: "writing" });
    expect(who("Medium shot of Babbage at his desk, typing with a keen look.", "c1")).toEqual({ c1: "typing" });
    expect(who("Babbage and Clement stand by an easel sketching.", "c1", "c2")).toEqual({ c2: "writing" });
    expect(who("Babbage stands by an easel and sketches.", "c1")).toEqual({ c1: "writing" });
    expect(who("A machine in the corner writes.", "c1")).toEqual({});
    expect(who("Babbage stands by an easel, rapidly sketching.", "c1")).toEqual({ c1: "writing" });
    expect(who("Shelves in a quiet room sketching.", "c1")).toEqual({});
  });

  it("cümleler nokta, noktalı virgül ve iki noktayla ayrılır (Node.js bölünmez); kişi başına ilk eylem", () => {
    expect(who("Babbage hands a Node.js box to Clement; Clement nods.", "c1", "c2")).toEqual({ c1: "give", c2: "nod" });
    expect(who("Close-up: Babbage shakes his head. Babbage types.", "c1")).toEqual({ c1: "shake_head" });
    expect(who("Babbage notes down the result.", "c1")).toEqual({ c1: "writing" });
    expect(who("Babbage is taking notes.", "c1")).toEqual({ c1: "writing" });
    expect(who("The clock is reading four.", "c1")).toEqual({});
    expect(who("Babbage pores over the letter.", "c1")).toEqual({ c1: "reading" });
    expect(who("Babbage points to the gear.", "c1")).toEqual({ c1: "point" });
  });
});

describe("anlatılan eylemin plana eklenmesi", () => {
  const add = (description: string, layers: object[], dur = 6) => withNarratedActions(spec(...layers), description, CAST, dur);
  const anims = (s: VectorShot | undefined, i = 0) => s?.layers[i]!.anims.map((a) => [a.type, a.start, a.end]);

  it("genel anlatma jesti aynı aralıkta eyleme döner; kol jesti yoksa eylem bütün çekime verilir", () => {
    expect(anims(add("Babbage types.", [layer("c1", [{ type: "explain", start: 0.2, end: 0.6 }, { type: "talk" }])]))).toEqual([
      ["typing", 0.2, 0.6],
      ["talk", 0, 1],
    ]);
    expect(anims(add("Babbage reads.", [layer("c1", [{ type: "talk" }])]))).toEqual([
      ["talk", 0, 1],
      ["reading", 0, 1],
    ]);
  });

  it("yönetmenin seçtiği başka kol jesti, yürüyüş ya da jestin kendisi varsa dokunulmaz; anlatılan eylem yoksa undefined", () => {
    expect(add("Babbage types.", [layer("c1", [{ type: "point" }])])).toBeUndefined();
    expect(add("Babbage types.", [layer("c1", [{ type: "walk", toX: 1200 }])])).toBeUndefined();
    expect(add("Babbage types.", [layer("c1", [{ type: "typing" }])])).toBeUndefined();
    expect(add("Babbage waits.", [layer("c1")])).toBeUndefined();
  });

  it("uzatma yalnız elinde bir şey tutana", () => {
    expect(add("Babbage hands the drawing to Clement.", [layer("c1"), layer("c2")])).toBeUndefined();
    const given = add("Babbage hands the drawing to Clement.", [layer("c1", [{ type: "explain" }]), layer("c2"), { asset: "p-paper", x: 950, heldBy: 0 }]);
    expect(anims(given)).toEqual([["give", 0, 1]]);
    expect(given!.layers[1]).toEqual(spec(layer("c2")).layers[0]);
  });

  it("baş sallama: titreme hayıra döner; yoksa çekimin ortasında kısa bir süre; başka baş jesti varsa eklenmez", () => {
    expect(anims(add("Babbage shakes his head.", [layer("c1", [{ type: "shake", start: 0.1, end: 0.4 }, { type: "talk" }])]))).toEqual([
      ["shake_head", 0.1, 0.4],
      ["talk", 0, 1],
    ]);
    const half = NARRATED.headSec / 2 / 6;
    expect(anims(add("Babbage nods.", [layer("c1")]))).toEqual([["nod", 0.5 - half, 0.5 + half]]);
    // Baş jestinden kısa çekim: bütün çekim.
    expect(anims(add("Babbage nods.", [layer("c1")], 1))).toEqual([["nod", 0, 1]]);
    expect(add("Babbage nods.", [layer("c1", [{ type: "shake_head" }])])).toBeUndefined();
    expect(anims(add("Babbage nods.", [layer("c1", [{ type: "shake" }])]))).toEqual([
      ["shake", 0, 1],
      ["nod", 0.5 - half, 0.5 + half],
    ]);
  });
});

describe("eklenen eylemin denetimi", () => {
  const issue = (code: string, layer: number | undefined, replan: boolean) => ({ code, layer, replan });

  it("yeni bulgu yoksa ya da yalnız kodun yaptığı ele verme varsa kabul; düşen jest, boşluğu gösteren işaret, yeni kusur reddedilir", () => {
    expect(addsNoDefect([issue("face_cut", 0, true)], [issue("face_cut", 0, true)])).toBe(true);
    expect(addsNoDefect([], [issue("action_without_prop", 0, false)])).toBe(true);
    expect(addsNoDefect([], [issue("action_without_prop", 0, true)])).toBe(false);
    expect(addsNoDefect([], [issue("point_at_nothing", 0, false)])).toBe(false);
    // Aynı bulgunun ikincisi yenidir.
    expect(addsNoDefect([issue("face_cut", undefined, true)], [issue("face_cut", undefined, true), issue("face_cut", undefined, true)])).toBe(false);
    expect(addsNoDefect([issue("pose_snap", 1, false)], [])).toBe(true);
  });
});

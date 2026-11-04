import { VectorLayer, VectorShot } from "@ys/core";
import { describe, expect, it } from "vitest";
import { KEY_PROP, keyPropOf, withKey } from "../src/key-prop.ts";

const layers = (...defs: object[]) => defs.map((d) => VectorLayer.parse({ x: 0, ...d }));
const isProp = (id: string) => id.startsWith("p-");

describe("anlatılan nesne (key): çekim açıklamasından", () => {
  it("adı açıklamada ilk geçen nesne; tekil/çoğul ve renk, boy sözcükleri fark etmez", () => {
    const ls = layers({ asset: "c1" }, { asset: "p-desk" }, { asset: "p-code-sheets", on: 1 }, { asset: "p-big-red-lamp" });
    expect(keyPropOf("Hopper stands beside a desk piled with code sheets, a lamp behind.", ls, isProp)).toBe(2);
    // "lamp" (kimlikteki "big", "red" sayılmaz): ilk geçen; çoğul kimlik tekil sözcüğe de uyar.
    expect(keyPropOf("A lamp glows; one code sheet lies on the desk.", ls, isProp)).toBe(3);
    // Kişi ve hiçbir sözcüğü geçmeyen nesne aday değil.
    expect(keyPropOf("c1 waves at the big red window.", ls, isProp)).toBeUndefined();
    // Kimliğin sonraki sözcüğü açıklamada önce geçebilir; iki harfli sözcük de sayılır ("os" çoğul eki sanılmaz).
    expect(keyPropOf("Music on the sheet.", layers({ asset: "p-sheet-music" }), isProp)).toBe(0);
    expect(keyPropOf("The os boots.", layers({ asset: "p-os" }), isProp)).toBe(0);
    // Aynı nesne iki katmanda: ilk katman.
    expect(keyPropOf("A cup.", layers({ asset: "p-cup" }, { asset: "p-cup" }), isProp)).toBe(0);
  });

  it("elde tutulan önce gelir; üstünde bir şey duran ya da birinin oturduğu yüzey aday değil", () => {
    const ls = layers({ asset: "c1", on: 2 }, { asset: "p-phone", heldBy: 0 }, { asset: "p-chair" }, { asset: "p-table" }, { asset: "p-vase", on: 3 });
    expect(keyPropOf("At the table on a chair, she lifts her phone.", ls, isProp)).toBe(1);
    expect(keyPropOf("A table and a chair.", ls, isProp)).toBeUndefined();
  });

  it(`${KEY_PROP.list} ya da daha çok nesne sayılan çekimde tek bir anlatılan nesne yok (elde tutulan olsa da)`, () => {
    const ls = layers({ asset: "c1" }, { asset: "p-tv" }, { asset: "p-vcr", heldBy: 0 }, { asset: "p-toaster" });
    expect(keyPropOf("Between an old tv, a vcr and a toaster.", ls, isProp)).toBeUndefined();
    expect(keyPropOf("He holds the vcr beside the tv.", ls, isProp)).toBe(2);
  });

  it("yönetmenin geçerli key'i kalır; kişiyi ya da yok bir katmanı gösteren key açıklamadan yeniden çıkarılır ya da kalkar", () => {
    const shot = (extra: object) => VectorShot.parse({ layers: [{ asset: "c1", x: 0 }, { asset: "p-book", x: 0 }, { asset: "p-cup", x: 0 }], ...extra });
    const asked = shot({ key: 2 });
    expect(withKey(asked, "She reads the book.", isProp)).toBe(asked);
    expect(withKey(shot({ key: 0 }), "She reads the book.", isProp).key).toBe(1);
    expect(withKey(shot({ key: 9 }), "She reads the book.", isProp).key).toBe(1);
    expect(withKey(shot({}), "She smiles.", isProp)).not.toHaveProperty("key");
    expect(withKey(shot({ key: 0 }), "She smiles.", isProp)).not.toHaveProperty("key");
  });
});

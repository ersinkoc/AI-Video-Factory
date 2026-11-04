import { VectorShot } from "@ys/core";
import { describe, expect, it } from "vitest";
import { NAME_TAG, nameTags } from "../src/name-tags.ts";

const shot = (people: string[], texts: object[] = []) => ({ vector: VectorShot.parse({ layers: people.map((asset, i) => ({ asset, x: 400 + i * 600, depth: 0.3 })), texts }) });
const label = (text: string) => ({ text, style: "label", x: 0, y: 0 });
const card = (text: string) => ({ text, style: "title", x: 0, y: 0 });
const labels = (s: ReturnType<typeof shot>) => s.vector.texts.filter((t) => t.style === "label").map((t) => t.text);

describe("ad etiketi: gerçek kişi bölümde ilk göründüğü yerde adlandırılır", () => {
  it("hiç etiketi yoksa kadrodaki adı ilk görünüşüne, başının üstüne; sonraki görünüşlere dokunulmaz", () => {
    const shots = [shot(["c2"]), shot(["c1", "c2"]), shot(["c1"])];
    const cast = [{ id: "c1", name: "Grace Hopper", reference: "Grace Hopper" }];
    expect(nameTags(shots, cast)).toBe(1);
    expect(shots[1]!.vector.texts).toEqual([{ text: "Grace Hopper", style: "label", x: 400, y: NAME_TAG.y, anims: [] }]);
    expect(labels(shots[2]!)).toEqual([]);
    // İkinci geçişte (yeniden planlama sonrası) aynı etiket yinelenmez.
    expect(nameTags(shots, cast)).toBe(0);
  });

  it("yönetmenin bölümde o kişi için yazdığı en uzun etiket kopyalanır (bölümün dilinde, unvanlı ad da olur)", () => {
    const shots = [shot(["c1"]), shot(["c1"], [label("Mehmed")]), shot(["c1"], [label("Sultan Mehmed")])];
    expect(nameTags(shots, [{ id: "c1", name: "Sultan Mehmed II", reference: "Mehmed II" }])).toBe(1);
    expect(labels(shots[0]!)).toEqual(["Sultan Mehmed"]);
  });

  it("kadroda başkasına da uyan etiket kopyalanmaz; adı yedek olur", () => {
    const shots = [shot(["c2"]), shot(["c1", "c2"], [label("Diesel")])];
    const cast = [
      { id: "c1", name: "Rudolf Diesel", reference: "Rudolf Diesel" },
      { id: "c2", name: "Martha Diesel", reference: "Martha Diesel" },
    ];
    expect(nameTags(shots, cast)).toBe(1);
    expect(labels(shots[0]!)).toEqual(["Martha Diesel"]);
    // Rudolf ilk göründüğü çekimde "Diesel" etiketiyle zaten adlandırılmış sayılır.
    expect(labels(shots[1]!)).toEqual(["Diesel"]);
  });

  it("çekimde yazı sınırı doluysa sonraki görünüşe; ilk görünüşlerinde yer yoksa ya da zaten adlandırıldıysa eklenmez", () => {
    const full = () => shot(["c1"], [card("1959"), card("New York")]);
    const later = [full(), shot(["c1"]), shot(["c1"])];
    expect(nameTags(later, [{ id: "c1", name: "Jean Sammet", reference: "Jean Sammet" }])).toBe(1);
    expect(labels(later[1]!)).toEqual(["Jean Sammet"]);
    const crowded = [full(), full(), full(), shot(["c1"])];
    expect(nameTags(crowded, [{ id: "c1", name: "Jean Sammet", reference: "Jean Sammet" }])).toBe(0);
    // İkinci görünüşünde yönetmen adlandırmış: ilk görünüşe yer olmasa da eklenmez.
    const named = [full(), shot(["c1"], [label("Sammet")]), shot(["c1"])];
    expect(nameTags(named, [{ id: "c1", name: "Jean Sammet", reference: "Jean Sammet" }])).toBe(0);
    expect(NAME_TAG.within).toBe(3);
  });

  it("gerçek kişi değilse, tek sözcüklü, unvanlı ya da sıra numaralı adın etiketi yoksa, görünmüyorsa eklenmez", () => {
    const shots = [{}, shot(["c1", "c2", "c3", "c4", "c5", "c6"])];
    const cast = [
      { id: "c1", name: "Waiter" },
      { id: "c2", name: "Dartmouth Student" },
      { id: "c3", name: "Einstein", reference: "Albert Einstein" },
      { id: "c4", name: "Emperor Constantine XI", reference: "Constantine XI" },
      { id: "c5", name: "Louis XIV", reference: "Louis XIV" },
      { id: "c6", name: "Star Seven", kind: "object", reference: "Star7" },
      { id: "c7", name: "Ada Lovelace", reference: "Ada Lovelace" },
    ];
    expect(nameTags(shots, cast)).toBe(0);
  });
});

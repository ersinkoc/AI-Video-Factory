import { describe, expect, it } from "vitest";
import { looksLikeObject } from "../src/cast-kind.ts";

describe("kadroda kişi sanılan nesne", () => {
  it("rolü ya da tarifinin başı cihaz/eşya olan ve insan sözcüğü içermeyen oyuncu nesnedir", () => {
    expect(looksLikeObject({ role: "Early handheld prototype device", visualDescription: "Early-1990s PDA: boxy beige body" })).toBe(true);
    expect(looksLikeObject({ role: "The company's famous product", visualDescription: "Beige desktop computers on a row" })).toBe(true);
    // İnsan sözcüğü varsa kişi kalır; tarifin ilk cümlesinden sonraki cihaz adı sayılmaz.
    expect(looksLikeObject({ role: "Engineer who built the device", visualDescription: "Man with glasses" })).toBe(false);
    expect(looksLikeObject({ role: "Java's creator", visualDescription: "Bearded figure in a sweater. Holds a phone." })).toBe(false);
    // Maskot ve robot kişi kalır.
    expect(looksLikeObject({ role: "Java mascot", visualDescription: "Cartoon mascot: wedge-shaped figure" })).toBe(false);
    expect(looksLikeObject({ role: "Helper robot", visualDescription: "A friendly robot with arms" })).toBe(false);
  });
});

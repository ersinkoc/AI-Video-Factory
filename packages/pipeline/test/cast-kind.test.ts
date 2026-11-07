import { describe, expect, it } from "vitest";
import { looksLikeFigure, looksLikeObject } from "../src/cast-kind.ts";

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

  it("nesne sanılan gövdeli figür (robot, android, maskot; ayaklı ya da oturan/yürüyen) kişidir; robot kolu nesne kalır", () => {
    expect(looksLikeFigure({ role: "AI narrator", visualDescription: "Small friendly robot with a square head, thin stick arms and legs" })).toBe(true);
    expect(looksLikeFigure({ role: "Coder", visualDescription: "Small robot with jointed arms. Sits at a desk and types" })).toBe(true);
    expect(looksLikeFigure({ role: "Mascot", visualDescription: "Cartoon mascot walking on two feet" })).toBe(true);
    // Ayaksız sanayi robotu; figür sözcüğü ilk cümlede değil.
    expect(looksLikeFigure({ role: "First industrial robot", visualDescription: "Unimate robot arm bolted to the factory floor" })).toBe(false);
    expect(looksLikeFigure({ role: "Toy", visualDescription: "Wind-up tin box. Shaped like a robot standing" })).toBe(false);
  });
});

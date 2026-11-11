import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { missingWoffGlyphs } from "../src/woff-glyphs.ts";

function woff(sub: Buffer, alter?: (cmap: Buffer) => void, compress = true) {
  const cmap = Buffer.alloc(12);
  cmap.writeUInt16BE(1, 2);
  cmap.writeUInt16BE(3, 4);
  cmap.writeUInt16BE(sub.readUInt16BE(0) === 12 ? 10 : 1, 6);
  cmap.writeUInt32BE(12, 8);
  const source = Buffer.concat([cmap, sub]);
  alter?.(source);
  const compressed = deflateSync(source);
  const packed = compress && compressed.length < source.length ? compressed : source;
  const header = Buffer.alloc(64);
  header.write("wOFF");
  header.writeUInt32BE(64 + packed.length, 8);
  header.writeUInt16BE(1, 12);
  header.write("cmap", 44);
  header.writeUInt32BE(64, 48);
  header.writeUInt32BE(packed.length, 52);
  header.writeUInt32BE(source.length, 56);
  return Buffer.concat([header, packed]);
}
function format4(array = false) {
  const sub = Buffer.alloc(array ? 34 : 32);
  sub.writeUInt16BE(4); sub.writeUInt16BE(sub.length, 2); sub.writeUInt16BE(4, 6);
  sub.writeUInt16BE(0x11e, 14); sub.writeUInt16BE(0xffff, 16);
  sub.writeUInt16BE(0x11e, 20); sub.writeUInt16BE(0xffff, 22);
  sub.writeInt16BE(array ? 0 : 1 - 0x11e, 24); sub.writeInt16BE(1, 26);
  if (array) { sub.writeUInt16BE(4, 28); sub.writeUInt16BE(7, 32); }
  return sub;
}
describe("WOFF Unicode cmap inspection", () => {
  it.each([false, true])("reads cmap4 glyph mappings (array=%s)", (array) => {
    expect(missingWoffGlyphs([woff(format4(array))], "ĞŞĞ \n")).toEqual(["Ş"]);
  });
  it("reads supplementary Unicode cmap12 groups", () => {
    const sub = Buffer.alloc(28);
    sub.writeUInt16BE(12); sub.writeUInt32BE(28, 4); sub.writeUInt32BE(1, 12);
    sub.writeUInt32BE(0x1f642, 16); sub.writeUInt32BE(0x1f642, 20); sub.writeUInt32BE(1, 24);
    expect(missingWoffGlyphs([woff(sub)], "🙂Ğ")).toEqual(["Ğ"]);
  });
  it("rejects corrupt fonts instead of treating them as supported", () => {
    expect(() => missingWoffGlyphs([Buffer.alloc(4)], "Ğ")).toThrow("Invalid WOFF");
    const broken = woff(format4()); broken.writeUInt32BE(999999, 48);
    expect(() => missingWoffGlyphs([broken], "Ğ")).toThrow("bounds");
    const malformed = format4(); malformed.writeUInt16BE(3000, 6);
    expect(() => missingWoffGlyphs([woff(malformed)], "Ğ")).toThrow("segments");
  });
  it("validates table directories and rejects unsupported character maps", () => {
    const truncated = woff(format4()); truncated.writeUInt16BE(20, 12);
    expect(() => missingWoffGlyphs([truncated], "Ğ")).toThrow("table directory");
    const absent = woff(format4()); absent.write("name", 44);
    expect(() => missingWoffGlyphs([absent], "Ğ")).toThrow("no cmap");
    for (const [platform, encoding] of [[1, 0], [3, 2]]) expect(() => missingWoffGlyphs([woff(format4(), (cmap) => { cmap.writeUInt16BE(platform!, 4); cmap.writeUInt16BE(encoding!, 6); })], "Ğ")).toThrow("No supported Unicode cmap");
    expect(missingWoffGlyphs([woff(format4(), (cmap) => cmap.writeUInt16BE(0, 4), false)], "Ğ🙂")).toEqual(["🙂"]);
    const unknown = format4(); unknown.writeUInt16BE(6);
    expect(() => missingWoffGlyphs([woff(unknown)], "Ğ")).toThrow("No supported Unicode cmap");
    expect(() => missingWoffGlyphs([], "Ğ")).toThrow("No supported Unicode cmap");
  });
  it("rejects truncated cmap headers, lengths, offsets and glyph arrays", () => {
    expect(() => missingWoffGlyphs([woff(format4(), (cmap) => cmap.writeUInt16BE(100, 2))], "Ğ")).toThrow("cmap directory");
    expect(() => missingWoffGlyphs([woff(format4(), (cmap) => cmap.writeUInt32BE(100000, 8))], "Ğ")).toThrow("cmap offset");
    for (const size of [8, 1000]) { const sub = format4(); sub.writeUInt16BE(size, 2); expect(() => missingWoffGlyphs([woff(sub)], "Ğ")).toThrow("cmap length"); }
    const short12 = Buffer.alloc(4); short12.writeUInt16BE(12);
    expect(() => missingWoffGlyphs([woff(short12)], "Ğ")).toThrow("cmap12");
    const groups = Buffer.alloc(16); groups.writeUInt16BE(12); groups.writeUInt32BE(16, 4); groups.writeUInt32BE(2, 12);
    expect(() => missingWoffGlyphs([woff(groups)], "Ğ")).toThrow("cmap12 groups");
    const invalidGlyph = format4(true); invalidGlyph.writeUInt16BE(100, 28);
    expect(() => missingWoffGlyphs([woff(invalidGlyph)], "Ğ")).toThrow("glyph offset");
    const zeroGlyph = format4(true); zeroGlyph.writeUInt16BE(0, 32);
    expect(missingWoffGlyphs([woff(zeroGlyph)], "Ğ")).toEqual(["Ğ"]);
    const zeroDelta = format4(); zeroDelta.writeInt16BE(-0x11e, 24);
    expect(missingWoffGlyphs([woff(zeroDelta)], "Ğ")).toEqual(["Ğ"]);
    const zeroMap = Buffer.alloc(3); zeroMap.writeUInt16BE(4);
    expect(() => missingWoffGlyphs([woff(zeroMap, (cmap) => cmap.writeUInt16BE(0, 2))], "Ğ")).toThrow("No supported Unicode cmap");
  });
});

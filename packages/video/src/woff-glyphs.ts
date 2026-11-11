import { inflateSync } from "node:zlib";

/** Read the Unicode cmap of the exact WOFF1 assets we stage, rather than infer glyphs from a family name. */
export function missingWoffGlyphs(fonts: Uint8Array[], text: string): string[] {
  const subtables: Buffer[] = [];
  for (const bytes of fonts) {
    const font = Buffer.from(bytes);
    if (font.length < 44 || font.toString("ascii", 0, 4) !== "wOFF" || font.readUInt32BE(8) !== font.length) throw new Error("Invalid WOFF1 font.");
    const count = font.readUInt16BE(12);
    if (44 + count * 20 > font.length) throw new Error("Truncated WOFF table directory.");
    let found = false;
    for (let i = 0; i < count; i++) {
      const entry = 44 + i * 20;
      if (font.toString("ascii", entry, entry + 4) !== "cmap") continue;
      found = true;
      const offset = font.readUInt32BE(entry + 4);
      const length = font.readUInt32BE(entry + 8);
      const original = font.readUInt32BE(entry + 12);
      if (!length || length > original || original > 1024 * 1024 || offset + length > font.length) throw new Error("Invalid WOFF cmap bounds.");
      const packed = font.subarray(offset, offset + length);
      const cmap = length === original ? packed : inflateSync(packed, { maxOutputLength: original });
      if (cmap.length !== original || cmap.length < 4 || 4 + cmap.readUInt16BE(2) * 8 > cmap.length) throw new Error("Truncated cmap directory.");
      for (let j = 0; j < cmap.readUInt16BE(2); j++) {
        const record = 4 + j * 8;
        const platform = cmap.readUInt16BE(record);
        const encoding = cmap.readUInt16BE(record + 2);
        if (platform !== 0 && !(platform === 3 && (encoding === 1 || encoding === 10))) continue;
        const start = cmap.readUInt32BE(record + 4);
        if (start + 4 > cmap.length) throw new Error("Invalid cmap offset.");
        const format = cmap.readUInt16BE(start);
        if (format !== 4 && format !== 12) continue;
        if (format === 12 && start + 16 > cmap.length) throw new Error("Truncated cmap12.");
        const size = format === 4 ? cmap.readUInt16BE(start + 2) : cmap.readUInt32BE(start + 4);
        if (size < 16 || start + size > cmap.length) throw new Error("Invalid cmap length.");
        const sub = cmap.subarray(start, start + size);
        if (format === 4) {
          const segments = sub.readUInt16BE(6) / 2;
          if (!Number.isInteger(segments) || !segments || 16 + segments * 8 > size) throw new Error("Invalid cmap4 segments.");
        } else if (16 + sub.readUInt32BE(12) * 12 > size) throw new Error("Invalid cmap12 groups.");
        subtables.push(sub);
      }
    }
    if (!found) throw new Error("WOFF font has no cmap.");
  }
  if (!subtables.length) throw new Error("No supported Unicode cmap in fonts.");
  const has = (cp: number, sub: Buffer) => {
    if (sub.readUInt16BE(0) === 12) {
      for (let i = 0; i < sub.readUInt32BE(12); i++) {
        const row = 16 + i * 12;
        if (cp >= sub.readUInt32BE(row) && cp <= sub.readUInt32BE(row + 4)) return sub.readUInt32BE(row + 8) + cp - sub.readUInt32BE(row) !== 0;
      }
      return false;
    }
    if (cp > 0xffff) return false;
    const n = sub.readUInt16BE(6) / 2;
    for (let i = 0; i < n; i++) {
      if (cp > sub.readUInt16BE(14 + i * 2) || cp < sub.readUInt16BE(16 + n * 2 + i * 2)) continue;
      const delta = sub.readInt16BE(16 + n * 4 + i * 2);
      const address = 16 + n * 6 + i * 2;
      const range = sub.readUInt16BE(address);
      if (!range) return ((cp + delta) & 0xffff) !== 0;
      const glyphAt = address + range + (cp - sub.readUInt16BE(16 + n * 2 + i * 2)) * 2;
      if (glyphAt + 2 > sub.length) throw new Error("Invalid cmap4 glyph offset.");
      const glyph = sub.readUInt16BE(glyphAt);
      return glyph !== 0 && ((glyph + delta) & 0xffff) !== 0;
    }
    return false;
  };
  return [...new Set([...text.normalize("NFC")].filter((ch) => !/\s/u.test(ch) && !subtables.some((sub) => has(ch.codePointAt(0)!, sub))))];
}

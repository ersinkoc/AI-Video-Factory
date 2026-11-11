/** Small-frame image registration for advisory render QA, independent of the renderer's animation plan. */
export interface MotionSample {
  /** Mean absolute luma change, in 0–255 units. */
  change: number;
  /** Strongest local tile change after fitting the background's translation/scale. */
  localChange: number;
  shiftX: number;
  shiftY: number;
  scale: number;
  /** A flat background cannot establish whether a camera or a subject moved. */
  reliable: boolean;
}

export function measureFrameMotion(previous: Uint8Array, current: Uint8Array, width: number, height: number): MotionSample {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 24 || height < 24 || previous.length !== width * height || current.length !== previous.length) {
    throw new Error("Motion samples must be equally sized grayscale frames of at least 24 × 24 pixels.");
  }
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  // Register against an outer ring, so an independently moving central hero does not become the camera.
  const points: number[] = [];
  let edgeEnergy = 0;
  for (let y = 6; y < height - 6; y += 3) {
    for (let x = 6; x < width - 6; x += 3) {
      if (x > width * 0.28 && x < width * 0.72 && y > height * 0.28 && y < height * 0.72) continue;
      const i = y * width + x;
      points.push(i);
      edgeEnergy += Math.abs(previous[i]! - previous[i - 1]!) + Math.abs(previous[i]! - previous[i - width]!);
    }
  }
  const reliable = edgeEnergy / points.length > 6;
  let best = Infinity;
  let shiftX = 0;
  let shiftY = 0;
  let scale = 1;
  // Identity first: ambiguous textures should not invent a camera move.
  const shifts = [0, -1, 1, -2, 2, -3, 3, -4, 4];
  for (const zoom of reliable ? [1, 0.98, 1.02, 0.96, 1.04] : [1]) {
    for (const dy of reliable ? shifts : [0]) {
      for (const dx of reliable ? shifts : [0]) {
        let error = 0;
        for (const i of points) {
          const x = i % width;
          const y = Math.floor(i / width);
          const px = Math.round((x - cx - dx) / zoom + cx);
          const py = Math.round((y - cy - dy) / zoom + cy);
          if (px < 0 || px >= width || py < 0 || py >= height) { error = Infinity; break; }
          error += Math.abs(current[i]! - previous[py * width + px]!);
        }
        if (error < best) {
          best = error;
          shiftX = dx;
          shiftY = dy;
          scale = zoom;
        }
      }
    }
  }
  const tiles = Array.from({ length: 12 }, () => ({ sum: 0, count: 0 }));
  let raw = 0;
  let count = 0;
  for (let y = 6; y < height - 6; y++) {
    for (let x = 6; x < width - 6; x++) {
      const i = y * width + x;
      const px = Math.round((x - cx - shiftX) / scale + cx);
      const py = Math.round((y - cy - shiftY) / scale + cy);
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const tile = tiles[Math.min(2, Math.floor(y * 3 / height)) * 4 + Math.min(3, Math.floor(x * 4 / width))]!;
      tile.sum += Math.abs(current[i]! - previous[py * width + px]!);
      tile.count++;
      raw += Math.abs(current[i]! - previous[i]!);
      count++;
    }
  }
  return { change: raw / count, localChange: Math.max(...tiles.filter((t) => t.count).map((t) => t.sum / t.count)), shiftX, shiftY, scale, reliable };
}

import { Euler, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { GLOBE_SETTLE, globeRotation, globeView, HALO, HALO_EDGE, overlayProgress } from "../src/globe.ts";

/** three'nin SphereGeometry'sinde eşdikdörtgen dokunun (lon, lat) noktası (birim küre). */
function onSphere(lon: number, lat: number): Vector3 {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const theta = ((90 - lat) / 180) * Math.PI;
  return new Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
}

describe("3D küre matematiği", () => {
  it("dönüş, bakılan noktayı kameraya (+Z) getirir ve kuzeyi yukarıda tutar", () => {
    for (const [lon, lat] of [
      [35, 39],
      [-74, 40.7],
      [139.7, 35.7],
      [-58, -34],
      [0, 0],
    ] as const) {
      const r = globeRotation(lon, lat);
      const e = new Euler(r.x, r.y, 0);
      const front = onSphere(lon, lat).applyEuler(e);
      expect(front.x).toBeCloseTo(0, 6);
      expect(front.y).toBeCloseTo(0, 6);
      expect(front.z).toBeCloseTo(1, 6);
      // Aynı boylamda biraz kuzeydeki nokta ekranda tam yukarıda (d3 ortografik görünümüyle aynı yön).
      const north = onSphere(lon, lat + 5).applyEuler(e);
      expect(north.x).toBeCloseTo(0, 6);
      expect(north.y).toBeGreaterThan(0);
      // Doğudaki nokta sağda.
      expect(onSphere(lon + 5, lat).applyEuler(e).x).toBeGreaterThan(0);
    }
  });

  it("küre doğudan ve güneyden dönerek gelir, yerine oturunca hedefte durur", () => {
    expect(globeView(35, 39, 0)).toEqual({ lon: 75, lat: 27 });
    const mid = globeView(35, 39, GLOBE_SETTLE / 2);
    expect(mid.lon).toBeGreaterThan(35);
    expect(mid.lon).toBeLessThan(75);
    expect(globeView(35, 39, GLOBE_SETTLE)).toEqual({ lon: 35, lat: 39 });
    expect(globeView(35, 39, 1)).toEqual({ lon: 35, lat: 39 });
    // Güney kutbu yakınında bakış kutbun ötesine taşmaz.
    expect(globeView(0, -75, 0).lat).toBe(-80);
  });

  it("harita katmanı küre durduktan sonra baştan oynar", () => {
    expect(overlayProgress(0)).toBe(0);
    expect(overlayProgress(GLOBE_SETTLE)).toBe(0);
    expect(overlayProgress((1 + GLOBE_SETTLE) / 2)).toBeCloseTo(0.5);
    expect(overlayProgress(1)).toBe(1);
  });

  it("atmosfer kabuğunun iç kenarı küre yüzeyine değer", () => {
    // Kabuk üstünde, ekranda küre yarıçapı uzaklığındaki noktanın normal z'si.
    expect(Math.sqrt(1 - (1 / HALO) ** 2)).toBeCloseTo(HALO_EDGE);
    expect(HALO_EDGE).toBeGreaterThan(0.3);
    expect(HALO_EDGE).toBeLessThan(0.45);
  });
});

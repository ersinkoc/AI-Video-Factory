import { baseBackgroundId, VectorLayer, type PlacedLayer, type Timeline, type VectorAsset, type VectorShot } from "@ys/core";
import { visualVector } from "./entrance.ts";
import { lintShot, type LintIssue } from "./lint.ts";
import { coverIn, gridFor, shapesOf } from "./screen.ts";
import { shotModel, viewAt, type ShotModel } from "./Vector.tsx";

/**
 * Set eşyası yerleşimi (5 Kas, kullanıcının seçimi "oda başına set eşyası"; en yeni incelemelerde çekimlerin %37'sinde
 * "boş" notu: çıplak duvar, boş zemin, tek kişi ve bir iki nesne). Mekânın set eşyaları (set düzenleyicinin seçtiği,
 * çizilmiş ve kapıdan geçmiş) o mekânın geniş ve orta çekimlerinde odanın dibine (depth) konur. Yalnız yere basan ve en
 * az minHeight m olan eşya kullanılır (taşınabilir nesne sayılıp ele alınmasın, staging PORTABLE_M). Odanın parçasıdır
 * (TimelineVisual.dressing): kadraj onlarsız kurulur, kuruluşta ayrıca belirmez.
 *
 * Süreklilik: eşyanın yeri bir kez seçilir ve değişmez. Yalnız seyrek bir karede (yönetmenin en çok sparse katmanı: tek
 * kişi ve bir iki nesne; dolu kareye eşya kalabalık yapar) ilk kez konur; slots sırayla denenir ve şu ilk yer tutar: kişinin
 * kol payıyla genişletilmiş kutusuyla (reach; anlatan el rafa değip onu gösteriyor gibi okunmasın), duvarda ya da havada duran
 * bir nesneyle (grafik, balon, ekran; önde de olsa) ve odanın kendi çizimindeki eşya boyu bir şekille (fixture: pencere,
 * raf, buzdolabı; eşya duvarın çıplak yerine) çakışmayan, kadrajda çekimin başında ve sonunda en az visible'ı görünen ve
 * kadraj yüksekliğinin en çok tall'ı olan (kadrajı dolduran dev eşya olmasın). 5 Kas, kütüphanedeki mobilyalarla kareler: bu kurallar olmadan raflar grafiğin ve
 * balonun arkasını doldurdu, bir buzdolabının önüne kondu, anlatan kişi rafı gösteriyor gibi göründü. Sonraki çekimlerde yalnız o
 * yerde durur: kadraj başka yere bakıyorsa görünmez, önünde biri duruyorsa onun arkasında kalır; orada duramıyorsa o
 * çekimde konmaz, başka yere taşınmaz (raf çekimden çekime yer değiştirmesin); kadrajın kenarında sliver'ından az görünecekse
 * de konmaz (ince şerit hata gibi okunur). Ters açı (`~rev`) odanın öbür duvarıdır:
 * bir duvara konan eşya karşı duvarda görünmez, henüz konmamış eşya oraya konabilir.
 *
 * Eşya hiçbir şeyi bozmuyorsa konur (kamera onu görmediği için kadraj zaten aynı kalır): öbür katmanların yeri ve boyu aynı,
 * arkasında kalan bir katmanı (duvardaki tahta, pencere, öbür eşya) ya da önde de olsa duvarda/havada duran bir nesneyi
 * kendi alanının overlap'inden çok örtmüyor, öndeki nesnelerin ardında hidden'ından çoğu kaybolmuyor ve denetim (lintShot) yeni
 * bir kusur bulmuyor. Çekim başına en çok perShot eşya. Yönetmenin yakın çekimi (zoom ≥ close), Manim tahtalı, figüranlı ve haritalı
 * çekim döşenmez.
 */
export const SET = {
  depth: 0.9,
  minHeight: 0.9,
  perShot: 2,
  sparse: 3,
  visible: 0.6,
  sliver: 0.25,
  hidden: 0.7,
  tall: 0.85,
  overlap: 0.04,
  reach: 0.25,
  /** Arka plan çiziminin eşya boyu şekli (sahne px'inin kesri): en az h yüksek, w aralığında geniş, altı low'dan aşağıda; cover'ından çoğu örtülmez. */
  fixture: { h: 0.15, w: [0.03, 0.35], low: 0.2, cover: 0.2 },
  close: 1.5,
  slots: [0.1, 0.9, 0.24, 0.76, 0.38, 0.62],
} as const;

type Assets = Record<string, VectorAsset>;
type TimelineVisual = Timeline["visuals"][number];
type Box = { x: number; y: number; w: number; h: number };

const boxOf = (pl: { x: number; y: number; width: number; height: number }): Box => ({ x: pl.x - pl.width / 2, y: pl.y - pl.height, w: pl.width, h: pl.height });
const meet = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const near = (a: number, b: number) => Math.abs(a - b) < 0.5;

const fixtures = new WeakMap<VectorAsset, Box[]>();

/** Odanın kendi çizimindeki eşya boyu şekiller, sahne px'inde (arka plan sahneyi "slice" ile doldurur); varlık başına önbellekli. */
export function fixturesOf(bg: VectorAsset): Box[] {
  const known = fixtures.get(bg);
  if (known) return known;
  const found = shapesOf(bg.svg);
  const out: Box[] = [];
  if (found) {
    const [vx, vy, vw, vh] = found.vb;
    const s = Math.max(1920 / vw, 1080 / vh);
    const [ox, oy] = [(1920 - vw * s) / 2, (1080 - vh * s) / 2];
    const { h, w, low } = SET.fixture;
    for (const sh of found.shapes) {
      const b = { x: ox + (sh.x - vx) * s, y: oy + (sh.y - vy) * s, w: sh.w * s, h: sh.h * s };
      if (b.h >= h * 1080 && b.w >= w[0] * 1920 && b.w <= w[1] * 1920 && b.y + b.h > low * 1080) out.push(b);
    }
  }
  fixtures.set(bg, out);
  return out;
}

/** Denetimin bulguları: sonrakinin her bulgusu öncekinde de var mı (kod, katman ve yeniden plan aynı). */
function noNewIssues(before: LintIssue[], after: LintIssue[]): boolean {
  const left = before.map((i) => `${i.code}|${i.layer}|${i.replan}`);
  return after.every((i) => {
    const at = left.indexOf(`${i.code}|${i.layer}|${i.replan}`);
    if (at < 0) return false;
    left.splice(at, 1);
    return true;
  });
}

const modelOf = (visual: TimelineVisual, assets: Assets, fps: number): ShotModel =>
  shotModel(visualVector(visual, assets, fps)!, assets, "outline", 1920, 1080, Boolean(visual.overlay), visual.durationInFrames / fps, visual.dressing);

/**
 * Eşya çekimi bozmadan bu yerde durabilir mi (öbür katmanlar, arkasında kalanlar). room: ilk konuşunda odanın çizili eşya
 * boyu şekilleri; o zaman kişiye, duvar/hava nesnesine ve onlara çakışmaması ve kadrajda görünmesi de istenir.
 */
function fits(assets: Assets, before: ShotModel, after: ShotModel, index: number, room?: Box[]): boolean {
  const moved = before.placed.some((p) => {
    const q = after.placed.find((o) => o.index === p.index);
    return !q || !near(p.x, q.x) || !near(p.y, q.y) || !near(p.width, q.width) || !near(p.height, q.height) || p.sitting !== q.sitting;
  });
  const piece = after.placed.find((p) => p.index === index);
  if (moved || !piece) return false;
  const box = boxOf(piece);
  const area = box.w * box.h;
  const others = after.placed.filter((p) => p.index !== index);
  const kind = (i: number) => after.safe[after.spec.layers[i]!.asset]?.kind;
  // Arkasında kalan (önce çizilen) katmanı örtmesin: dizini en büyük, aynı z'de de önde çizilir. Duvarda ya da havada duran
  // nesnenin (grafik, balon, ekran) arkası önde de olsa doldurulmaz: anlatılan nesne eşyanın önünde okunmaz olurdu.
  const covers = (p: PlacedLayer) => meet(box, boxOf(p)) > SET.overlap * p.width * p.height;
  if (others.some((p) => covers(p) && (p.z <= piece.z || (kind(p.index) === "prop" && !p.grounded)))) return false;
  // Öndeki nesnelerin (masa, makine, yönetmenin rafı) neredeyse tamamen arkasında kalan eşyanın yalnız yanından bir şerit görünür.
  // Kutu değil çizimin dolu yeri sayılır (gridFor): uçağın telleri ve kanatlarının arası boştur. Varlık başına önbellek özgün varlıkta.
  const hidden = others.reduce((n, p) => {
    const layer = after.spec.layers[p.index]!;
    const grid = p.z > piece.z && kind(p.index) === "prop" ? gridFor(assets[layer.asset]!) : undefined;
    return n + (grid ? coverIn(grid, boxOf(p), layer.flip, box) : 0);
  }, 0);
  if (hidden > SET.hidden) return false;
  const views = [0, 1].map((k) => viewAt(after.cam, k, after.centre));
  const seen = views.map((v) => meet(box, { x: v.x0, y: v.y0, w: v.w, h: v.h }) / area);
  // Yerinde duran eşya kadrajın kenarında ince bir şerit olarak görünmez (kişinin kenardaki dilimi gibi): o çekimde konmaz.
  if (!room) return seen.every((q) => q === 0 || q >= SET.sliver);
  const reach = (p: PlacedLayer): Box => ({ ...boxOf(p), x: p.x - p.width * (0.5 + SET.reach), w: p.width * (1 + 2 * SET.reach) });
  if (others.some((p) => kind(p.index) === "character" && meet(box, reach(p)) > SET.overlap * area)) return false;
  if (room.some((f) => meet(box, f) > SET.fixture.cover * f.w * f.h)) return false;
  return views.every((v, i) => box.h <= SET.tall * v.h && seen[i]! >= SET.visible);
}

/** Çekim döşenebilir mi: mekânlı, haritasız, yakın çekim değil, tahtasız ve figüransız vektör çekim. */
function dressable(visual: TimelineVisual, assets: Assets): visual is TimelineVisual & { vector: VectorShot & { background: string } } {
  const v = visual.vector;
  if (!v?.background || !assets[v.background] || assets[v.background]!.meta.exact || visual.overlay || v.crowd) return false;
  return Math.max(v.camera.zoomFrom, v.camera.zoomTo) < SET.close;
}

/**
 * Zaman çizelgesinin vektör çekimlerine mekânlarının set eşyaları. sets: mekân → eşya kimlikleri (çizilmiş olanlar);
 * çekimin mekânı ters açıysa (`~rev`) asıl mekânın eşyaları. Eşyalar katmanların sonuna eklenir (dizinler değişmez),
 * kimlikleri `dressing`e yazılır.
 */
export function dressVisuals(visuals: TimelineVisual[], assets: Assets, sets: Record<string, string[]>, fps: number): TimelineVisual[] {
  // Mekân → eşya → yeri: hangi duvarda (çekimin arka planı; ters açı öbür duvar) ve x.
  const memory = new Map<string, Map<string, { view: string; x: number }>>();
  return visuals.map((visual) => {
    if (!dressable(visual, assets)) return visual;
    const view = visual.vector.background;
    const room = baseBackgroundId(view);
    const spots = memory.get(room) ?? new Map<string, { view: string; x: number }>();
    memory.set(room, spots);
    const pieces = (sets[room] ?? []).filter((id) => {
      const a = assets[id];
      const usable = a?.kind === "prop" && a.meta.grounded === true && (a.meta.realHeight ?? 0) >= SET.minHeight;
      return usable && !visual.vector.layers.some((l) => l.asset === id) && (spots.get(id)?.view ?? view) === view;
    });
    if (!pieces.length) return visual;
    let current = visual;
    let model = modelOf(current, assets, fps);
    let issues = lintShot(current, assets, { fps });
    let added = 0;
    // İlk yer yalnız seyrek karede seçilir (yönetmenin katmanları; eklenen eşyalar sayılmaz).
    const bare = visual.vector.layers.length <= SET.sparse ? fixturesOf(assets[view]!) : undefined;
    for (const id of pieces) {
      if (added >= SET.perShot) break;
      const spot = spots.get(id);
      const taken = new Set([...spots].filter(([other, s]) => other !== id && s.view === view).map(([, s]) => s.x));
      const xs = spot ? [spot.x] : bare ? SET.slots.map((s) => s * 1920).filter((x) => !taken.has(x)) : [];
      for (const x of xs) {
        const layer = VectorLayer.parse({ asset: id, x, depth: SET.depth });
        const next = { ...current, vector: { ...current.vector, layers: [...current.vector.layers, layer] }, dressing: [...(current.dressing ?? []), id] };
        const after = modelOf(next, assets, fps);
        if (!fits(assets, model, after, current.vector.layers.length, spot ? undefined : bare)) continue;
        const found = lintShot(next, assets, { fps });
        if (!noNewIssues(issues, found)) continue;
        current = next;
        model = after;
        issues = found;
        spots.set(id, { view, x });
        added++;
        break;
      }
    }
    return current;
  });
}

import { RIG, type PlacedLayer, type Timeline, type VectorAnim } from "@ys/core";
import { visualVector } from "./entrance.ts";
import { FAST_GESTURES } from "./motion.ts";
import { coverIn, gridFor } from "./screen.ts";
import type { StagingCode } from "./staging.ts";
import { cameraPoint, faceBox, shotFrame, shotModel, textBoxOf, type Motion, type ShotFrame, type ShotModel } from "./Vector.tsx";

/**
 * Çekim denetimi (3 Kas, kullanıcı: "SVG ve animasyonda sıfır hata, anlamsız hata olmasın; gerekirse sahneyi yeniden
 * kur"): render'ın kullandığı aynı kurgu (shotModel) ve kareler (shotFrame) üzerinde, kodla ölçülebilen nesnel hatalar
 * aranır. Model çağrısı yok, ücretsiz; üretim render'dan önce çalıştırır, bulunanı kodla düzeltir ya da sahneyi
 * yeniden planlatır. Yalnız izleyicinin "bu yanlış" diyeceği şeyler: kesilmiş yüz, örtülen yüz, yüzdeki yazı, boşluğu
 * gösteren el, nesnesiz iş jesti, çakışan kol jestleri, karede sıçrayan eklem, insanın yapamayacağı eklem açısı,
 * birbirinin içinden geçen kişiler, hiçbir şeyin görünmediği kadraj, planlanıp çizilemediği için sessizce düşen nesne.
 */

type Visual = Timeline["visuals"][number];
type Assets = Timeline["vectorAssets"];

export type LintCode = StagingCode | "face_cut" | "face_covered" | "text_on_face" | "pose_snap" | "anatomy" | "walk_through" | "empty_frame" | "missing_asset";

export interface LintIssue {
  code: LintCode;
  shotId: string;
  /** İlgili katman (kişi). */
  layer?: number;
  /** İlk görüldüğü kare. */
  frame?: number;
  detail: string;
  /**
   * İzleyici bunu görür ya da anlatılan şey gösterilemiyor: sahne yeniden planlanmalı. false: render kodla, anlamı koruyarak
   * düzeltti (yönetmene yalnız ders olarak söylenir).
   */
  replan: boolean;
}

/** Eşikler (ekran px'i 1920×1080; oranlar kutu alanına göre). */
export const LINT = {
  /** Kaç karede bir bakılır (sıçrama için her bakışta bir sonraki kare de). */
  step: 3,
  /** Yüzün bu kesri ile tamamı arasında kadrajda kalan yüz "yarım"dır (hiç görünmeyen yüz kusur değil). */
  faceVisible: [0.08, 0.7],
  /**
   * Yarım yüz kusurdur: çekimin başında ya da sonunda (durağan kadraj) ya da bakılan karelerin bu kesrinden fazlasında.
   * Kamera yaklaşırken bir yüzün kadrajın kenarından geçip çıkması olağandır.
   */
  faceCutShare: 1 / 3,
  /** Yüzün bu kesrinden fazlası önde çizilen bir şeyin altında kalırsa örtülmüştür. */
  faceCovered: 0.4,
  /** Yazı kutusu yüzün bu kesrinden fazlasını örterse. */
  textOnFace: 0.25,
  /** Ardışık iki karede bir eklemin dönüşü bundan fazla değişirse (derece): sıçrama. */
  snapDeg: 25,
  /** Aynı derinlikteki iki kişinin ortaları bu kadar yaklaşırsa (gövde genişliklerinin toplamının kesri) iç içe geçer. */
  through: 0.18,
  /**
   * Ortadaki karede görünen katmanların kadrajın bu kesrinden azını kaplaması: boş kadraj (planlanan her şey kadraj
   * dışında ya da saydam). Odada tek kişinin durduğu geniş çekim olağan kompozisyondur (arka plan sahneyi doldurur):
   * ilk denetimde %12 eşiği 923 çekimin 139'unu işaretliyordu, gerçek hata yalnız birkaç tanesiydi.
   */
  emptyBelow: 0.02,
} as const;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const area = (b: Box) => Math.max(0, b.w) * Math.max(0, b.h);
const overlap = (a: Box, b: Box): number => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};
const SCREEN: Box = { x: 0, y: 0, w: 1920, h: 1080 };
/** İki kutunun kesişimi (kesişmiyorsa boş kutu). */
const clip = (a: Box, b: Box): Box => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) };
};

const activeAt = (a: VectorAnim, p: number) => p >= a.start && p <= a.end;
/** Yer değiştiren animasyonlar: sürerken kişi kadraja girip çıkar, birinin önünden geçer (örtülmesi olağan). */
const TRAVEL = new Set<VectorAnim["type"]>(["walk", "slide_in", "move"]);

/** Katmanın ekrandaki kutusu (kişide gövde: tuvalin ortadaki yarısı; nesnede çizim kutusunun %90'ı). */
function screenBox(m: ShotModel, f: ShotFrame, pl: PlacedLayer, person: boolean): Box {
  const at = f.drawnAt.get(pl.index)!;
  const tr = f.motions.get(pl.index)!.tr;
  const w = at.width * tr.scale * (person ? 0.5 : 0.9);
  const h = at.height * tr.scale * (person ? 0.9 : 0.9);
  const [x0, y0] = cameraPoint(m.cam, f.k, m.centre, [at.x + tr.x - w / 2, at.y + tr.y - h]);
  const [x1, y1] = cameraPoint(m.cam, f.k, m.centre, [at.x + tr.x + w / 2, at.y + tr.y]);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * Nesnenin çiziminin ekrandaki bir bölgeyi gerçekten örttüğü pay (gridFor: dolgulu şekillerin hücreleri; çizim katman
 * kutusuna "meet" ile oturur, aynalı katmanda ızgara da aynalanır). Ölçülemeyen çizimde undefined: kutu sayılır.
 */
function drawingCover(m: ShotModel, f: ShotFrame, pl: PlacedLayer): ((r: Box) => number) | undefined {
  const layer = m.spec.layers[pl.index]!;
  const grid = gridFor(m.safe[layer.asset]!);
  if (!grid) return undefined;
  const at = f.drawnAt.get(pl.index)!;
  const tr = f.motions.get(pl.index)!.tr;
  const [w, h] = [at.width * tr.scale, at.height * tr.scale];
  const [x0, y0] = cameraPoint(m.cam, f.k, m.centre, [at.x + tr.x - w / 2, at.y + tr.y - h]);
  const [x1, y1] = cameraPoint(m.cam, f.k, m.centre, [at.x + tr.x + w / 2, at.y + tr.y]);
  const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  return (r) => coverIn(grid, box, layer.flip, r);
}

/** Bir çekimin bütün nesnel hataları (her tür ve katman için bir kez, ilk görüldüğü kareyle). */
export function lintShot(visual: Visual, assets: Assets, o: { fps?: number; step?: number } = {}): LintIssue[] {
  if (!visual.vector) return [];
  const fps = o.fps ?? 30;
  const step = o.step ?? LINT.step;
  const dur = visual.durationInFrames / fps;
  const model = shotModel(visualVector(visual, assets, fps)!, assets, "outline", 1920, 1080, Boolean(visual.overlay), dur, visual.dressing);
  const { spec, safe, placed } = model;
  const shotId = visual.shotId;
  const issues = new Map<string, LintIssue>();
  const add = (code: LintCode, detail: string, replan: boolean, layer?: number, frame?: number) => {
    const key = `${code}:${layer ?? ""}`;
    if (!issues.has(key)) issues.set(key, { code, shotId, ...(layer === undefined ? {} : { layer }), ...(frame === undefined ? {} : { frame }), detail, replan });
  };
  const person = (pl: PlacedLayer) => safe[spec.layers[pl.index]!.asset]?.kind === "character";
  const people = placed.filter(person);
  const anims = (pl: PlacedLayer) => spec.layers[pl.index]!.anims;
  const at = (frame: number) => shotFrame(model, { shotId, frame, fps, durationInFrames: visual.durationInFrames, width: 1920, height: 1080, insets: true, overlay: Boolean(visual.overlay) });

  // --- sahneleme: kodun düzelttiği ya da düşürdüğü jestler (staging.ts).
  for (const p of model.problems) add(p.code, p.detail, p.replan, p.layer);

  // --- çizilemediği için düşen varlıklar (reddedilen ya da hiç çizilmeyen nesne, mekân): yönetmen onunla planladı.
  spec.layers.forEach((l, i) => {
    if (!safe[l.asset]) add("missing_asset", `layer asset ${l.asset} is not drawn`, true, i);
  });
  if (spec.background && !safe[spec.background]) add("missing_asset", `background ${spec.background} is not drawn`, true);

  // --- kareler (yarım yüzler katman başına toplanır, sonra karar verilir)
  const cuts = new Map<number, { frames: number[]; detail: string }>();
  // Son kare de bakılır (kadrajın durduğu yer).
  const frames = Array.from({ length: Math.ceil(visual.durationInFrames / step) }, (_, n) => n * step);
  if (frames[frames.length - 1] !== visual.durationInFrames - 1) frames.push(visual.durationInFrames - 1);
  for (const frame of frames) {
    const f = at(frame);
    const p = f.p;
    frameIssues(
      {
        layers: placed.map((pl) => {
          const tr = f.motions.get(pl.index)!.tr;
          const cover = person(pl) ? undefined : drawingCover(model, f, pl);
          return {
            index: pl.index,
            person: person(pl),
            box: screenBox(model, f, pl, person(pl)),
            opacity: tr.opacity,
            moving: anims(pl).some((a) => TRAVEL.has(a.type) && activeAt(a, p)),
            x: pl.x + tr.x,
            z: pl.z,
            width: pl.width,
            ...(person(pl) ? { face: faceBox(model, f.motions, f.k, pl) } : {}),
            ...(cover ? { cover } : {}),
          };
        }),
        texts: f.texts.map((tx) => ({ text: tx.text.text, box: textBoxOf(tx) })),
      },
      (code, detail, layer) => {
        if (code !== "face_cut") return add(code, detail, true, layer, frame);
        const c = cuts.get(layer) ?? { frames: [], detail };
        c.frames.push(frame);
        cuts.set(layer, c);
      },
    );
    // İnsan eklemi sınırını aşan poz (anatomy.ts): render sınıra kırptı (anlam kaybolmaz, yeniden planlanmaz); jest
    // kodunda hatadır, testler hiçbir jestin kırpılmadığını sınar.
    for (const pl of people) {
      const s = f.motions.get(pl.index)!.strains?.[0];
      if (s) add("anatomy", `${s.part} ${s.what} ${Math.round(s.value)} beyond the human limit ${Math.round(s.limit)}`, false, pl.index, frame);
    }
    // Karede sıçrayan eklem: bir sonraki kareyle karşılaştırılır.
    const next = frame + 1 < visual.durationInFrames ? at(frame + 1) : undefined;
    // Bilerek hızlı jest (irkilme) ve ön çizimden yan çizime geçiş (çizim değişir, poz karşılaştırılamaz) sayılmaz.
    if (next)
      for (const pl of people) {
        const a = f.motions.get(pl.index)!;
        const b = next.motions.get(pl.index)!;
        if (Boolean(a.side) !== Boolean(b.side) || anims(pl).some((x) => FAST_GESTURES.has(x.type) && activeAt(x, p))) continue;
        snaps(a, b, (part, d) => add("pose_snap", `${part} jumps ${Math.round(d)}° in one frame`, true, pl.index, frame));
      }
  }
  const last = frames[frames.length - 1];
  for (const [layer, c] of cuts)
    if (c.frames.includes(0) || c.frames.includes(last!) || c.frames.length > frames.length * LINT.faceCutShare) add("face_cut", c.detail, true, layer, c.frames[0]);
  // Boş kadraj: ortadaki karede görünen (saydam olmayan) içerik. Harita tuvalin tamamıdır; katmansız çekim (yalnız mekân)
  // bilerek boştur.
  const mid = at(Math.floor(visual.durationInFrames / 2));
  const content = placed.reduce((s, pl) => s + (mid.motions.get(pl.index)!.tr.opacity < 0.5 ? 0 : overlap(screenBox(model, mid, pl, person(pl)), SCREEN)), 0);
  // Figüranlar (crowd.tsx) kadrajı doldurur: kalabalıklı çekim boş değildir.
  if (placed.length && !model.bg?.meta.exact && !model.crowd?.figures.length && content / area(SCREEN) < LINT.emptyBelow) add("empty_frame", `visible content covers ${Math.round((100 * content) / area(SCREEN))}% of the frame`, true);
  return [...issues.values()];
}

/** Bir karenin denetlenecek görünümü: katmanlar çizim sırasıyla (sonra gelen önde), ekran kutuları, yazılar. */
export interface FrameView {
  layers: {
    index: number;
    person: boolean;
    /** Ekrandaki kutu (kişide gövde). */
    box: Box;
    opacity: number;
    /** Bu karede yer değiştiriyor (yürüme, kayma): kadraja girip çıkması, birinin önünden geçerken örtmesi olağan. */
    moving: boolean;
    /** Tuvaldeki ayak noktası x'i, derinlik sırası ve genişlik (iç içe yürüme). */
    x: number;
    z: number;
    width: number;
    /** Kişinin ekrandaki yüzü. */
    face?: Box;
    /** Nesnenin çiziminin ekrandaki bir bölgeyi örttüğü pay (yoksa kutu sayılır). */
    cover?: (region: Box) => number;
  }[];
  texts: { text: string; box: Box }[];
}

/** Bir karenin kural denetimi (saf): yarım yüz, örtülen yüz, yüzdeki yazı, iç içe yürüme. */
export function frameIssues(v: FrameView, add: (code: LintCode, detail: string, layer: number) => void): void {
  v.layers.forEach((l, order) => {
    if (!l.face) return;
    const a = area(l.face);
    if (a <= 0) return;
    // Yarım kalan yüz (kadraja giren/çıkan hariç).
    const visible = overlap(l.face, SCREEN) / a;
    if (!l.moving && visible > LINT.faceVisible[0] && visible < LINT.faceVisible[1]) add("face_cut", `only ${Math.round(visible * 100)}% of the face is in frame`, l.index);
    // Örtülme ve yazı yalnız ekranda görünen yüzde ve görünen katmanlarla (sahneye kayan ya da beliren katman kadraj
    // dışında üst üste durabilir). Önünden geçen ya da önünden geçilen kişi bir an örtülür: olağan.
    if (visible <= LINT.faceVisible[0] || l.opacity < 0.5) return;
    const shown = clip(l.face, SCREEN);
    const sa = area(shown);
    for (const q of v.layers.slice(order + 1)) {
      if (q.opacity < 0.5 || l.moving || q.moving) continue;
      const covered = q.cover ? q.cover(shown) : overlap(shown, q.box) / sa;
      if (covered > LINT.faceCovered) add("face_covered", `face ${Math.round(covered * 100)}% hidden behind layer ${q.index}`, l.index);
    }
    for (const tx of v.texts) {
      const covered = overlap(shown, tx.box) / sa;
      if (covered > LINT.textOnFace) add("text_on_face", `text "${tx.text.slice(0, 30)}" covers ${Math.round(covered * 100)}% of the face`, l.index);
    }
  });
  // Aynı derinlikte birbirinin içinden geçen kişiler (biri yürürken; ikisi de kadraj dışındaysa görünmez).
  const people = v.layers.filter((l) => l.person);
  for (let i = 0; i < people.length; i++)
    for (let j = i + 1; j < people.length; j++) {
      const a = people[i]!;
      const b = people[j]!;
      if (Math.abs(a.z - b.z) >= 10 || (!a.moving && !b.moving) || (!overlap(a.box, SCREEN) && !overlap(b.box, SCREEN))) continue;
      if (Math.abs(a.x - b.x) < (a.width + b.width) * LINT.through) add("walk_through", `walks through layer ${b.index}`, a.index);
    }
}

/** İki ardışık karede dönüşü LINT.snapDeg'den fazla değişen eklemler. */
export function snaps(a: Motion, b: Motion, hit: (part: string, deg: number) => void): void {
  for (const part of Object.keys(RIG.pivots).concat("torso")) {
    const ra = a.pose?.[part as keyof NonNullable<Motion["pose"]>]?.rotate;
    const rb = b.pose?.[part as keyof NonNullable<Motion["pose"]>]?.rotate;
    if (ra === undefined || rb === undefined) continue;
    const d = Math.abs(((rb - ra + 540) % 360) - 180);
    if (d > LINT.snapDeg) hit(part, d);
  }
}

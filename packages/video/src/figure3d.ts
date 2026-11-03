import { FigureSpec, RIG, type RigPart } from "@ys/core";
import {
  CapsuleGeometry,
  CircleGeometry,
  DoubleSide,
  FrontSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  Quaternion,
  SphereGeometry,
  SplineCurve,
  TorusGeometry,
  Vector2,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";

/**
 * 3D figür (3 Kas, kullanıcı isteği: gerçekçi olmayan ama özel 3D karakterler): tariften (FigureSpec) yumuşak,
 * yuvarlak hatlı bir kukla kurulur. Eklemler kukla iskeletinin (RIG) dönme noktalarındadır; Vector.tsx'in hesapladığı
 * pozlar (dönüş, öteleme, ölçek) aynı parça adlarıyla uygulanır, böylece nefes, jest, göz kırpma ve konuşan ağız SVG
 * kuklasıyla aynı kalır. Koordinatlar RIG tuvalinden (400×800, y aşağı) three'ye çevrilir: X = x − 200, Y = 800 − y
 * (ayak tabanı Y = 0); ön yüz +Z.
 */

export type FigurePart = RigPart | "torso";

export interface Figure {
  root: Group;
  /** Poz uygulanacak parça grupları (dönme noktaları RIG'deki gibi). */
  parts: Record<FigurePart, Object3D>;
  dispose: () => void;
}

export interface PartPose {
  rotate: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

const X = (x: number) => x - RIG.width / 2;
const Y = (y: number) => RIG.height - y;
/** Bir parçanın dönme noktasının, üst parçanın dönme noktasına göre yeri (three ekseninde). */
const rel = (k: RigPart, parent: RigPart): [number, number] => {
  const [a, b] = RIG.pivots[k];
  const [c, d] = RIG.pivots[parent];
  return [X(a) - X(c), Y(b) - Y(d)];
};

const BUILD = { slim: 0.88, average: 1, broad: 1.16 } as const;
/** Kafa: boyun dönme noktasının üstündeki merkez, yarıçap ve basıklık (önden arkaya biraz yassı). */
const HEAD = { cy: 74, r: 76, sy: 1.05, sz: 0.94 } as const;
/** Ayakkabı tabanı zemine (Y = 0) değsin diye dizden ayakkabı merkezine uzaklık. */
const KNEE_Y = Y(RIG.pivots["shin-l"][1]);
const SHOE = { h: 15, y: -KNEE_Y + 15 } as const;

/** Kafa yüzeyinin (x, y) noktasındaki ön derinliği: yüz parçaları yüzeye oturur, havada durmaz. */
export function faceDepth(x: number, y: number): number {
  const dy = (y - HEAD.cy) / HEAD.sy;
  return Math.sqrt(Math.max(0, HEAD.r * HEAD.r - x * x - dy * dy)) * HEAD.sz;
}

/**
 * Yüzey türleri: mat (yumuşak plastik, kumaşta hafif parlama), kil (tamamen mat), parlak (oyuncak verniği), köşeli
 * (low-poly: az yüzlü geometri, her yüz tek renk).
 */
const FINISH = {
  matte: { roughness: 0.62, sheen: 0.35, clearcoat: 0, flatShading: false },
  clay: { roughness: 0.92, sheen: 0, clearcoat: 0, flatShading: false },
  glossy: { roughness: 0.34, sheen: 0, clearcoat: 1, flatShading: false },
  faceted: { roughness: 0.75, sheen: 0, clearcoat: 0, flatShading: true },
} as const;

/** Geometri bölüm sayısı: köşeli yüzeyde dörtte biri (en az 5), yüzler seçilir. */
const segments = (spec: FigureSpec) => (n: number) => (spec.finish === "faceted" ? Math.max(5, Math.round(n / 4)) : n);

/** Profil noktalarından yumuşak eğri (gövde, etek): köşeli silüet olmasın. */
const smooth = (points: readonly (readonly [number, number])[], k: number, n: number) => new SplineCurve(points.map(([r, y]) => new Vector2(r * k, y))).getPoints(n);

export function buildFigure(input: FigureSpec): Figure {
  // Timeline props'u şemadan geçmeden gelebilir (Remotion girdisi): varsayılanlar burada da doldurulur.
  const spec = FigureSpec.parse(input);
  const q = segments(spec);
  const geos: BufferGeometry[] = [];
  const mats = new Map<string, Material>();
  const mat = (color: string, finish: FigureSpec["finish"] = spec.finish, open = false) => {
    const id = `${color}|${finish}|${open}`;
    let m = mats.get(id);
    if (!m) {
      const f = FINISH[finish];
      m = new MeshPhysicalMaterial({
        color,
        metalness: 0,
        roughness: f.roughness,
        sheen: f.sheen,
        sheenRoughness: 0.8,
        clearcoat: f.clearcoat,
        clearcoatRoughness: 0.2,
        flatShading: f.flatShading,
        side: open ? DoubleSide : FrontSide,
      });
      mats.set(id, m);
    }
    return m;
  };
  const mesh: MeshFn = (g, color, at = [0, 0, 0], scale = [1, 1, 1], finish, open) => {
    geos.push(g);
    const m = new Mesh(g, mat(color, finish, open));
    m.position.set(...at);
    m.scale.set(...scale);
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  const group = (at: readonly [number, number], ...children: [Object3D, ...Object3D[]]) => {
    const g = new Group();
    g.position.set(at[0], at[1], 0);
    g.add(...children);
    return g;
  };
  /** Yukarıdan aşağı uzuv: eklemden (0,0) aşağı `len` boyunca, yuvarlak uçlu. */
  const limb = (r: number, len: number, color: string) => mesh(new CapsuleGeometry(r, len, q(6), q(18)), color, [0, -len / 2, 0]);

  const k = BUILD[spec.build];
  const { top, bottom, skin } = spec;
  const inner = top.inner ?? "#f3efe6";
  const sleeve = top.style === "vest" ? inner : top.color;
  const forearmColor = top.style === "tshirt" || top.style === "dress" ? skin : sleeve;
  const shinColor = bottom.style === "trousers" ? bottom.color : skin;
  const thighColor = bottom.style === "skirt" || top.style === "dress" ? skin : bottom.color;

  // --- bacaklar: kalça → diz → ayak; ayakkabı öne uzanır, tabanı zeminde
  const leg = (side: "l" | "r") => {
    const knee = rel(`shin-${side}`, `leg-${side}`);
    const shin = group(knee, limb(25 * k, -SHOE.y - 25 * k, shinColor), mesh(new SphereGeometry(1, q(28), q(18)), spec.shoes, [0, SHOE.y, 20], [27 * k, SHOE.h, 42]));
    const [hx, hy] = RIG.pivots[`leg-${side}`];
    return group([X(hx), Y(hy)], limb(30 * k, -knee[1], thighColor), shin);
  };
  const legL = leg("l");
  const legR = leg("r");

  // --- gövde: döner profil (kalça, karın, göğüs, omuz eğimi, boyun), önden arkaya basık; yumuşak 3D karakterlerin
  // tıknaz, armut biçimli gövdesi
  const profile: [number, number][] = [
    [0, -14],
    [44, -10],
    [60, 4],
    [62, 70],
    [66, 140],
    [66, 192],
    [54, 226],
    [26, 252],
    [0, 258],
  ];
  const open = top.style === "vest" || top.style === "jacket";
  const body = group([0, 0], mesh(new LatheGeometry(smooth(profile, k, q(36)), q(56)), open ? inner : top.color, [0, 0, 0], [1, 1, 0.68]));
  if (open) {
    // Önde açık yelek/ceket: gövdeyi saran, önde boşluk bırakan kabuk; altındaki gömlek boşluktan görünür.
    const shell = profile.slice(1, -2).map(([r, y]) => [r + 3, y] as [number, number]);
    body.add(mesh(new LatheGeometry(smooth(shell, k, q(36)), q(56), 0.32, Math.PI * 2 - 0.64), top.color, [0, 0, 0], [1, 1, 0.7], undefined, true));
  }
  if (top.style === "dress" || bottom.style === "skirt") {
    const color = top.style === "dress" ? top.color : bottom.color;
    body.add(mesh(new LatheGeometry(smooth([[0, 16], [58, 16], [70, -40], [84, -100], [0, -100]], k, q(36)), q(56)), color, [0, 0, 0], [1, 1, 0.74]));
  }
  if (top.style === "hoodie") body.add(mesh(new TorusGeometry(30 * k, 12, q(12), q(32)), inner, [0, 226, -8], [1, 0.6, 1]));
  if (top.style === "shirt" || top.style === "jacket" || top.style === "vest") body.add(mesh(new TorusGeometry(17, 5, q(8), q(24)), inner, [0, 232, 2], [1, 0.7, 1]));

  // --- kollar: omuz topu, üst kol, ön kol, el (başparmak öne bakar)
  const arm = (side: "l" | "r") => {
    const elbow = rel(`forearm-${side}`, `arm-${side}`);
    const wrist = rel(`hand-${side}`, `forearm-${side}`);
    const out = side === "l" ? -1 : 1;
    const hand = group(wrist, mesh(new SphereGeometry(1, q(24), q(16)), skin, [0, -16, 2], [18, 22, 14]), mesh(new CapsuleGeometry(6, 12, q(4), q(8)), skin, [-out * 14, -9, 10]));
    const forearm = group(elbow, limb(19, -wrist[1] - 2, forearmColor), hand);
    // Üst kol omuz noktasının hemen üstünden başlar: gövdenin omuz hattından taşıp vatka gibi durmasın.
    const ra = 23 * k;
    const upper = mesh(new CapsuleGeometry(ra, 8 - elbow[1] - 2 * ra, q(6), q(18)), sleeve, [0, (8 + elbow[1]) / 2, 0]);
    return { group: group(rel(`arm-${side}`, "body"), upper, forearm), forearm, hand };
  };
  const armL = arm("l");
  const armR = arm("r");

  // --- baş: boyun, kafa, kulaklar, burun; göz, kaş ve ağız kendi dönme noktalarında, kafa yüzeyine oturur
  const { cy, r } = HEAD;
  const [, eyeY] = rel("eyes", "head");
  const [, browY] = rel("brows", "head");
  const [, mouthY] = rel("mouth", "head");
  const eye = (x: number): [Mesh, Mesh, Mesh] => [
    mesh(new SphereGeometry(14.5, q(24), q(18)), "#fbfaf7", [x, 0, faceDepth(x, eyeY) - 8], [1, 1.12, 0.62], "glossy"),
    mesh(new SphereGeometry(9, q(20), q(14)), "#2a1c16", [x, -1, faceDepth(x, eyeY) - 1.5], [1, 1.1, 0.5], "glossy"),
    mesh(new SphereGeometry(3, q(10), q(8)), "#ffffff", [x - 3.5, 3.5, faceDepth(x, eyeY) + 3], [1, 1, 1], "glossy"),
  ];
  const eyes = group([0, eyeY], ...eye(-27), ...eye(27));
  const browColor = spec.hair.style === "bald" ? "#5b4636" : spec.hair.color;
  const brow = (x: number, tilt: number) => {
    const b = mesh(new CapsuleGeometry(3.6, 15, q(4), q(8)), browColor, [x, 0, faceDepth(x, browY) + 1]);
    b.rotation.z = Math.PI / 2 + tilt;
    return b;
  };
  const brows = group([0, browY], brow(-27, 0.1), brow(27, -0.1));
  // Ağız: düz üstlü yarım daire (açık gülümseme). Dikey ölçek açıklığıdır: konuşurken açılıp kapanır, eksi olunca ters
  // döner (üzgün, kızgın).
  const mouth = group([0, mouthY], mesh(new CircleGeometry(15, 32, Math.PI, Math.PI), "#5c1f26", [0, 7, faceDepth(0, mouthY + 4) + 0.5], [1, 0.5, 1], "matte"));
  const head = group(
    rel("head", "body"),
    mesh(new CapsuleGeometry(21, 24, q(4), q(16)), skin, [0, 4, -6]),
    mesh(new SphereGeometry(r, q(56), q(40)), skin, [0, cy, 0], [1, HEAD.sy, HEAD.sz]),
    mesh(new SphereGeometry(13, q(20), q(14)), skin, [-r + 1, cy - 4, -8], [0.55, 1, 0.8]),
    mesh(new SphereGeometry(13, q(20), q(14)), skin, [r - 1, cy - 4, -8], [0.55, 1, 0.8]),
    mesh(new SphereGeometry(9, q(20), q(14)), skin, [0, cy - 12, faceDepth(0, cy - 12) - 3], [1, 0.9, 1]),
    // Yanaklar: tenin biraz pembesi, yumuşak 3D karakterlerin imzası.
    mesh(new SphereGeometry(10, q(16), q(12)), "#f0a49a", [-38, cy - 18, faceDepth(38, cy - 18) - 6], [1, 0.7, 0.4]),
    mesh(new SphereGeometry(10, q(16), q(12)), "#f0a49a", [38, cy - 18, faceDepth(38, cy - 18) - 6], [1, 0.7, 0.4]),
    eyes,
    brows,
    mouth,
  );
  hairOf(spec, head, mesh);
  if (spec.beard !== "none") {
    // Sakal: çeneyi ve yanakların altını saran, önü ağzın altından geçen eğik alt kubbe (yalnız ön yarı ve kulak
    // hizası; ense açık, profilde kafanın arkası sakal olmasın); bıyık ağzın üstünde. Kirli sakal yarı saydam.
    const full = spec.beard === "full";
    const beard = mesh(
      new SphereGeometry(r + (full ? 5 : 3), q(48), q(24), -0.2, Math.PI + 0.4, Math.PI - 1.25, 1.25),
      spec.hair.color,
      [0, cy, 0],
      [1, full ? 1.18 : 1.06, HEAD.sz + 0.03],
    );
    beard.rotation.x = 0.26;
    if (spec.beard === "stubble") {
      const m = (beard.material as MeshPhysicalMaterial).clone();
      m.transparent = true;
      m.opacity = 0.4;
      mats.set("stubble", m);
      beard.material = m;
    } else {
      const stache = mesh(new CapsuleGeometry(5, 20, q(4), q(8)), spec.hair.color, [0, mouthY + 15, faceDepth(0, mouthY + 15) + 1]);
      stache.rotation.z = Math.PI / 2;
      head.add(stache);
    }
    head.add(beard);
  }
  if (spec.glasses) {
    for (const x of [-27, 27]) head.add(mesh(new TorusGeometry(16, 2.4, q(10), q(32)), "#26252c", [x, eyeY, faceDepth(x, eyeY) + 4], [1, 0.88, 1], "glossy"));
    const bridge = mesh(new CapsuleGeometry(1.8, 12, q(4), q(6)), "#26252c", [0, eyeY + 2, faceDepth(0, eyeY) + 4], [1, 1, 1], "glossy");
    bridge.rotation.z = Math.PI / 2;
    head.add(bridge);
  }

  // Kalça (gövde dönme noktası) tuvaldeki yerinde; bacaklar kökün altında, üst gövde "torso" ile birlikte eğilir.
  const [bx, by] = RIG.pivots.body;
  const torso = group([X(bx), Y(by)], body, armL.group, armR.group, head);
  const root = new Group();
  root.add(legL, legR, torso);

  const parts: Figure["parts"] = {
    torso,
    body,
    head,
    eyes,
    brows,
    mouth,
    "arm-l": armL.group,
    "arm-r": armR.group,
    "forearm-l": armL.forearm,
    "forearm-r": armR.forearm,
    "hand-l": armL.hand,
    "hand-r": armR.hand,
    "leg-l": legL,
    "leg-r": legR,
    "shin-l": legL.children[1]!,
    "shin-r": legR.children[1]!,
  };
  // Dinlenme konumları: poz her karede bunların üstüne uygulanır.
  for (const p of Object.values(parts)) p.userData.rest = [p.position.x, p.position.y];
  return {
    root,
    parts,
    dispose: () => {
      for (const g of geos) g.dispose();
      for (const m of mats.values()) m.dispose();
    },
  };
}

type MeshFn = (g: BufferGeometry, color: string, at?: readonly [number, number, number], scale?: readonly [number, number, number], finish?: FigureSpec["finish"], open?: boolean) => Mesh;

/**
 * Saç: kafanın tepesini ve arkasını saran, önü alına kadar yükselen eğik kubbe (yüzü örtmez); stile göre kâkül,
 * topuz, at kuyruğu, uzun saç perdesi ya da kıvırcık toplar eklenir.
 */
function hairOf(spec: FigureSpec, head: Group, mesh: MeshFn): void {
  const { cy, r } = HEAD;
  const q = segments(spec);
  const color = spec.hair.color;
  const cap = (grow: number, tilt = 0.62) => {
    const m = mesh(new SphereGeometry(r + grow, q(56), q(28), 0, Math.PI * 2, 0, Math.PI / 2), color, [0, cy + 2, -2], [1, HEAD.sy, HEAD.sz + 0.04]);
    m.rotation.x = -tilt;
    return m;
  };
  switch (spec.hair.style) {
    case "bald":
      return;
    case "buzz":
      head.add(cap(1.5, 0.7));
      return;
    case "short":
      head.add(cap(5));
      return;
    case "side-part":
      head.add(cap(6), mesh(new SphereGeometry(30, q(24), q(16)), color, [-18, cy + 50, 38], [1.6, 0.6, 0.8]));
      return;
    case "curly":
      head.add(cap(4, 0.55));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        head.add(mesh(new SphereGeometry(20, q(16), q(12)), color, [Math.cos(a) * (r - 14), cy + 46 + Math.sin(a) * 16, Math.sin(a) * (r - 30) - 8]));
      }
      return;
    case "long":
      head.add(cap(6, 0.58), mesh(new CapsuleGeometry(58, 96, q(8), q(24)), color, [0, cy - 56, -30], [1.12, 1, 0.5]));
      return;
    case "bun":
      head.add(cap(4), mesh(new SphereGeometry(28, q(24), q(16)), color, [0, cy + r + 8, -18]));
      return;
    case "ponytail":
      head.add(cap(4), mesh(new CapsuleGeometry(18, 74, q(6), q(16)), color, [0, cy - 14, -r - 4]));
      return;
  }
}

export interface FigureView {
  /** Gövdenin dikey eksende dönüşü, 90°'nin kesri (1: sağa bakan profil). */
  turn?: number;
  /** Yan poz (RIG_SIDE): ekrandaki dönüşler profilde öne-arkaya salınımdır (yerel x ekseni), öteleme ileri. */
  profile?: boolean;
}

/**
 * Kukla pozunu figüre uygular: dönüş derece ve ekranda saat yönü artı (önden bakışta three'de −z), öteleme RIG pikseli
 * (y aşağı), ölçek dönme noktasında; SVG'deki CSS dönüşümüyle aynı sıra (öteleme, dönüş, ölçek). Profilde (figür sağa
 * dönük) ekrandaki saat yönü yerel x ekseni etrafında artı dönüştür, yatay öteleme figürün önüne (+z) gider. Verilmeyen
 * parça dinlenir.
 */
/**
 * Kol gövdenin önünden geçerken (düşünürken çeneye, kollar kavuşuk, okurken) önden görünüşte kameraya doğru öne alınır:
 * 2D poz kolu ön düzlemde döndürüyor, 3D figürde ise kol gövdeyle aynı derinlikte kalıp hacminin içinde kayboluyordu
 * (3 Kas: düşünen figürün kolu hiç görünmüyordu). Öne alma, elin omuzdan gövde ortasına doğru gittiği payla artar.
 */
export const ARM_FRONT = { depth: 48, span: 110 } as const;

function armDepth(name: string, pose: Partial<Record<FigurePart, PartPose>>): number {
  if (name !== "arm-l" && name !== "arm-r") return 0;
  const side = name === "arm-r" ? "r" : "l";
  const [sx, sy] = RIG.pivots[name];
  const [, ey] = RIG.pivots[`forearm-${side}`];
  const rad = (d: number) => (d * Math.PI) / 180;
  const arm = pose[name]?.rotate ?? 0;
  const fore = pose[`forearm-${side}`]?.rotate ?? 0;
  const upper = (ey - sy) * (pose[name]?.sy ?? 1);
  // Elin yeri (ileri kinematik; üst kol omuzdan dirseğe, ön kol dirsekten elin ortasına).
  const hx = sx - Math.sin(rad(arm)) * upper - Math.sin(rad(arm + fore)) * 112;
  const inward = side === "r" ? sx - hx : hx - sx;
  return ARM_FRONT.depth * Math.min(1, Math.max(0, inward / ARM_FRONT.span));
}

export function poseFigure(figure: Figure, pose: Partial<Record<FigurePart, PartPose>>, view: FigureView = {}): void {
  figure.root.rotation.y = ((view.turn ?? 0) * Math.PI) / 2;
  for (const [name, part] of Object.entries(figure.parts)) {
    const v = pose[name as FigurePart] ?? { rotate: 0, sx: 1, sy: 1, tx: 0, ty: 0 };
    const [x, y] = part.userData.rest as [number, number];
    const a = (v.rotate * Math.PI) / 180;
    if (view.profile) {
      part.position.set(x, y - v.ty, v.tx);
      part.rotation.set(a, 0, 0);
      part.scale.set(v.sx, v.sy, 1);
    } else {
      part.position.set(x + v.tx, y - v.ty, armDepth(name, pose));
      if (!(name in PITCHED)) {
        part.rotation.set(0, 0, -a, "XYZ");
        part.scale.set(v.sx, v.sy, 1);
        continue;
      }
      // Kısalan uzuv (sy < 1) figürde gerçekten kameraya döner (önden görünen boyu sy olacak kadar): üst kol dirseği,
      // uyluk dizi öne getirir; alt parça üst parçanın eğimini geri alıp ön düzlemde döner, kendisi de kısaysa (alkış,
      // klavye, çeneye giden ön kol; adımda baldır) o da kameraya döner. Ölçekle kısaltmak uzvu eziyordu: kısa, kalın bir
      // ön kol, oturan figürde basık bir uyluk (anatomiye ters, 3 Kas).
      const up = PITCHED[name] as FigurePart | undefined;
      // Görünen boy: baldırda uyluğun ölçeğiyle çarpılır (SVG'de onun içinde ölçeklenir).
      const seen = (up && CARRIED.has(name) ? (pose[up]?.sy ?? 1) : 1) * v.sy;
      const own = Math.acos(Math.min(1, seen));
      // Kamera +z'de, uzuv aşağı (−y) sarkar: ucu öne getiren dönüş x ekseninde eksidir. Üst parçada önce ön düzlemde
      // dönüş, sonra öne eğim (ZXY: Rz·Rx); alt parçada üst parçanın eğimi önce geri alınır: Rx(geri)·Rz(−a)·Rx(−eğim).
      if (!up) part.rotation.set(-own, 0, -a, "ZXY");
      else {
        part.rotation.order = "XYZ";
        const undo = Math.acos(Math.min(1, pose[up]?.sy ?? 1));
        part.quaternion.setFromAxisAngle(X_AXIS, undo).multiply(TURN.setFromAxisAngle(Z_AXIS, -a)).multiply(TURN.setFromAxisAngle(X_AXIS, -own));
      }
      part.scale.set(v.sx, Math.max(1, seen), 1);
    }
  }
}

/** Kısalınca kameraya dönen uzuvlar ve eğimini geri aldıkları üst parça. */
const PITCHED: Record<string, string | undefined> = {
  "arm-l": undefined,
  "arm-r": undefined,
  "forearm-l": "arm-l",
  "forearm-r": "arm-r",
  "leg-l": undefined,
  "leg-r": undefined,
  "shin-l": "leg-l",
  "shin-r": "leg-r",
};

/**
 * Üst parçanın ölçeğini taşıyan alt parçalar: SVG'de baldır uyluğun ölçeği içinde kalır (oturuşta baldır 1/uyluk ile
 * geri alır), görünen boyu ikisinin çarpımıdır. Ön kol taşımaz: CSS üst kolun ölçeğini dirsekte geri alır.
 */
const CARRIED = new Set(["shin-l", "shin-r"]);

const X_AXIS = new Vector3(1, 0, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const TURN = new Quaternion();

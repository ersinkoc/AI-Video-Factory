import type { MotionDiagram } from "@ys/core";
import { fitSize, labelParts, rowsOf, type PartProps } from "./context.ts";
import { diagramOrder, edgeKey } from "./order.ts";
import { beatFrames, clamp01, enterK, expoOut, FILM } from "./timing.ts";

/**
 * Sistem diyagramı (parçalar nasıl bağlı): düğümler sırayla belirir, iki ucu görünen bağ hemen ardından çizilerek açılır
 * (hw-pipeline'ın sıralı çizimi), çizilen bağın üstünden paket noktaları vuruş ızgarasında akar. Vurgulanan düğüm vurgu
 * renginde yanar. Dikey videoda ızgara döner (sütunlar satır olur).
 */
export function Diagram(p: PartProps) {
  const g = p.scene.diagram!;
  const { box, colors, heading, body, frame, fps } = p;
  const tall = p.height > p.width;
  const titleSize = Math.round(Math.min(box.h * 0.075, 64));
  // Kayan başlığın satırları kadar yer (dikeyde iki satırlık başlık ilk düğüme değiyordu).
  const top = g.title ? titleSize * (rowsOf(g.title, box.w, titleSize * heading.em) * 1.1 + 0.7) : 0;
  const area = { x: box.x, y: box.y + top, w: box.w, h: box.h - top };
  const at = new Map(diagramOrder(g).map((u, i) => [u, p.enters[i]!]));
  const place = layoutNodes(g, area, tall);
  const nodeW = Math.min(place.cellW * 0.82, tall ? 440 : 420);
  const nodeH = Math.min(place.cellH * 0.56, 156);
  const pad = Math.round(nodeW * 0.04);
  // Etiket iki satıra inebilir: en uzun satır, kelime sınırından ikiye bölünmüş hâlinin uzunu.
  const label = fitSize(g.nodes.map((n) => { const [a, b] = labelParts(n.label); return b === undefined ? halves(a) : a.length >= b.length ? a : b; }), nodeW * 0.86, nodeH * 0.36, heading.em);
  const beat = beatFrames(p.bpm, fps);
  const tq = enterK(frame, 0, fps);
  const edgeSize = Math.round(label * 0.75);
  // Etiketin kaçınacağı düğüm kutuları (düğümler SVG'nin üstünde çizilir, altında kalan etiket görünmez).
  const boxes = g.nodes.map((n) => { const c = place.at.get(n.id)!; return { x: c.x - nodeW / 2, y: c.y - nodeH / 2, w: nodeW, h: nodeH }; });

  return (
    <div style={{ position: "absolute", inset: 0, color: colors.fg }}>
      {g.title && (
        <div data-title="" style={{ position: "absolute", left: box.x, top: box.y, width: box.w, fontFamily: heading.family, fontWeight: heading.weight, fontSize: titleSize, lineHeight: 1.1, textWrap: "balance", opacity: tq }}>
          {g.title}
        </div>
      )}
      <svg width={p.width} height={p.height} style={{ position: "absolute", left: 0, top: 0 }}>
        {g.edges.map((e, i) => {
          const a = place.at.get(e.from);
          const b = place.at.get(e.to);
          const t = at.get(edgeKey(i));
          if (!a || !b || t === undefined || frame < t) return null;
          const s = trim(a, b, nodeW, nodeH);
          const k = expoOut((frame - t) / (0.5 * fps));
          const x2 = s.x1 + (s.x2 - s.x1) * k;
          const y2 = s.y1 + (s.y2 - s.y1) * k;
          const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
          const head = 20;
          const drawnAt = t + 0.5 * fps;
          const phase = frame >= drawnAt ? (((frame - drawnAt) / (FILM.packetBeats * beat)) % 1) : -1;
          return (
            <g key={i} data-edge={i}>
              <line x1={s.x1} y1={s.y1} x2={x2} y2={y2} stroke={colors.fg} strokeWidth={5} strokeLinecap="round" />
              {k > 0.98 && (
                <polygon
                  points={`${s.x2},${s.y2} ${s.x2 - head * Math.cos(ang - 0.45)},${s.y2 - head * Math.sin(ang - 0.45)} ${s.x2 - head * Math.cos(ang + 0.45)},${s.y2 - head * Math.sin(ang + 0.45)}`}
                  fill={colors.fg}
                />
              )}
              {g.packets && phase >= 0 && <circle data-packet="" cx={s.x1 + (s.x2 - s.x1) * phase} cy={s.y1 + (s.y2 - s.y1) * phase} r={12} fill={colors.accent} />}
              {e.label && k > 0.98 && (
                // Etiket bağın yanında, çizgiye dik yönde (üstüne binmez), zemin renginde bir hale ile.
                <text
                  {...labelSpot(s, e.label.length * edgeSize * body.em, edgeSize, label * 0.3, boxes, area)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={colors.fg}
                  stroke={colors.bg}
                  strokeWidth={8}
                  paintOrder="stroke"
                  style={{ fontFamily: body.family, fontWeight: body.weight, fontSize: edgeSize }}
                >
                  {e.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {g.nodes.map((n) => {
        const c = place.at.get(n.id)!;
        const t = at.get(n.id)!;
        const q = enterK(frame, t, fps);
        const hot = g.highlight === n.id && q > 0.5;
        return (
          <div
            key={n.id}
            data-node={n.id}
            style={{
              position: "absolute",
              left: c.x - nodeW / 2,
              top: c.y - nodeH / 2,
              // Yazı kenara değmesin: iç boşluk iki yandan %4, dış boyut aynı (23 Kas, 9:16 film m3: tahmin edilenden dar yazı
              // yüzünde "48 Saatte Kapına" kayması gerekirken kenardan kenara tek satırdı). Etiket 0,86'ya sığdırılır, içerik
              // 0,92: %7'lik boşluk tahminle tam ölçülen eşaralıklı yüzde "Kurgu ve" satırını üçe kaydırıp taşırmıştı.
              width: nodeW - pad * 2,
              height: nodeH,
              padding: `0 ${pad}px`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              borderRadius: nodeH * 0.22,
              border: `4px solid ${hot ? colors.accent : colors.fg}`,
              background: hot ? colors.accent : colors.bg,
              color: hot ? colors.onAccent : colors.fg,
              fontFamily: heading.family,
              fontWeight: heading.weight,
              fontSize: label,
              lineHeight: 1.1,
              textWrap: "balance",
              opacity: clamp01(q * 2),
              transform: `scale(${0.82 + 0.18 * q})`,
            }}
          >
            <NodeLabel label={n.label} />
          </div>
        );
      })}
    </div>
  );
}

/**
 * Bağ etiketinin merkezi: bağın ortasından çizgiye dik, üst yana (yatay bağda yukarı, dikeyde yana), etiketin kutusu
 * çizgiye değmeyecek kadar (kutunun dik yöndeki yarı genişliği + gap). 23 Kas, film denetçisi AI Video Factory m13:
 * eğik bağda yalnız yazı yüksekliği kadar açılan "< 8 puan" çizginin üstüne biniyordu; sola giden bağda kayma çizgiye dik
 * de değildi ("tekrar").
 */
export function labelSpot(s: { x1: number; y1: number; x2: number; y2: number }, w: number, h: number, gap: number, avoid: readonly Rect[] = [], bounds?: Rect): { x: number; y: number } {
  const ang = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
  const [sin, cos] = [Math.sin(ang), Math.cos(ang)];
  // Dik yön (sin, −cos); aşağı bakıyorsa ters çevrilir (etiket bağın üstünde).
  const flip = -cos > 1e-9 ? -1 : 1;
  const off = (w / 2) * Math.abs(sin) + (h / 2) * Math.abs(cos) + gap;
  const spot = (side: number, by: number) => ({ x: (s.x1 + s.x2) / 2 + side * sin * by, y: (s.y1 + s.y2) / 2 - side * cos * by });
  // Etiket düğüm kutularına binmez: önce üst yanda dik yönde uzaklaşır, olmazsa alt yanda; ikisi de alana sığmazsa ilk yer
  // (23 Kas, 16:9 film m3: dört sütunda düğümler arası ~100 px, "every 30 s" iki düğümün altında kaldı, denetçi 2/10).
  const clear = (p: { x: number; y: number }) => {
    const r = { x: p.x - w / 2, y: p.y - h / 2, w, h };
    const inside = !bounds || (r.y >= bounds.y && r.x >= bounds.x && r.x + w <= bounds.x + bounds.w && r.y + h <= bounds.y + bounds.h);
    return inside && avoid.every((b) => r.x >= b.x + b.w + gap / 2 || r.x + w <= b.x - gap / 2 || r.y >= b.y + b.h + gap / 2 || r.y + h <= b.y - gap / 2);
  };
  const reach = Math.max(0, ...avoid.map((b) => Math.max(b.w, b.h))) + h;
  for (const side of [flip, -flip]) {
    for (let by = off; by <= off + reach; by += Math.max(2, h / 4)) if (clear(spot(side, by))) return spot(side, by);
  }
  return spot(flip, off);
}

type Rect = { x: number; y: number; w: number; h: number };

function NodeLabel({ label }: { label: string }) {
  const [a, b] = labelParts(label);
  if (b === undefined) return a;
  return (
    <span>
      {a}
      <br />
      <span data-sub="" style={{ fontSize: "0.8em", opacity: 0.8 }}>{b}</span>
    </span>
  );
}

/** Etiketin iki satıra bölünmüş hâlinin uzun satırı (tek kelimeyse kendisi). */
export function halves(label: string): string {
  const words = label.split(/\s+/);
  let best = label;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const longer = a.length >= b.length ? a : b;
    if (longer.length < best.length) best = longer;
  }
  return best;
}

/**
 * Düğümlerin merkezleri: kullanılan sütun/satır aralığı alana yayılır, dikeyde ızgara döner. Dikeyde her düğüm kendi
 * satırındaysa ve bağlar yalnız komşu satırları bağlıyorsa düğümler tek sütuna toplanır: yatay için çizilmiş çapraz
 * merdiven dönünce de merdivendi, dört düğüm genişliğin dörtte birine sığıyordu (23 Kas, 9:16 film m4: etiketler ~30 px).
 */
export function layoutNodes(g: MotionDiagram, area: { x: number; y: number; w: number; h: number }, tall: boolean) {
  const down = g.nodes.map((n) => (tall ? n.col : n.row));
  const across = tall && chainDown(g, down) ? down.map(() => 0) : g.nodes.map((n) => (tall ? n.row : n.col));
  const [a0, a1] = [Math.min(...across), Math.max(...across)];
  const [d0, d1] = [Math.min(...down), Math.max(...down)];
  const cols = a1 - a0 + 1;
  const rows = d1 - d0 + 1;
  const cellW = area.w / cols;
  const cellH = area.h / rows;
  const at = new Map(g.nodes.map((n, i) => [n.id, { x: area.x + (across[i]! - a0 + 0.5) * cellW, y: area.y + (down[i]! - d0 + 0.5) * cellH }]));
  return { at, cellW, cellH };
}

/** Düğümler ayrı satırlarda ve her bağ sıralamada komşu iki satırı bağlıyor (tek sütunda bağ başka düğümün üstünden geçmez). */
function chainDown(g: MotionDiagram, down: readonly number[]): boolean {
  const levels = [...new Set(down)].sort((a, b) => a - b);
  if (levels.length !== down.length) return false;
  const rank = new Map(g.nodes.map((n, i) => [n.id, levels.indexOf(down[i]!)]));
  return g.edges.every((e) => Math.abs(rank.get(e.from)! - rank.get(e.to)!) === 1);
}

/** Bağ, iki düğümün kutularının kenarından kenarına (merkezden çıkan ışının kutuyla kesiştiği yer). */
function trim(a: { x: number; y: number }, b: { x: number; y: number }, w: number, h: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // Düğümler ayrı hücrelerde (normalizeFilm): uzunluk sıfır olmaz.
  const len = Math.hypot(dx, dy);
  // Kutunun yarı ölçüleri boyunca ışının kenara çıktığı uzaklık (+ 6 px boşluk).
  const out = Math.min(Math.abs(dx) > 0 ? w / 2 / Math.abs(dx / len) : Infinity, Math.abs(dy) > 0 ? h / 2 / Math.abs(dy / len) : Infinity) + 6;
  const ux = dx / len;
  const uy = dy / len;
  return { x1: a.x + ux * out, y1: a.y + uy * out, x2: b.x - ux * out, y2: b.y - uy * out };
}

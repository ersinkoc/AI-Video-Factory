import type { MotionData } from "@ys/core";
import { rowsOf, type PartProps } from "./context.ts";
import { clamp01, countAt, enterK, expoOut, figureOn, FILM, formatValue } from "./timing.ts";

/** Veri hikayesi (kanıt): çubuklar sıfırdan büyür, çizgi noktadan noktaya çizilir, sayı sayarak oturur; not vurgulanan noktaya iner. */
export function Data(p: PartProps) {
  const d = p.scene.data!;
  const { box, colors, heading, body, frame, fps, enters, lang } = p;
  const titleSize = Math.round(Math.min(box.h * 0.085, box.w * (p.height > p.width ? 0.075 : 0.05), 72));
  const small = Math.round(titleSize * 0.5);
  const tq = enterK(frame, enters[0]!, fps);
  const decimals = Math.max(0, ...d.points.map((x) => (String(x.value).split(".")[1] ?? "").length).map((n) => Math.min(2, n)));
  // Harfli birim ayrı yazılır ("27 dk"), simge bitişik ("40%").
  const unit = d.unit ? (/^\p{L}/u.test(d.unit) ? ` ${d.unit}` : d.unit) : "";
  const fmt = (v: number) => `${formatValue(v, decimals, lang)}${unit}`;
  const titleW = p.scene.illustrative ? box.w * 0.76 : box.w;
  // Grafik başlığın kaç satıra kaydığına göre başlar (dikeyde iki satırlık başlık grafiğin üstüne iniyordu); çubuklarda not
  // grafiğin üstünde kendi bandındadır: vurgulanan kısa çubuğun üstüne konan not yandaki uzun çubuğa biniyordu (23 Kas,
  // film denetçisi m16: "turuncu not 'Before' çubuğunun kenarına değiyor").
  const calloutSize = Math.round(small * 1.5);
  // Bant notun kendisi ve en uzun çubuğun değer etiketi kadar (not o etiketin üstünde durur, bkz. calloutPoint). Çizgide
  // de not, tepedeki noktanın halkasının üstünde bu banda çıkar.
  const band = d.callout && (d.chart === "bars" || d.chart === "line") ? calloutSize * 3.75 : 0;
  const head = titleSize * (rowsOf(d.title, titleW, titleSize * heading.em) * 1.1 + 0.8) + band;
  const chart = { x: box.x, y: box.y + head, w: box.w, h: box.h - head - small * 3.2 };
  const calloutAt = d.callout ? enters.at(-1)! : undefined;
  // Sayaçta not sayının altındaki kendi bandındadır, sayı bandın üstündeki alana sığar: yükseklikle sınırlanan kısa sayı
  // (16:9'da "40 s", "1,800") satır kutusuyla alanın ~%86'sına iniyor, %78'e oturan not rakamların altını kesiyordu
  // (23 Kas, 16:9 film m12/m14, denetçi 1-2/10; dikeyde sayı genişlikle sınırlı kaldığından görülmemişti).
  const counter = d.callout && d.chart === "count" ? { ...chart, h: chart.h - calloutSize * COUNT_BAND } : chart;

  return (
    <div style={{ position: "absolute", inset: 0, color: colors.fg }}>
      <div data-title="" style={{ position: "absolute", left: box.x, top: box.y, width: titleW, fontFamily: heading.family, fontWeight: heading.weight, fontSize: titleSize, lineHeight: 1.1, textWrap: "balance", opacity: tq, transform: `translateY(${(1 - tq) * 30}px)` }}>
        {d.title}
      </div>
      {d.chart === "bars" && <Bars d={d} p={p} chart={chart} fmt={fmt} small={small} />}
      {d.chart === "line" && <Line d={d} p={p} chart={chart} fmt={fmt} small={small} />}
      {d.chart === "count" && <Count d={d} p={p} chart={counter} size={titleSize} />}
      {calloutAt !== undefined && (
        <Callout text={d.callout!} q={enterK(frame, calloutAt, fps)} at={calloutPoint(d, chart, d.callout!.length * calloutSize * body.em + calloutSize * 1.4, calloutSize)} colors={colors} font={body} size={calloutSize} />
      )}
      {d.source && (
        <div data-source="" style={{ position: "absolute", left: box.x, top: box.y + box.h - small * 1.4, fontFamily: body.family, fontWeight: body.weight, fontSize: small, opacity: 0.6 * tq }}>
          {d.source}
        </div>
      )}
    </div>
  );
}

type Box = { x: number; y: number; w: number; h: number };

/** Sayacın not bandı, notun boyu cinsinden: notun kendisi (~1,9) ve sayıyla arasında pay. */
export const COUNT_BAND = 2.4;

/** Değer ekseni: sıfır her zaman tabanda (çubuklar sıfırdan başlar), üstte %12 pay. */
function scaleOf(d: MotionData): { lo: number; hi: number } {
  const values = d.points.map((x) => x.value);
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values, 0);
  return { lo, hi: hi === lo ? lo + 1 : hi + (hi - lo) * 0.12 };
}

/** Çubuğun ya da noktanın merkezi (px). */
function pointAt(d: MotionData, chart: Box, i: number): { x: number; y: number } {
  const { lo, hi } = scaleOf(d);
  const n = d.points.length;
  // Çizgide uçlar kenardan %6 içeride: uç noktanın halkası ve etiketi kesilmesin.
  const x = d.chart === "bars" ? chart.x + ((i + 0.5) / n) * chart.w : chart.x + chart.w * (0.06 + 0.88 * (i / Math.max(1, n - 1)));
  return { x, y: chart.y + chart.h - ((d.points[i]!.value - lo) / (hi - lo)) * chart.h };
}

/**
 * Notun alt ortası: vurgulanan noktanın hizasında, notun kendi genişliğiyle grafiğin içinde (w: notun tahmini genişliği).
 * Çubuklarda grafiğin üstündeki bantta, çizgide noktanın üstünde (gerekirse aynı banda çıkar), sayaçta grafiğin
 * dibindeki bantta (COUNT_BAND).
 */
export function calloutPoint(d: MotionData, chart: Box, w: number, size: number): { x: number; y: number } {
  if (d.chart === "count") return { x: chart.x + chart.w / 2, y: chart.y + chart.h };
  const i = Math.min(d.highlight ?? d.points.length - 1, d.points.length - 1);
  const pt = pointAt(d, chart, i);
  const x = w >= chart.w ? chart.x + chart.w / 2 : Math.min(Math.max(pt.x, chart.x + w / 2), chart.x + chart.w - w / 2);
  // Çubuklarda en uzun çubuğun değer etiketi grafiğin %12'lik üst payına taşar (small × 1,9 = size × 1,27): not onun da
  // üstünde biter, vurgulanan çubuk en uzunsa etiketle arasında boşluk sıfıra iniyordu.
  if (d.chart === "bars") return { x, y: chart.y - size * 1.6 };
  // Çizgide not noktanın üstünde, grafiğin %16'sı kadar yukarıda, en çok üstteki bandın içine kadar; nokta tepedeyse
  // halkasının (small × 1,9 = size × 1,27) üstünde kalır. Eski sınır notu grafiğin içine (chart.y + size × 1,9) itiyordu,
  // tepedeki nokta notun altında kalıyordu (24 Kas, 9:16 film m4 "Peaks at 85% by noon", denetçi 7/10).
  return { x, y: Math.min(pt.y - size * 1.5, Math.max(chart.y - size * 1.6, pt.y - chart.h * 0.16)) };
}

function Bars({ d, p, chart, fmt, small }: { d: MotionData; p: PartProps; chart: Box; fmt: (v: number) => string; small: number }) {
  const { lo, hi } = scaleOf(d);
  const n = d.points.length;
  const base = chart.y + chart.h - ((0 - lo) / (hi - lo)) * chart.h;
  const bw = (chart.w / n) * 0.62;
  return (
    <>
      <div style={{ position: "absolute", left: chart.x, top: base, width: chart.w, height: 2, background: p.colors.fg, opacity: 0.35 }} />
      {d.points.map((pt, i) => {
        const at = p.enters[1 + i]!;
        // Çubuk 0,6 sn'de büyür; değer çubukla birlikte sayar.
        const g = expoOut((p.frame - at) / (0.6 * p.fps));
        const v = pt.value * g;
        const top = chart.y + chart.h - ((Math.max(v, 0) - lo) / (hi - lo)) * chart.h;
        const bottom = chart.y + chart.h - ((Math.min(v, 0) - lo) / (hi - lo)) * chart.h;
        const hot = d.highlight === i;
        const c = hot ? p.colors.accent : p.colors.fg;
        const x = chart.x + ((i + 0.5) / n) * chart.w - bw / 2;
        const shown = p.frame >= at;
        return (
          <div key={i} data-bar={i}>
            <div style={{ position: "absolute", left: x, top, width: bw, height: Math.max(0, bottom - top), background: c, opacity: d.highlight === undefined || hot ? 1 : 0.32, borderRadius: Math.min(10, bw * 0.08) }} />
            {shown && (
              <div style={{ position: "absolute", left: x - bw * 0.3, width: bw * 1.6, top: top - small * 1.9, textAlign: "center", fontFamily: p.heading.family, fontWeight: p.heading.weight, fontSize: small * 1.25, fontVariantNumeric: "tabular-nums", opacity: clamp01(g * 2) }}>
                {fmt(v)}
              </div>
            )}
            <div style={{ position: "absolute", left: x - bw * 0.3, width: bw * 1.6, top: chart.y + chart.h + small * 0.5, textAlign: "center", fontFamily: p.body.family, fontWeight: p.body.weight, fontSize: small, opacity: shown ? 0.75 : 0 }}>
              {pt.label}
            </div>
          </div>
        );
      })}
    </>
  );
}

function Line({ d, p, chart, fmt, small }: { d: MotionData; p: PartProps; chart: Box; fmt: (v: number) => string; small: number }) {
  const pts = d.points.map((_, i) => pointAt(d, chart, i));
  // Çizgi bir sonraki noktaya, o nokta girerken uzanır.
  let reach = 0;
  for (let i = 1; i < pts.length; i++) reach += enterK(p.frame, p.enters[1 + i]!, p.fps);
  const whole = Math.floor(reach);
  const drawn = pts.slice(0, whole + 1);
  if (whole < pts.length - 1) {
    const a = pts[whole]!;
    const b = pts[whole + 1]!;
    const f = reach - whole;
    drawn.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
  }
  const showFirst = p.frame >= p.enters[1]!;
  const beat = (60 / p.bpm) * p.fps;
  return (
    <>
      <svg width={p.width} height={p.height} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <line x1={chart.x} x2={chart.x + chart.w} y1={chart.y + chart.h} y2={chart.y + chart.h} stroke={p.colors.fg} strokeOpacity={0.35} strokeWidth={2} />
        {showFirst && <polyline data-path="" points={drawn.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(" ")} fill="none" stroke={p.colors.fg} strokeWidth={Math.max(6, small * 0.26)} strokeLinejoin="round" strokeLinecap="round" />}
        {pts.map((q, i) => {
          const k = enterK(p.frame, p.enters[1 + i]!, p.fps);
          if (p.frame < p.enters[1 + i]!) return null;
          const hot = d.highlight === i;
          // Vurgulanan nokta vuruşla atan bir halka taşır.
          const ring = hot ? ((p.frame - p.enters[1 + i]!) % beat) / beat : 0;
          return (
            <g key={i} data-dot={i}>
              {hot && <circle cx={q.x} cy={q.y} r={small * (0.5 + ring * 1.4)} fill="none" stroke={p.colors.accent} strokeOpacity={1 - ring} strokeWidth={3} />}
              <circle cx={q.x} cy={q.y} r={small * (hot ? 0.42 : 0.28) * k} fill={hot ? p.colors.accent : p.colors.fg} />
            </g>
          );
        })}
      </svg>
      {pts.map((q, i) =>
        p.frame >= p.enters[1 + i]! ? (
          <div key={i} style={{ position: "absolute", left: q.x - 120, width: 240, top: chart.y + chart.h + small * 0.5, textAlign: "center", fontFamily: p.body.family, fontWeight: p.body.weight, fontSize: small, opacity: 0.75 }}>
            {d.points[i]!.label}
            {d.highlight === i && <div style={{ fontFamily: p.heading.family, fontWeight: p.heading.weight, fontSize: small * 1.2, fontVariantNumeric: "tabular-nums", opacity: 1 }}>{fmt(d.points[i]!.value)}</div>}
          </div>
        ) : null,
      )}
    </>
  );
}

function Count({ d, p, chart, size }: { d: MotionData; p: PartProps; chart: Box; size: number }) {
  const c = d.count!;
  const at = p.enters[1]!;
  const v = countAt(c.from, c.to, p.frame, at, p.fps);
  // Son 0,15 sn'de hafifçe büyüyüp oturur (count-up).
  const land = (p.frame - at) / p.fps - FILM.countSec;
  const pop = land > -0.15 && land < 0.2 ? 1 + 0.06 * Math.sin(clamp01((land + 0.15) / 0.35) * Math.PI) : 1;
  const text = `${c.prefix}${formatValue(v, c.decimals, p.lang)}${c.suffix}${d.unit ?? ""}`;
  // Yazı tipinin harf genişliğiyle tek satıra sığar (eşaralıklı yazıda "<50 ms" ikiye bölünüyordu).
  const big = Math.round(Math.min(chart.h * 0.6, chart.w / (Math.max(3, text.length) * p.heading.em * 1.05), size * 4.2));
  return (
    <div data-count="" style={{ position: "absolute", left: chart.x, top: chart.y, width: chart.w, height: chart.h, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: p.heading.family, fontWeight: p.heading.weight, fontSize: big, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: figureOn(p.colors.bg, p.colors.accent, p.colors.fg), opacity: p.frame >= at ? 1 : 0, transform: `scale(${pop})` }}>
      {text}
    </div>
  );
}

function Callout({ text, q, at, colors, font, size }: { text: string; q: number; at: { x: number; y: number }; colors: PartProps["colors"]; font: PartProps["body"]; size: number }) {
  if (q <= 0) return null;
  return (
    <div data-callout="" style={{ position: "absolute", left: at.x, top: at.y, transform: `translate(-50%, -100%) translateY(${(1 - q) * 20}px)`, opacity: q, background: colors.accent, color: colors.onAccent, fontFamily: font.family, fontWeight: font.weight, fontSize: size, padding: `${size * 0.35}px ${size * 0.7}px`, borderRadius: size * 0.5, whiteSpace: "nowrap" }}>
      {text}
    </div>
  );
}

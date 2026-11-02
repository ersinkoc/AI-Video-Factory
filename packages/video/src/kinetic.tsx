import { gsap } from "gsap";
import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";

/**
 * Kinetik yazı (GSAP): plaka soldan silinerek açılır, kelimeler maskenin altından sırayla ve hafif yaylanarak
 * yükselir. Zaman çizelgesi duraklatılmıştır, GSAP'in kendi saati kullanılmaz: her karede `progress(q)` ile o ana
 * konumlanır (paralel render sekmeleri ve tekrar render aynı kareyi verir). q yoksa yazı olduğu gibi durur.
 */
export function useKinetic(q: number | undefined, words: number) {
  const plate = useRef<HTMLSpanElement>(null);
  const timeline = useRef<gsap.core.Timeline>(undefined);
  const on = q !== undefined;
  useLayoutEffect(() => {
    const el = plate.current;
    // Daktiloda yazı henüz boşsa plaka yok: ilk kelime gelince kurulur.
    if (!on || !el) return;
    const tl = gsap
      .timeline({ paused: true })
      .fromTo(el, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.35, ease: "power3.out" })
      .fromTo(
        el.querySelectorAll("[data-word] > span"),
        { yPercent: 110, rotate: 4, opacity: 0 },
        { yPercent: 0, rotate: 0, opacity: 1, duration: 0.45, ease: "back.out(1.7)", stagger: 0.07 },
        0.15,
      );
    timeline.current = tl;
    return () => {
      // Satır içi stiller geri alınır: animasyon kalkarsa yazı özgün haline döner.
      tl.revert();
      timeline.current = undefined;
    };
  }, [on, words]);
  useLayoutEffect(() => {
    if (q !== undefined) timeline.current?.progress(q);
  });
  return plate;
}

/** Kelimeleri maskeli kutulara böler (boşluklar korunur); GSAP iç kutuyu yükseltir. */
export function splitWords(text: string): ReactNode[] {
  const mask: CSSProperties = { display: "inline-block", overflow: "hidden", verticalAlign: "bottom", paddingBottom: "0.1em", marginBottom: "-0.1em" };
  return text.split(/(\s+)/).map((part, i) =>
    /^\s*$/.test(part) ? (
      part
    ) : (
      <span key={i} data-word="" style={mask}>
        <span style={{ display: "inline-block" }}>{part}</span>
      </span>
    ),
  );
}

export const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

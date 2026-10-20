import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";

const reduced = (): boolean => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Fades and lifts its content in when it scrolls into view (instantly visible for users who prefer reduced motion). */
export function Reveal({ children, delay = 0, as: Tag = "div", className = "" }: { children: ReactNode; delay?: number; as?: ElementType; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [on, setOn] = useState(() => reduced() || typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (on || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  return (
    <Tag ref={ref} style={{ transitionDelay: on ? `${delay}ms` : "0ms" }} className={`transition-[opacity,transform] duration-700 ease-out ${on ? "translate-y-0 opacity-100" : "translate-y-7 opacity-0"} ${className}`}>
      {children}
    </Tag>
  );
}

/** Counts up to `to` when first visible. */
export function CountUp({ to, className = "" }: { to: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [v, setV] = useState(() => (reduced() ? to : 0));
  useEffect(() => {
    if (reduced() || v === to) return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const run = () => {
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / 1400);
        setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    if (typeof IntersectionObserver === "undefined") return run();
    const io = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) {
        io.disconnect();
        run();
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- animate once per target
  }, [to]);
  return (
    <span ref={ref} className={`tabular ${className}`}>
      {v}
    </span>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

/** Fade/slide children in when they scroll into view (once). */
export function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no observer support: show content immediately.
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${visible ? "is-visible" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** Count up to a real, fixed product number when visible. */
export function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced motion: jump to the final value.
      setValue(to);
      return;
    }
    let frame = 0;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 1200);
        setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to]);
  return (
    <span ref={ref} className="tabular-nums">
      {value}
      {suffix}
    </span>
  );
}

const SCRIPT_LINES = [
  "HOOK: Your first eight seconds decide whether anyone stays.",
  "Here is the one-line fix top creators use…",
  "SETUP: Three openings, tested side by side.",
];

/** Typewriter that cycles through lines of a sample script. */
export function Typewriter() {
  const [line, setLine] = useState(0);
  const [chars, setChars] = useState(0);
  useEffect(() => {
    const text = SCRIPT_LINES[line];
    if (chars < text.length) {
      const id = window.setTimeout(() => setChars((c) => c + 1), 28);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => {
      setLine((l) => (l + 1) % SCRIPT_LINES.length);
      setChars(0);
    }, 1600);
    return () => window.clearTimeout(id);
  }, [chars, line]);
  return (
    <p className="min-h-[2.6em] text-[13px] leading-snug text-white/85">
      {SCRIPT_LINES[line].slice(0, chars)}
      <span className="ml-0.5 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse bg-violet-300" />
    </p>
  );
}

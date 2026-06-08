"use client";

import { useEffect, useRef, useState } from "react";

// ── Theme-aware chart chrome (axis/grid/ink), re-reads on theme flip ──────────
const DARK = { axis: "#8a96ab", grid: "#243049", ink: "#0b0f17", fg: "#dbe2f0", panel: "#121826" };

export function readChrome() {
  if (typeof document === "undefined") return DARK;
  const cs = getComputedStyle(document.documentElement);
  const trip = (n) => cs.getPropertyValue(`--${n}`).trim().split(/\s+/).join(", ");
  const muted = trip("muted"), line = trip("line"), ink = trip("ink"), fg = trip("fg"), panel2 = trip("panel2");
  if (!muted || !line) return DARK;
  return {
    axis: `rgb(${muted})`, grid: `rgb(${line})`, ink: `rgb(${ink})`,
    fg: `rgb(${fg})`, panel: `rgb(${panel2 || ink})`,
  };
}

export function useChrome() {
  const [c, setC] = useState(DARK);
  useEffect(() => {
    const u = () => setC(readChrome());
    u();
    window.addEventListener("themechange", u);
    return () => window.removeEventListener("themechange", u);
  }, []);
  return c;
}

// ── Count-up: animates a number from 0 → value once it scrolls into view ──────
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export function useCountUp(value, { duration = 900, decimals = 0 } = {}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const run = () => {
      if (started.current) return;
      started.current = true;
      const target = Number(value) || 0;
      const t0 = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - t0) / duration);
        setDisplay(target * easeOut(p));
        if (p < 1) requestAnimationFrame(tick);
        else setDisplay(target);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && run()), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);
  return [ref, Number(display).toFixed(decimals)];
}

export const TONE_TEXT = {
  up: "text-up", down: "text-down", amber: "text-amber-400", accent: "text-accent", muted: "text-muted",
};
export const TONE_RGB = {
  up: "22 199 132", down: "234 57 67", amber: "240 160 32", accent: "96 165 250", muted: "138 150 171",
};

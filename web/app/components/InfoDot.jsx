"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { HELP } from "../lib/help";

const TONE = {
  up: "#16c784",
  down: "#ea3943",
  accent: "#5b8cff",
  amber: "#f0a020",
  muted: "#8a96ab",
};

const POP_W = 320;

// Small "?" help icon + inline timeframe pill. Click opens a detailed popover
// explaining what the metric is, how it's computed, benchmark thresholds and the
// exact data window. Rendered via a portal so it escapes table/card clipping.
export default function InfoDot({ topic, info, period, hidePeriod = false, className = "" }) {
  const data = info || (topic ? HELP[topic] : null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0, above: false });
  const btnRef = useRef(null);

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const left = Math.max(8, Math.min(r.left, vw - POP_W - 8));
    const below = r.bottom + 8;
    const above = vh - r.top + 8;
    // open upward if the button sits in the lower 45% of the viewport
    const goUp = r.bottom > vh * 0.55;
    setPos({ left, top: goUp ? above : below, above: goUp });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onMove = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, place]);

  if (!data) return null;

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen((o) => !o);
  };

  return (
    <span className={`inline-flex items-center gap-1.5 align-middle ${className}`} onClick={(e) => e.stopPropagation()}>
      {!hidePeriod && (period || data.window) && (
        <span className="chip chip-muted text-[10px] py-0.5 leading-none whitespace-nowrap">
          {period || data.window}
        </span>
      )}
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={`About ${data.title}`}
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full border text-[10px] font-bold leading-none transition shrink-0 ${
          open ? "border-accent text-accent bg-accent/10" : "border-line text-muted hover:text-accent hover:border-accent/60"
        }`}
      >
        ?
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              left: pos.left,
              [pos.above ? "bottom" : "top"]: pos.top,
              width: POP_W,
              zIndex: 71,
            }}
            className="bg-panel2 border border-line rounded-xl shadow-2xl p-3.5 text-left max-h-[70vh] overflow-y-auto"
          >
            {/* header */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4 className="text-sm font-bold text-white leading-tight">{data.title}</h4>
              {data.window && (
                <span className="chip chip-accent text-[10px] shrink-0 whitespace-nowrap">{data.window}</span>
              )}
            </div>

            {data.what && <p className="text-xs text-white/85 leading-relaxed mb-2.5">{data.what}</p>}

            {data.how?.length > 0 && (
              <div className="mb-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-accent mb-1">How it's calculated</div>
                <ul className="space-y-1">
                  {data.how.map((h, i) => (
                    <li key={i} className="text-[11px] text-muted leading-relaxed flex gap-1.5">
                      <span className="text-accent/60 mt-px">›</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.benchmarks?.length > 0 && (
              <div className="mb-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-accent mb-1">Benchmarks</div>
                <div className="space-y-1">
                  {data.benchmarks.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: TONE[b.tone] || TONE.muted }} />
                      <span className="font-mono text-white/90 whitespace-nowrap">{b.label}</span>
                      <span className="text-muted truncate">— {b.note}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.windowLong && (
              <div className="mb-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-accent mb-1">Data window</div>
                <p className="text-[11px] text-muted leading-relaxed">{data.windowLong}</p>
              </div>
            )}

            <div className="pt-2 border-t border-line/60 flex items-center justify-between gap-2">
              {data.source && <span className="text-[10px] text-muted/80 truncate">Source: {data.source}</span>}
              <span className="text-[10px] text-muted/60 italic shrink-0">Not investment advice</span>
            </div>
          </div>
        </>,
        document.body
      )}
    </span>
  );
}

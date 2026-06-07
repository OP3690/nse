"use client";

import Link from "next/link";
import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

// ---- shared lazy fetch of the per-symbol hover-card map (loaded once) --------
let _cache = null;
let _promise = null;
function loadTips() {
  if (_cache) return Promise.resolve(_cache);
  if (!_promise) {
    _promise = fetch("/api/tooltips")
      .then((r) => (r.ok ? r.json() : {}))
      .then((m) => { _cache = m || {}; return _cache; })
      .catch(() => ({}));
  }
  return _promise;
}

const CAP_STYLE = {
  "Large Cap": "bg-accent/15 text-accent border-accent/30",
  "Mid Cap": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Small Cap": "bg-up/15 text-up border-up/30",
  "Micro Cap": "bg-down/15 text-down border-down/30",
};

const SIGNAL_DOT = {
  "Strong Accumulation": "bg-up",
  "Accumulation": "bg-up/70",
  "Distribution": "bg-down",
  "Neutral": "bg-muted",
};

function fmtINR(n) {
  return n == null ? "—" : Number(n).toLocaleString("en-IN");
}

// Tiny volume sparkline. values are 0..100 (already normalised by the pipeline).
function Spark({ values, up }) {
  if (!values || values.length < 2) return null;
  const w = 132, h = 30, n = values.length;
  const step = w / (n - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / 100) * (h - 4) - 2).toFixed(1)}`);
  const stroke = up ? "#16c784" : "#ea3943";
  const area = `0,${h} ${pts.join(" ")} ${w},${h}`;
  const gid = up ? "spkU" : "spkD";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gid})`} />
      <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth="1.5"
        strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => i === n - 1 && (
        <circle key={i} cx={(i * step).toFixed(1)} cy={(h - (v / 100) * (h - 4) - 2).toFixed(1)}
          r="2" fill={stroke} />
      ))}
    </svg>
  );
}

// 52-week range bar with a marker at the current close.
function RangeBar({ high, low, close, pos }) {
  if (high == null || low == null || close == null || high <= low) return null;
  const p = pos != null ? pos : ((close - low) / (high - low)) * 100;
  const clamped = Math.max(0, Math.min(100, p));
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="font-mono text-down">₹{fmtINR(low)}</span>
        <span className="text-muted/70">52-week range</span>
        <span className="font-mono text-up">₹{fmtINR(high)}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-gradient-to-r from-down/50 via-line to-up/50">
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-accent shadow"
          style={{ left: `${clamped}%` }} />
      </div>
      <div className="text-[10px] text-muted text-right mt-0.5">{clamped.toFixed(0)}% of range</div>
    </div>
  );
}

function Card({ tip, symbol, name }) {
  const t = tip || { symbol, company: name };
  const up = (t.pct_change || 0) >= 0;
  const indices = t.indices || [];
  return (
    <div className="w-72 rounded-xl border border-line bg-panel2/95 backdrop-blur-md shadow-2xl shadow-black/50 ring-1 ring-white/5 overflow-hidden animate-rise">
      {/* header */}
      <div className="px-3.5 pt-3 pb-2.5 bg-gradient-to-br from-panel2 to-panel">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold text-white leading-tight">{t.symbol}</div>
            {t.company && <div className="text-[11px] text-muted truncate max-w-[150px]">{t.company}</div>}
          </div>
          <div className="text-right shrink-0">
            <div className="font-mono font-bold text-white tabular-nums">
              {t.close != null ? `₹${fmtINR(t.close)}` : "—"}
            </div>
            <div className={`text-xs font-semibold ${up ? "text-up" : "text-down"}`}>
              {t.pct_change != null ? `${up ? "▲" : "▼"} ${Math.abs(t.pct_change).toFixed(2)}%` : ""}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
          {t.cap_tier && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${CAP_STYLE[t.cap_tier] || "bg-line text-muted border-line"}`}>
              {t.cap_tier}
            </span>
          )}
          {t.sector && <span className="text-[10px] text-muted truncate max-w-[150px]">{t.sector}</span>}
        </div>
      </div>

      <div className="px-3.5 py-2.5 space-y-2.5 border-t border-line/60">
        <RangeBar high={t.wk_high} low={t.wk_low} close={t.close} pos={t.wk52_pos} />

        {t.vol_spark && (
          <div>
            <div className="flex items-center justify-between text-[10px] mb-0.5">
              <span className="text-muted/70">Volume trend (12d)</span>
              {t.vol_surge != null && (
                <span className={`font-mono ${t.vol_surge >= 1.2 ? "text-up" : t.vol_surge < 0.8 ? "text-down" : "text-muted"}`}>
                  {t.vol_surge.toFixed(2)}× avg
                </span>
              )}
            </div>
            <Spark values={t.vol_spark} up={up} />
          </div>
        )}

        {/* mini stats */}
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-lg bg-panel/60 py-1">
            <div className="text-[9px] text-muted uppercase tracking-wide">Deliv</div>
            <div className="font-mono text-xs text-white">{t.deliv_pct != null ? `${t.deliv_pct.toFixed(0)}%` : "—"}</div>
          </div>
          <div className="rounded-lg bg-panel/60 py-1">
            <div className="text-[9px] text-muted uppercase tracking-wide">T/O Cr</div>
            <div className="font-mono text-xs text-white">{t.turnover_cr != null ? fmtINR(Math.round(t.turnover_cr)) : "—"}</div>
          </div>
          <div className="rounded-lg bg-panel/60 py-1">
            <div className="text-[9px] text-muted uppercase tracking-wide">Score</div>
            <div className="font-mono text-xs text-white">{t.score != null ? t.score.toFixed(0) : "—"}</div>
          </div>
        </div>

        {t.signal && (
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className={`w-1.5 h-1.5 rounded-full ${SIGNAL_DOT[t.signal] || "bg-muted"}`} />
            <span className="text-muted">{t.signal}</span>
          </div>
        )}

        {indices.length > 0 && (
          <div>
            <div className="text-[10px] text-muted/70 mb-1">Index membership</div>
            <div className="flex flex-wrap gap-1">
              {indices.slice(0, 7).map((ix) => (
                <span key={ix} className="text-[9.5px] font-medium px-1.5 py-0.5 rounded-full bg-accent/10 text-accent/90 border border-accent/20">
                  {ix}
                </span>
              ))}
              {indices.length > 7 && (
                <span className="text-[9.5px] text-muted px-1 py-0.5">+{indices.length - 7}</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StockTip({ symbol, name, children, className }) {
  const [tip, setTip] = useState(null);
  const [box, setBox] = useState(null); // {left, top, placement}
  const triggerRef = useRef(null);
  const timer = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const open = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const CARD_W = 288, CARD_H = 340, GAP = 8;
      const below = r.bottom + GAP + CARD_H < window.innerHeight || r.top < CARD_H;
      const top = below ? r.bottom + GAP : r.top - GAP - CARD_H;
      let left = r.left + r.width / 2 - CARD_W / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - CARD_W - 8));
      setBox({ left, top, below });
      const map = await loadTips();
      setTip(map[symbol] || { symbol, company: name });
    }, 110);
  }, [symbol, name]);

  const close = useCallback(() => {
    clearTimeout(timer.current);
    setBox(null);
  }, []);

  return (
    <span ref={triggerRef} onMouseEnter={open} onMouseLeave={close} onFocus={open} onBlur={close}
      className="inline-block">
      {children || (
        <Link href={`/stock/${symbol}`}
          className={className || "font-semibold text-white hover:text-accent transition"}>
          {symbol}
        </Link>
      )}
      {mounted && box && createPortal(
        <div style={{ position: "fixed", left: box.left, top: box.top, zIndex: 60 }}
          className="pointer-events-none">
          <Card tip={tip} symbol={symbol} name={name} />
        </div>,
        document.body
      )}
    </span>
  );
}

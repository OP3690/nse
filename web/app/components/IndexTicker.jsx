"use client";

import { useEffect, useRef, useState } from "react";
import InfoDot from "./InfoDot";

// Help topics for tiles that carry a "?" explainer (keyed by tile label).
const TILE_HELP = { "India VIX": "dash.vix" };

// Headline index tiles (Nifty 50, Sensex, India VIX) under the dashboard title.
// Hydrates with the server snapshot, then polls /api/indices for live,
// exchange-authoritative quotes (NSE allIndices + Yahoo ^BSESN) so the values
// stay current during market hours without a page reload. Falls back silently
// to the last good data if a poll fails.

const POLL_MS = 45_000;

function fmt(n, dec) {
  return Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function Tile({ ix }) {
  const up = (ix.pct ?? 0) >= 0;
  // VIX is inverted — a rising VIX is risk-off, so colour it red when up.
  const good = ix.invert ? !up : up;
  const tone = ix.pct == null ? "text-muted" : good ? "text-up" : "text-down";
  const help = TILE_HELP[ix.label];
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5 transition hover:bg-panel2/70">
      <span className="text-[10px] uppercase tracking-wider text-muted font-semibold flex items-center gap-1">
        {ix.label}
        {help && <InfoDot topic={help} hidePeriod className="ml-0.5" />}
      </span>
      <span className="font-mono text-base font-bold text-white tabular-nums leading-tight">{fmt(ix.last, ix.decimals)}</span>
      <span className={`font-mono text-[11px] font-semibold tabular-nums ${tone}`}>
        {ix.pct == null ? "—" : (
          <>{up ? "▲ +" : "▼ "}{ix.change != null ? fmt(ix.change, ix.decimals) : ""} ({up ? "+" : ""}{Number(ix.pct).toFixed(2)}%)</>
        )}
      </span>
    </div>
  );
}

export default function IndexTicker({ initial }) {
  const [items, setItems] = useState(initial || []);
  const [live, setLive] = useState(false);
  const [updated, setUpdated] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    let alive = true;

    async function poll() {
      try {
        const r = await fetch("/api/indices", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (!alive || !Array.isArray(j.indices) || !j.indices.length) return;
        setItems(j.indices);
        setLive(j.source === "live");
        setUpdated(j.ts || Date.now());
      } catch {
        /* keep last good data */
      }
    }

    function schedule() {
      clearInterval(timer.current);
      // Only poll while the tab is visible — no point hammering NSE in the
      // background, and it resumes immediately on focus.
      if (document.visibilityState === "visible") {
        poll();
        timer.current = setInterval(poll, POLL_MS);
      }
    }

    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      alive = false;
      clearInterval(timer.current);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, []);

  if (!items.length) return null;

  const updatedLabel = updated
    ? new Date(updated).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="flex items-stretch divide-x divide-line rounded-xl border border-line bg-panel2/40 overflow-hidden">
      {items.map((ix) => <Tile key={ix.label} ix={ix} />)}
      <div className="flex flex-col justify-center px-3 py-2.5 gap-1">
        <span
          className="inline-flex items-center gap-1.5 text-[9px] uppercase tracking-wider font-bold"
          title={live
            ? `Live quotes${updatedLabel ? ` · updated ${updatedLabel}` : ""}`
            : "End-of-day snapshot (live feed unavailable)"}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${live ? "bg-up animate-pulse" : "bg-muted/50"}`} />
          <span className={live ? "text-up" : "text-muted"}>{live ? "Live" : "EOD"}</span>
        </span>
        {updatedLabel && <span className="text-[9px] text-muted/70 tabular-nums">{updatedLabel}</span>}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Compact, single-letter-free section glyphs. Each is a 16px stroke icon so the
// nav stays scannable without crowding the bar. Kept inline to avoid an icon dep.
const ICONS = {
  "/": "M3 13h4l2.5 6 5-15L17 13h4",                              // pulse line
  "/pulse": "M4 19V5m5 14V9m5 10V4m5 15v-7",                       // bars
  "/forecast": "M3 17l5-5 4 3 8-9M21 6h-4m4 0v4",                  // trend arrow
  "/flows": "M4 7h12m0 0-3-3m3 3-3 3M20 17H8m0 0 3-3m-3 3 3 3",   // bi-directional flow
  "/sectors": "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z", // grid/tiles
  "/intelligence": "M12 3a6 6 0 0 0-4 10.5V17h8v-3.5A6 6 0 0 0 12 3ZM9 20h6m-5 2h4", // bulb
  "/ipo": "M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5-2 2m-7 7-2 2m11 0-2-2m-7-7-2-2", // radar/burst
  "/screener": "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 4 4",   // magnifier
  "/strategy": "M3 3v18h18M8 14l3-4 3 3 4-6",                      // strategy chart
};

const LINKS = [
  ["/", "Dashboard"],
  ["/pulse", "Market Pulse"],
  ["/forecast", "Forecast"],
  ["/flows", "Flows"],
  ["/sectors", "Sectors"],
  ["/intelligence", "Intelligence"],
  ["/ipo", "IPO Radar"],
  ["/screener", "Screener"],
  ["/strategy", "Strategy Lab"],
];

export default function NavBar() {
  const path = usePathname() || "/";
  return (
    <nav className="flex items-center gap-0.5 rounded-xl border border-line/70 bg-panel2/30 p-1 shadow-[inset_0_1px_0_rgb(255_255_255/0.03)]">
      {LINKS.map(([href, label]) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`group relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[13px] font-medium leading-none transition-all duration-200 ${
              active
                ? "text-white"
                : "text-muted hover:text-white hover:bg-panel/70"
            }`}
          >
            {/* active background pill with soft accent glow */}
            {active && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-lg bg-gradient-to-b from-accent/25 to-accent/10 ring-1 ring-inset ring-accent/40 shadow-[0_0_0_1px_rgb(var(--accent)/0.15),0_4px_14px_-4px_rgb(var(--accent)/0.55)]"
              />
            )}
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`relative shrink-0 transition-transform duration-200 ${
                active ? "text-accent" : "text-muted/70 group-hover:text-accent/80 group-hover:scale-110"
              }`}
            >
              <path d={ICONS[href]} />
            </svg>
            <span className="relative">{label}</span>
            {/* active underline accent */}
            {active && (
              <span
                aria-hidden
                className="absolute -bottom-px left-2.5 right-2.5 h-0.5 rounded-full bg-gradient-to-r from-accent to-[#7aa2ff]"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

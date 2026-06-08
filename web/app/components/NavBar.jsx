"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/", "Dashboard"],
  ["/pulse", "Market Pulse"],
  ["/forecast", "Forecast"],
  ["/flows", "Flows"],
  ["/intelligence", "Intelligence"],
  ["/ipo", "IPO Radar"],
  ["/screener", "Screener"],
  ["/strategy", "Strategy Lab"],
];

export default function NavBar() {
  const path = usePathname() || "/";
  return (
    <nav className="flex items-center gap-0.5 text-sm">
      {LINKS.map(([href, label]) => {
        const active = href === "/" ? path === "/" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              active
                ? "bg-accent/15 text-white font-medium"
                : "text-muted hover:text-white hover:bg-panel2"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

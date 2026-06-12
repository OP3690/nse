import "./globals.css";
import Link from "next/link";
import NavBar from "./components/NavBar";
import SyncButton from "./components/SyncButton";
import ThemeToggle from "./components/ThemeToggle";

export const metadata = {
  title: "NSE Flow — where the money is moving",
  description: "Daily institutional money-flow analytics from NSE reports: delivery accumulation, FII/DII, OI buildup, bulk & block deals.",
};

// Runs before first paint to avoid a light/dark flash: applies the saved theme
// (or the default dark) to <html> synchronously, ahead of React hydration.
const NO_FLASH = `(function(){try{var t=localStorage.getItem('theme');if(t==='light')document.documentElement.classList.add('light');else if(t!=='dark'){document.documentElement.classList.remove('light');}}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH }} />
      </head>
      <body className="min-h-screen font-sans antialiased bg-ink">
        <header className="sticky top-0 z-30 border-b border-line/80 bg-ink/75 backdrop-blur-xl supports-[backdrop-filter]:bg-ink/60">
          {/* gradient hairline accent under the header */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center gap-4">
            <Link href="/" className="group flex items-center gap-2 shrink-0" aria-label="NSE Flow home">
              {/* animated flow mark */}
              <span className="relative grid place-items-center w-8 h-8 rounded-lg bg-gradient-to-br from-accent/25 to-up/20 ring-1 ring-inset ring-accent/30 transition-transform duration-300 group-hover:scale-105">
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                  <path d="M3 14l4-4 4 3 6-7" />
                  <path d="M17 6h3v3" />
                </svg>
                <span aria-hidden className="absolute inset-0 rounded-lg bg-accent/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </span>
              <span className="font-bold text-lg tracking-tight leading-none">
                <span className="text-white">NSE</span>
                <span className="gradient-text">Flow</span>
              </span>
            </Link>
            <div className="hidden md:block">
              <NavBar />
            </div>
            <div className="ml-auto flex items-center gap-2.5 text-xs text-muted">
              <div className="flex items-center gap-1.5">
                <ThemeToggle />
                <SyncButton />
              </div>
              <span className="hidden lg:inline-flex items-center pl-2.5 ml-0.5 border-l border-line/70">
                <span className="chip chip-up" title="Money-flow analytics · not investment advice">
                  <span className="w-1.5 h-1.5 rounded-full bg-up animate-pulse" />
                  Live
                </span>
              </span>
            </div>
          </div>
          <div className="md:hidden border-t border-line/60 px-3 py-2 overflow-x-auto no-scrollbar edge-fade-x">
            <NavBar />
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 py-6 animate-rise">{children}</main>
        <footer className="max-w-7xl mx-auto px-4 py-8 mt-8 border-t border-line">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
            <span>
              <span className="font-semibold text-white/80">NSE</span>
              <span className="gradient-text font-semibold">Flow</span>
              {" "}— built from public NSE end-of-day reports. Quantitative observations of order
              flow, not predictions or recommendations.
            </span>
            <span className="chip chip-muted">Not investment advice</span>
          </div>
        </footer>
      </body>
    </html>
  );
}

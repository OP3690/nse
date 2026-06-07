import "./globals.css";
import Link from "next/link";
import NavBar from "./components/NavBar";
import SyncButton from "./components/SyncButton";

export const metadata = {
  title: "NSE Flow — where the money is moving",
  description: "Daily institutional money-flow analytics from NSE reports: delivery accumulation, FII/DII, OI buildup, bulk & block deals.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased bg-ink">
        <header className="border-b border-line bg-ink/70 backdrop-blur-xl sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
            <Link href="/" className="font-bold text-lg tracking-tight shrink-0">
              <span className="text-white">NSE</span>
              <span className="gradient-text">Flow</span>
            </Link>
            <div className="hidden md:block">
              <NavBar />
            </div>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted">
              <SyncButton />
              <span className="hidden sm:inline-flex chip chip-muted">
                <span className="w-1.5 h-1.5 rounded-full bg-up mr-1 animate-pulse" />
                Money-flow analytics
              </span>
              <span className="hidden lg:inline">not investment advice</span>
            </div>
          </div>
          <div className="md:hidden border-t border-line/60 px-3 py-2 overflow-x-auto">
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

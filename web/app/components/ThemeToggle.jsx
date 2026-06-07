"use client";

import { useEffect, useState } from "react";

// Light/dark toggle. The actual <html> class is set pre-paint by the inline
// no-flash script in layout.jsx (reads localStorage, default dark), so on mount
// we just read the current class to sync our button state — no flash, no
// hydration mismatch (the button only renders its icon after mount).
export default function ThemeToggle() {
  const [theme, setTheme] = useState(null); // null until mounted

  useEffect(() => {
    setTheme(document.documentElement.classList.contains("light") ? "light" : "dark");
  }, []);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    const root = document.documentElement;
    root.classList.toggle("light", next === "light");
    try {
      localStorage.setItem("theme", next);
    } catch {}
    setTheme(next);
    // Let charts and other CSS-var readers know the palette changed.
    window.dispatchEvent(new Event("themechange"));
  }

  const isLight = theme === "light";

  return (
    <button
      onClick={toggle}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      aria-label="Toggle color theme"
      className="inline-flex items-center justify-center rounded-lg border border-line px-2 py-1 text-muted transition-colors hover:text-white hover:border-accent"
    >
      {/* Keep a fixed-size box so layout is stable before mount (theme === null). */}
      <span className="grid place-items-center w-[15px] h-[15px]">
        {theme == null ? null : isLight ? (
          // sun
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
        ) : (
          // moon
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </span>
    </button>
  );
}

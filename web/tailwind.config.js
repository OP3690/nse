/** @type {import('tailwindcss').Config} */
// Colors are CSS variables holding "R G B" triplets (see globals.css :root /
// html.light). Wrapping them as rgb(var(--x) / <alpha-value>) keeps every
// Tailwind opacity modifier working (bg-up/15, border-line/60, text-white/80…)
// while letting the whole palette swap between light and dark themes.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ["./app/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: v("ink"),
        panel: v("panel"),
        panel2: v("panel2"),
        line: v("line"),
        up: v("up"),
        down: v("down"),
        accent: v("accent"),
        muted: v("muted"),
        // `white` is remapped to the theme foreground so the many text-white /
        // bg-white/x usages become high-contrast in light mode automatically.
        white: v("fg"),
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
      },
    },
  },
  plugins: [],
};

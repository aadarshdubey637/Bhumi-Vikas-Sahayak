// Design tokens. Status colours follow the product rule: pending/unverified is amber (expected state),
// never red; green/teal is reserved for verified results; grey is "not established / not evaluated".
// Palette: light, airy surfaces with near-black navy surfaces with a gold accent; gold = interactive, green = verified, amber = pending, red = error.
// Text/background pairs used for body copy were checked for WCAG AA (>= 4.5:1) - see docs/design-system.md.
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Colours are CSS variables (src/index.css) so a panel can switch to the dark palette with `theme-dark` / `panel-dark`.
      colors: {
        ink: { DEFAULT: v("ink"), soft: v("ink-soft"), faint: v("ink-faint") },
        surface: { DEFAULT: v("surface"), sunken: v("surface-sunken"), page: v("surface-page") },
        navy: { DEFAULT: "#262c3d", 800: "#2f3649", 700: "#3a4258", night: "#0d1019" },
        line: { DEFAULT: v("line"), strong: v("line-strong") },
        nav: { DEFAULT: v("surface"), raised: v("brand-tint"), line: v("line"), text: v("ink-soft"), active: v("ink") },
        brand: { DEFAULT: v("brand"), dark: v("brand-dark"), tint: v("brand-tint"), ring: v("brand-ring") },
        accent: { DEFAULT: "#F5B301", dark: "#8A5F00", tint: "#FFF3CC", text: v("accent-text") },
        pending: { DEFAULT: v("pending"), tint: v("pending-tint"), line: v("pending-line") },
        verified: { DEFAULT: v("verified"), tint: v("verified-tint"), line: v("verified-line") },
        danger: { DEFAULT: v("danger"), tint: v("danger-tint"), line: v("danger-line") },
        info: { DEFAULT: v("info"), tint: v("info-tint"), line: v("info-line") },
        muted: { DEFAULT: v("muted"), tint: v("muted-tint"), line: v("muted-line") },
      },
      // Type scale measured from the reference design: 15 px UI text, 17 px body, 19 px field values; Hindi is bumped up in index.css.
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.2rem" }],
        sm: ["0.9375rem", { lineHeight: "1.4rem" }],
        base: ["1.0625rem", { lineHeight: "1.65rem" }],
        lg: ["1.1875rem", { lineHeight: "1.8rem" }],
        xl: ["1.375rem", { lineHeight: "1.95rem" }],
        "2xl": ["1.625rem", { lineHeight: "2.15rem" }],
        "3xl": ["2rem", { lineHeight: "2.5rem" }],
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"Noto Sans Devanagari"', "system-ui", "sans-serif"],
        deva: ['"Noto Sans Devanagari"', '"IBM Plex Sans"', "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      borderRadius: { DEFAULT: "0.5rem", lg: "0.75rem", xl: "1rem", "2xl": "1.25rem", "3xl": "1.75rem" },
      boxShadow: {
        card: "0 1px 2px rgba(15,27,45,0.05), 0 1px 3px rgba(15,27,45,0.06)",
        glass: "0 8px 32px rgba(10,35,66,0.10), inset 0 1px 0 rgba(255,255,255,0.35)",
        panel: "0 18px 50px rgba(3,10,24,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
        glow: "0 6px 20px rgba(245,179,1,0.28)",
        lift: "0 4px 14px rgba(15,27,45,0.10)",
        pop: "0 12px 32px rgba(15,27,45,0.18)",
      },
      keyframes: {
        "fade-up": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        "slide-in-left": { from: { transform: "translateX(-100%)" }, to: { transform: "none" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "toast-in": { from: { opacity: "0", transform: "translateY(8px) scale(0.98)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        "fade-up": "fade-up 220ms ease-out both",
        "slide-in-left": "slide-in-left 220ms cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 160ms ease-out both",
        "toast-in": "toast-in 200ms ease-out both",
      },
      minHeight: { tap: "44px" },
      minWidth: { tap: "44px" },
    },
  },
  plugins: [],
};

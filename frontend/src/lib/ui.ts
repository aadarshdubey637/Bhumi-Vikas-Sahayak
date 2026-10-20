// Shared Tailwind class strings (tap targets >= 44px, visible focus comes from index.css).
// Transitions/press feedback are `motion-safe:` so they disappear for prefers-reduced-motion users.
const press = "transition-colors motion-safe:transition-[colors,transform] motion-safe:active:scale-[0.98]";
export const btn = `inline-flex min-h-tap items-center justify-center gap-2 rounded-xl border border-line bg-surface/80 px-4 py-2 text-sm font-semibold text-ink shadow-card hover:border-brand-ring hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50 ${press}`;
export const btnPrimary = `inline-flex min-h-tap items-center justify-center gap-2 rounded-xl border border-brand bg-gradient-to-b from-[#2858E6] to-brand px-5 py-2 text-sm font-semibold text-white shadow-glow hover:from-brand hover:to-brand-dark disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${press}`;
export const btnAccent = `inline-flex min-h-tap items-center justify-center gap-2 rounded-xl border border-brand bg-brand px-5 py-2 text-sm font-bold text-white shadow-card hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none ${press}`;
export const btnLink = "inline-flex min-h-tap items-center gap-1 text-sm font-semibold text-brand underline-offset-2 hover:underline";
export const input =
  "min-h-tap w-full rounded-xl border border-line-strong bg-surface/90 px-3.5 py-2 text-sm text-ink placeholder:text-ink-faint transition-[border-color,box-shadow] hover:border-ink-faint focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/15";
export const card = "glass rounded-2xl p-4 sm:p-5";
/** Card that is itself a link/button target: lifts slightly on hover. */
export const cardInteractive = `${card} motion-safe:transition-[box-shadow,transform] hover:shadow-lift motion-safe:hover:-translate-y-0.5`;
export const label = "mb-1.5 block text-sm font-semibold text-ink";
export const errorText = "mt-1 text-sm text-danger";

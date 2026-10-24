/** NirmaanSetu mark: a bridge ("setu") arching over a building baseline, the link between a plot and its rules. Original artwork. */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={className} fill="none">
      <rect width="40" height="40" rx="11" fill="#1b2030" />
      <path d="M7 27 Q20 8 33 27" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M13 20.3V27M20 17.5V27M27 20.3V27" stroke="#9aa3ba" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5.5 27H34.5" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M9 31.5H31" stroke="#F5B301" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="2 3" />
    </svg>
  );
}

export function Wordmark({ collapsed = false, tone = "dark", compact = false }: { collapsed?: boolean; tone?: "dark" | "light"; compact?: boolean }) {
  if (collapsed) return null;
  const main = tone === "dark" ? "text-ink" : "text-white";
  const sub = tone === "dark" ? "text-ink-faint" : "text-white/70";
  if (compact) {
    return (
      <span className={`block truncate text-[1.375rem] font-extrabold tracking-tight ${main}`}>
        Nirmaan<span className="text-[#F5B301]">Setu</span>
      </span>
    );
  }
  return (
    <span className="min-w-0 leading-tight">
      <span className={`block truncate text-[0.9375rem] font-semibold tracking-tight ${main}`}>
        Nirmaan<span className="text-[#F5B301]">Setu</span>
      </span>
      <span className={`block truncate text-[0.6875rem] font-medium uppercase tracking-wider ${sub}`}>Bhumi Vikas Sahayak</span>
    </span>
  );
}

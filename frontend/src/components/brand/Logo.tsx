/** NirmaanSetu mark: a bridge ("setu") arching over a building baseline, the link between a plot and its rules. Original artwork. */
export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className={className} fill="none">
      <rect width="40" height="40" rx="10" fill="#0A2342" />
      <path d="M7 27 Q20 8 33 27" stroke="#7CA2FF" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M13 20.3V27M20 17.5V27M27 20.3V27" stroke="#BFD0FF" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5.5 27H34.5" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M9 31.5H31" stroke="#3E6BE8" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 3" />
    </svg>
  );
}

export function Wordmark({ collapsed = false, tone = "dark" }: { collapsed?: boolean; tone?: "dark" | "light" }) {
  if (collapsed) return null;
  const main = tone === "dark" ? "text-ink" : "text-white";
  const sub = tone === "dark" ? "text-ink-faint" : "text-white/70";
  return (
    <span className="min-w-0 leading-tight">
      <span className={`block truncate text-[0.9375rem] font-semibold tracking-tight ${main}`}>
        NirmaanSetu <span className={tone === "dark" ? "text-brand" : "text-[#9DB8FF]"}>AI</span>
      </span>
      <span className={`block truncate text-[0.6875rem] font-medium uppercase tracking-wider ${sub}`}>Bhumi Vikas Sahayak</span>
    </span>
  );
}

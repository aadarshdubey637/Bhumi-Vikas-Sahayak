/** Soft colour field behind the whole app. It is what the glass surfaces blur; pure CSS gradients (cheap to paint), decorative only. */
export function Aurora() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-surface-page print:hidden">
      <div
        className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full opacity-70"
        style={{ background: "radial-gradient(closest-side, rgba(59,108,240,0.28), transparent)" }}
      />
      <div
        className="absolute -right-32 top-10 h-[30rem] w-[30rem] rounded-full opacity-60"
        style={{ background: "radial-gradient(closest-side, rgba(14,165,140,0.22), transparent)" }}
      />
      <div
        className="absolute bottom-[-12rem] left-1/3 h-[34rem] w-[34rem] rounded-full opacity-60"
        style={{ background: "radial-gradient(closest-side, rgba(99,102,241,0.20), transparent)" }}
      />
    </div>
  );
}

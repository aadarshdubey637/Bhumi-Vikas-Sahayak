// Original, lightweight SVG illustrations (no raster assets, no network). Decorative: aria-hidden.

/** Isometric massing study on a drafting plot: three blocks, a dashed plot boundary, a road strip and dimension ticks. */
export function HeroBlueprint({ className = "" }: { className?: string }) {
  const edge = "#F5B301";
  return (
    <svg viewBox="0 0 520 420" aria-hidden="true" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* plot boundary + road */}
      <path d="M60 300 L250 392 L470 282 L280 190 Z" stroke={edge} strokeOpacity=".55" strokeDasharray="6 6" />
      <path d="M30 330 L250 440 L500 312" stroke="#fff" strokeOpacity=".25" strokeWidth="14" />
      <path d="M30 330 L250 440 L500 312" stroke={edge} strokeOpacity=".5" strokeDasharray="10 10" />
      {/* tall block */}
      <path d="M150 262 V150 L210 120 V232 Z" fill="#1B4DB5" fillOpacity=".55" stroke={edge} />
      <path d="M210 232 V120 L270 150 V262 Z" fill="#2C63D6" fillOpacity=".45" stroke={edge} />
      <path d="M150 150 L210 120 L270 150 L210 180 Z" fill="#fff" fillOpacity=".18" stroke={edge} />
      {/* wide low block */}
      <path d="M270 292 V236 L350 196 V252 Z" fill="#1B4DB5" fillOpacity=".5" stroke={edge} />
      <path d="M350 252 V196 L420 232 V288 Z" fill="#2C63D6" fillOpacity=".4" stroke={edge} />
      <path d="M270 236 L350 196 L420 232 L340 272 Z" fill="#fff" fillOpacity=".16" stroke={edge} />
      {/* small block */}
      <path d="M110 322 V288 L150 268 V302 Z" fill="#1B4DB5" fillOpacity=".5" stroke={edge} />
      <path d="M150 302 V268 L190 288 V322 Z" fill="#2C63D6" fillOpacity=".4" stroke={edge} />
      <path d="M110 288 L150 268 L190 288 L150 308 Z" fill="#fff" fillOpacity=".16" stroke={edge} />
      {/* window rhythm */}
      <path d="M165 175V215M180 168V208M225 190V235M240 197V242" stroke="#fff" strokeOpacity=".45" strokeWidth="2" />
      {/* dimension line */}
      <path d="M60 322 L250 414" stroke="#7CF0A8" strokeOpacity=".8" />
      <path d="M56 318 l8 8 M246 410 l8 8" stroke="#7CF0A8" strokeOpacity=".8" />
    </svg>
  );
}

/** Generic plot with a road: a schematic, not any real plot. */
export function MiniPlot({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 150" aria-hidden="true" className={className} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="112" width="208" height="28" rx="3" fill="#E4ECFA" stroke="#A3BDE8" strokeDasharray="5 4" />
      <path d="M20 126H200" stroke="#A3BDE8" strokeDasharray="10 8" />
      <rect x="34" y="14" width="152" height="84" rx="2" fill="#E8EEFD" stroke="#1D4ED8" strokeWidth="2" />
      <rect x="62" y="34" width="96" height="44" rx="1.5" fill="#fff" stroke="#1D4ED8" strokeDasharray="4 3" />
      <path d="M34 8H186M34 4v8M186 4v8" stroke="#1C1F26" strokeWidth="1.2" />
      <path d="M200 14V98M196 14h8M196 98h8" stroke="#1C1F26" strokeWidth="1.2" />
      <path d="M110 100v10M106 104l4-4 4 4" stroke="#0A7A3D" strokeWidth="1.4" />
    </svg>
  );
}

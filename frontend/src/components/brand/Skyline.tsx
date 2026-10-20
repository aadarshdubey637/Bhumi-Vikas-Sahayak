// Original line-art skyline used as a quiet page backdrop. Generated from a fixed list (no randomness), decorative only.
const BUILDINGS: ReadonlyArray<readonly [x: number, w: number, h: number]> = [
  [0, 70, 110], [78, 54, 170], [140, 80, 95], [228, 60, 205], [296, 90, 130], [394, 52, 160], [454, 76, 100],
  [538, 64, 225], [610, 84, 120], [702, 50, 150], [760, 90, 90], [858, 58, 190], [924, 80, 135], [1012, 56, 105],
  [1076, 72, 175], [1156, 60, 125], [1224, 86, 95], [1318, 54, 150], [1380, 60, 115],
];

export function Skyline({ className = "" }: { className?: string }) {
  const base = 260;
  return (
    <svg viewBox="0 0 1440 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true" className={className} fill="none">
      <path d="M0 232 Q360 150 720 232 T1440 232" stroke="#1D4ED8" strokeOpacity=".5" strokeWidth="2" />
      {BUILDINGS.map(([x, w, h]) => {
        const top = base - h;
        const windows: JSX.Element[] = [];
        for (let wy = top + 14; wy < base - 16; wy += 22)
          for (let wx = x + 10; wx < x + w - 12; wx += 16)
            windows.push(<rect key={`${wx}-${wy}`} x={wx} y={wy} width="6" height="9" rx="1" fill="#1D4ED8" fillOpacity=".35" />);
        return (
          <g key={x}>
            <rect x={x} y={top} width={w} height={h} fill="#1D4ED8" fillOpacity=".12" stroke="#1D4ED8" strokeOpacity=".55" strokeWidth="1.5" />
            {windows}
          </g>
        );
      })}
    </svg>
  );
}

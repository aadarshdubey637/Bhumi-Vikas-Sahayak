// Canonical units only. The server accepts aliases, but the UI never sends them.
export const LENGTH_UNITS = ["m", "cm", "mm", "ft", "in", "yd"] as const;
export const AREA_UNITS = ["sqm", "sqft", "sqyd", "acre", "hectare"] as const;
export type LengthUnit = (typeof LENGTH_UNITS)[number];
export type AreaUnit = (typeof AREA_UNITS)[number];
export type Dimension = "length" | "area";

export const MEASUREMENT_FIELDS: ReadonlyArray<{ name: string; dim: Dimension }> = [
  { name: "plot_area", dim: "area" },
  { name: "plot_length", dim: "length" },
  { name: "plot_width", dim: "length" },
  { name: "road_width", dim: "length" },
  { name: "building_height", dim: "length" },
  { name: "building_length", dim: "length" },
  { name: "building_width", dim: "length" },
];
export const TEXT_FIELDS = ["building_use", "location"] as const;
export const FLOORS_FIELD = "floors";
export const FLOORS_UNIT = "count";
export const BUILDING_USE_SUGGESTIONS = [
  "residential",
  "commercial",
  "industrial",
  "farm house",
  "institutional",
] as const;

export const unitsFor = (dim: Dimension): readonly string[] => (dim === "area" ? AREA_UNITS : LENGTH_UNITS);
export const defaultUnit = (dim: Dimension): string => (dim === "area" ? "sqm" : "m");

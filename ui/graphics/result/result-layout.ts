export type ResultDensity = "expanded" | "compact" | "dense" | "extra-dense";

export type ResultLayout = {
  density: ResultDensity;
  columns: 2 | 3;
  rows: number;
};

export function getResultLayout(count: number): ResultLayout {
  const safeCount = Math.max(0, count);
  const layout =
    safeCount <= 6
      ? { density: "expanded" as const, columns: 2 as const }
      : safeCount <= 12
        ? { density: "compact" as const, columns: 2 as const }
        : safeCount <= 18
          ? { density: "dense" as const, columns: 3 as const }
          : { density: "extra-dense" as const, columns: 3 as const };
  return { ...layout, rows: safeCount === 0 ? 0 : Math.ceil(safeCount / layout.columns) };
}

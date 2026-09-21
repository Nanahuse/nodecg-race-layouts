import type { CSSProperties } from "react";
import type { RaceResultEntry, RaceResultPageData } from "../../../src/domain";
import { getResultLayout } from "./result-layout";

function ResultRow({ entry }: { entry: RaceResultEntry }) {
  return (
    <div className="result-row" data-status={entry.status}>
      <span className="result-place">{entry.placeLabel}</span>
      <span className="result-name">
        <strong>{entry.name}</strong>
        {entry.secondaryName !== null && <small>{entry.secondaryName}</small>}
      </span>
      <span className="result-time">{entry.time ?? ""}</span>
    </div>
  );
}

export function ResultGraphic({ data }: { data: RaceResultPageData | null }) {
  if (!data) return null;
  const layout = getResultLayout(data.results.length);
  const style = { "--columns": layout.columns, "--rows": layout.rows } as CSSProperties;
  return (
    <main className={`result-graphic density-${layout.density}`}>
      <section className="result-list" style={style} aria-label="Results">
        {data.results.map((entry, index) => (
          <ResultRow key={`${entry.placeLabel}-${entry.name}-${index}`} entry={entry} />
        ))}
      </section>
    </main>
  );
}

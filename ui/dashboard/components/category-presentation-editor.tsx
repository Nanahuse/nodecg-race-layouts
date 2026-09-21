import { useEffect, useState } from "react";
import type { CategoryPresentation, DraftConfig } from "../../../src/domain";
import { createCategoryApi } from "../api/category-api";
export function CategoryPresentationEditor({ draft }: { draft: DraftConfig }) {
  const api = createCategoryApi(() => draft.revision);
  const [value, setValue] = useState<CategoryPresentation | null>(draft.categoryPresentation);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    setValue(draft.categoryPresentation);
  }, [draft.race?.raceId]);
  const update = (patch: Partial<CategoryPresentation>) =>
    setValue(
      value
        ? { ...value, ...patch }
        : {
            title: "",
            subtitle: null,
            ruleHeading: "",
            ruleLines: [],
            leaderboardHeading: "",
            ...patch,
          },
    );
  const run = async (action: () => Promise<{ ok: boolean; message?: string }>) => {
    const result = await action();
    if (!result.ok) setMessage(result.message ?? "Presentation update failed.");
  };
  return (
    <section className="subpanel">
      <h3>Leaderboard Presentation</h3>
      <label>
        Title
        <input value={value?.title ?? ""} onChange={(e) => update({ title: e.target.value })} />
      </label>
      <label>
        Subtitle
        <input
          value={value?.subtitle ?? ""}
          onChange={(e) => update({ subtitle: e.target.value || null })}
        />
      </label>
      <label>
        Rule Heading
        <input
          value={value?.ruleHeading ?? ""}
          onChange={(e) => update({ ruleHeading: e.target.value })}
        />
      </label>
      <label>
        Rule Lines
        <textarea
          value={value?.ruleLines.join("\n") ?? ""}
          onChange={(e) => update({ ruleLines: e.target.value.split("\n") })}
        />
      </label>
      <label>
        Leaderboard Heading
        <input
          value={value?.leaderboardHeading ?? ""}
          onChange={(e) => update({ leaderboardHeading: e.target.value })}
        />
      </label>
      <div className="button-row">
        <button onClick={() => void run(() => api.updatePresentation(value))}>Update Draft</button>
        <button onClick={() => void run(() => api.savePresentation())}>Save Preset</button>
        <button onClick={() => void run(() => api.revertPresentation())}>Revert to Saved</button>
        <button onClick={() => void run(() => api.updatePresentation(null))}>
          Clear Presentation
        </button>
      </div>
      {message && <p className="callout error">{message}</p>}
    </section>
  );
}

import { useEffect, useState } from "react";
import type { CategoryPresentation, DraftConfig } from "../../../src/domain";
import { createCategoryApi } from "../api/category-api";
export function CategoryPresentationEditor({ draft }: { draft: DraftConfig }) {
  const api = createCategoryApi(() => draft.revision);
  const [value, setValue] = useState<CategoryPresentation | null>(draft.categoryPresentation);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [syncTargetRevision, setSyncTargetRevision] = useState<number | null>(null);
  useEffect(() => {
    setValue(draft.categoryPresentation);
    setMessage(null);
    setPending(null);
    setSyncTargetRevision(null);
  }, [draft.race?.raceId]);
  useEffect(() => {
    if (syncTargetRevision !== null && draft.revision === syncTargetRevision) {
      setValue(draft.categoryPresentation);
      setSyncTargetRevision(null);
    }
  }, [draft.revision, draft.categoryPresentation, syncTargetRevision]);
  const dirty = JSON.stringify(value) !== JSON.stringify(draft.categoryPresentation);
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
  const run = async (
    operation: string,
    action: () => Promise<{ ok: boolean; message?: string; draftRevision?: number }>,
  ) => {
    setPending(operation);
    setMessage(null);
    try {
      const result = await action();
      if (!result.ok) setMessage(result.message ?? "Presentation update failed.");
      else if (
        operation !== "save" &&
        "draftRevision" in result &&
        typeof result.draftRevision === "number"
      )
        setSyncTargetRevision(result.draftRevision);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "NodeCG communication error");
    } finally {
      setPending(null);
    }
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
        <button
          disabled={pending !== null || !dirty}
          onClick={() => void run("update", () => api.updatePresentation(value))}
        >
          Update Draft
        </button>
        <button
          disabled={pending !== null || dirty}
          onClick={() => void run("save", () => api.savePresentation())}
        >
          Save Preset
        </button>
        <button
          disabled={pending !== null}
          onClick={() => void run("revert", () => api.revertPresentation())}
        >
          Revert to Saved
        </button>
        <button
          disabled={pending !== null}
          onClick={() => void run("clear", () => api.updatePresentation(null))}
        >
          Clear Presentation
        </button>
      </div>
      {pending && (
        <p className="pending">{pending === "save" ? "Saving preset…" : `${pending}…`}</p>
      )}
      {dirty && <p className="muted">Update Draft first to enable Save Preset.</p>}
      {message && <p className="callout error">{message}</p>}
    </section>
  );
}

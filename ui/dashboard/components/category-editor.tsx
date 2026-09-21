import { useEffect, useState } from "react";
import type { DraftConfig } from "../../../src/domain";
import type {
  SpeedrunCategoryOption,
  SpeedrunGameOptions,
  SpeedrunGameSearchResult,
  SpeedrunVariableOption,
} from "../../../src/protocol/speedrun";
import { createCategoryApi } from "../api/category-api";
import { createSpeedrunApi } from "../api/speedrun-api";

export function CategoryEditor({ draft }: { draft: DraftConfig }) {
  const categoryApi = createCategoryApi(() => draft.revision);
  const speedrunApi = createSpeedrunApi();
  const [query, setQuery] = useState("");
  const [games, setGames] = useState<SpeedrunGameSearchResult[]>([]);
  const [options, setOptions] = useState<SpeedrunGameOptions | null>(null);
  const [variables, setVariables] = useState<SpeedrunVariableOption[]>([]);
  const [selection, setSelection] = useState(draft.categorySelection.selection);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mappingBusy, setMappingBusy] = useState<string | null>(null);
  const [syncRequested, setSyncRequested] = useState(false);
  useEffect(() => {
    if (syncRequested) {
      setSelection(draft.categorySelection.selection);
      setSyncRequested(false);
    }
    setGames([]);
    setOptions(null);
    setVariables([]);
    setQuery("");
    setMessage(null);
    setMappingBusy(null);
  }, [draft.race?.raceId, draft.revision, syncRequested]);
  const search = async () => {
    setBusy(true);
    const result = await speedrunApi.searchGames(query);
    if (result.ok) setGames(result.games);
    else setMessage(result.message ?? "Game search failed.");
    setBusy(false);
  };
  const chooseGame = async (game: SpeedrunGameSearchResult) => {
    setBusy(true);
    const result = await speedrunApi.gameOptions(game.id);
    if (result.ok) setOptions(result.options);
    else setMessage(result.message ?? "Game options failed.");
    setBusy(false);
  };
  const chooseCategory = async (category: SpeedrunCategoryOption) => {
    if (!options) return;
    const result = await speedrunApi.categoryVariables(category.id);
    if (result.ok) setVariables(result.variables);
    else setMessage(result.message ?? "Variable lookup failed.");
    setSelection({
      gameId: options.game.id,
      gameName: options.game.name,
      categoryId: category.id,
      categoryName: category.name,
      levelId: null,
      variables: {},
      platformId: null,
      regionId: null,
      emulator: null,
      timingMethod: null,
    });
  };
  const apply = async () => {
    if (!selection) return;
    setBusy(true);
    try {
      const result = await categoryApi.select(selection);
      if (!result.ok) setMessage(result.message);
      else setSyncRequested(true);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "NodeCG communication error");
    } finally {
      setBusy(false);
    }
  };
  const map = async (
    operation: string,
    action: () => Promise<{ ok: boolean; message?: string }>,
  ) => {
    setMappingBusy(operation);
    setMessage(null);
    try {
      const result = await action();
      if (!result.ok) setMessage(result.message ?? "Mapping operation failed.");
      else {
        setSyncRequested(true);
        setOptions(null);
        setVariables([]);
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "NodeCG communication error");
    } finally {
      setMappingBusy(null);
    }
  };
  return (
    <section className="subpanel">
      <h3>Category / Speedrun.com</h3>
      <p>
        Mapping: <strong>{draft.categorySelection.savedMappingState}</strong> · Source:{" "}
        {draft.categorySelection.source ?? "none"}
      </p>
      <div className="button-row">
        {draft.categorySelection.savedMappingState === "none" && (
          <button
            disabled={mappingBusy !== null}
            onClick={() => void map("register", () => categoryApi.registerMapping())}
          >
            {mappingBusy === "register" ? "Registering…" : "Register Mapping"}
          </button>
        )}
        {draft.categorySelection.savedMappingState === "matches" && (
          <span className="muted">Saved Mapping matches current selection</span>
        )}
        {draft.categorySelection.savedMappingState === "overridden" && (
          <>
            <button
              disabled={mappingBusy !== null}
              onClick={() => void map("update", () => categoryApi.updateMapping())}
            >
              {mappingBusy === "update" ? "Updating…" : "Update Mapping"}
            </button>
            <button
              disabled={mappingBusy !== null}
              onClick={() => void map("revert", () => categoryApi.revertMapping())}
            >
              {mappingBusy === "revert" ? "Reverting…" : "Revert to Saved Mapping"}
            </button>
          </>
        )}
      </div>
      <div className="formrow">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search games"
        />
        <button disabled={busy || !query.trim()} onClick={() => void search()}>
          Search
        </button>
      </div>
      {games.map((game) => (
        <button className="choice" key={game.id} onClick={() => void chooseGame(game)}>
          {game.name} ({game.abbreviation})
        </button>
      ))}
      {options && (
        <>
          <label>
            Category
            <select
              value={selection?.categoryId ?? ""}
              onChange={(e) => {
                const category = options.categories.find((item) => item.id === e.target.value);
                if (category) void chooseCategory(category);
              }}
            >
              <option value="">Select category</option>
              {options.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Level
            <select
              value={selection?.levelId ?? ""}
              onChange={(e) =>
                setSelection(
                  selection ? { ...selection, levelId: e.target.value || null } : selection,
                )
              }
            >
              <option value="">Any level</option>
              {options.levels.map((level) => (
                <option key={level.id} value={level.id}>
                  {level.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Platform
            <select
              value={selection?.platformId ?? ""}
              onChange={(e) =>
                setSelection(
                  selection ? { ...selection, platformId: e.target.value || null } : selection,
                )
              }
            >
              <option value="">Any platform</option>
              {options.platforms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Region
            <select
              value={selection?.regionId ?? ""}
              onChange={(e) =>
                setSelection(
                  selection ? { ...selection, regionId: e.target.value || null } : selection,
                )
              }
            >
              <option value="">Any region</option>
              {options.regions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Emulator
            <select
              value={selection?.emulator === null ? "any" : selection?.emulator ? "true" : "false"}
              onChange={(e) =>
                setSelection(
                  selection
                    ? {
                        ...selection,
                        emulator: e.target.value === "any" ? null : e.target.value === "true",
                      }
                    : selection,
                )
              }
            >
              <option value="any">Any</option>
              <option value="true">Emulator</option>
              <option value="false">Non-emulator</option>
            </select>
          </label>
          <label>
            Timing Method
            <select
              value={selection?.timingMethod ?? ""}
              onChange={(e) =>
                setSelection(
                  selection
                    ? {
                        ...selection,
                        timingMethod: (e.target.value || null) as typeof selection.timingMethod,
                      }
                    : selection,
                )
              }
            >
              <option value="">Any timing method</option>
              {options.timingMethods.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
          </label>
          {variables.map((variable) => (
            <label key={variable.id}>
              {variable.name}
              {variable.mandatory ? " *" : ""}
              <select
                value={selection?.variables[variable.id] ?? ""}
                onChange={(e) =>
                  setSelection(
                    selection
                      ? {
                          ...selection,
                          variables: { ...selection.variables, [variable.id]: e.target.value },
                        }
                      : selection,
                  )
                }
              >
                <option value="">Select</option>
                {variable.values.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button
            disabled={
              busy ||
              !selection ||
              variables.some((variable) => variable.mandatory && !selection.variables[variable.id])
            }
            onClick={() => void apply()}
          >
            Apply Selection
          </button>
          {variables.some(
            (variable) => variable.mandatory && !selection?.variables[variable.id],
          ) && (
            <p className="callout warning">Required variables must be selected before applying.</p>
          )}
        </>
      )}
      {message && <p className="callout error">{message}</p>}
    </section>
  );
}

import type { PlayerMappingEditInput } from "../../../src/protocol/player-directory";

export function PlayerEditor({
  form,
  mode,
  dirty,
  pending,
  stale,
  blocked,
  error,
  onChange,
  onSave,
  onCancel,
}: {
  form: PlayerMappingEditInput;
  mode: "create" | "edit";
  dirty: boolean;
  pending: boolean;
  stale: boolean;
  blocked: boolean;
  error: string | null;
  onChange: (form: PlayerMappingEditInput) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const change = (part: keyof PlayerMappingEditInput, value: unknown) =>
    onChange({ ...form, [part]: value } as PlayerMappingEditInput);
  return (
    <div className="player-editor">
      <h2>{mode === "create" ? "New Player" : "Edit Player"}</h2>
      {stale && (
        <p className="callout warning">
          The player changed on the server. Reload or cancel before saving.
        </p>
      )}
      {blocked && (
        <p className="callout warning">This player is currently in use and cannot be modified.</p>
      )}
      {error && <p className="callout error">{error}</p>}
      <label>
        Manual display name
        <input
          value={form.manualDisplayName ?? ""}
          onChange={(e) => onChange({ ...form, manualDisplayName: e.target.value })}
        />
      </label>
      <fieldset>
        <legend>RaceTime</legend>
        <select
          value={form.racetime.state}
          onChange={(e) =>
            change(
              "racetime",
              e.target.value === "linked"
                ? { state: "linked", userId: "", name: "", twitchLogin: null }
                : { state: "none" },
            )
          }
        >
          <option value="none">None</option>
          <option value="linked">Linked</option>
        </select>
        {form.racetime.state === "linked" && (
          <>
            <label>
              User ID
              <input
                value={form.racetime.userId}
                onChange={(e) => change("racetime", { ...form.racetime, userId: e.target.value })}
              />
            </label>
            <label>
              Name
              <input
                value={form.racetime.name}
                onChange={(e) => change("racetime", { ...form.racetime, name: e.target.value })}
              />
            </label>
            <label>
              Twitch login
              <input
                value={form.racetime.twitchLogin ?? ""}
                onChange={(e) =>
                  change("racetime", { ...form.racetime, twitchLogin: e.target.value || null })
                }
              />
            </label>
          </>
        )}
      </fieldset>
      <fieldset>
        <legend>Speedrun.com</legend>
        <select
          value={form.speedrunCom.state}
          onChange={(e) =>
            change(
              "speedrunCom",
              e.target.value === "linked" ? { state: "linked", userId: "" } : { state: "none" },
            )
          }
        >
          <option value="none">None</option>
          <option value="linked">Linked</option>
        </select>
        {form.speedrunCom.state === "linked" && (
          <label>
            User ID
            <input
              value={form.speedrunCom.userId}
              onChange={(e) => change("speedrunCom", { state: "linked", userId: e.target.value })}
            />
          </label>
        )}
      </fieldset>
      <fieldset>
        <legend>Twitch</legend>
        <select
          value={form.twitch.state}
          onChange={(e) =>
            change(
              "twitch",
              e.target.value === "linked" ? { state: "linked", login: "" } : { state: "none" },
            )
          }
        >
          <option value="none">None</option>
          <option value="linked">Linked</option>
        </select>
        {form.twitch.state === "linked" && (
          <label>
            Login
            <input
              value={form.twitch.login}
              onChange={(e) => change("twitch", { state: "linked", login: e.target.value })}
            />
          </label>
        )}
      </fieldset>
      <div className="editor-actions">
        <button disabled={pending || !dirty || stale || blocked} onClick={onSave}>
          {pending ? "Saving…" : mode === "create" ? "Create" : "Save"}
        </button>
        <button disabled={pending} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import type {
  ActiveConfig,
  DraftConfig,
  IntegrationStatus,
  PlayerDirectory,
  PlayerMapping,
  PostApplyPersistenceState,
} from "../../../src/domain";
import type { PlayerMappingEditInput } from "../../../src/protocol/player-directory";
import { useReplicant } from "../hooks/use-replicant";
import { createPlayerDirectoryApi } from "../api/player-directory-api";
import {
  filterPlayers,
  getPlayerUsage,
  searchPlayers,
  sortPlayers,
  type PlayerFilter,
} from "./model";
import {
  createEmptyPlayerInput,
  isEditInputEqual,
  isUsageBlockingEdit,
  playerMappingToEditInput,
} from "./editor-model";
import { PlayerList } from "./player-list";
import { PlayerDetail } from "./player-detail";
import { PlayerEditor } from "./player-editor";
type Editor =
  | { mode: "view" }
  | { mode: "create"; initialForm: PlayerMappingEditInput; form: PlayerMappingEditInput }
  | {
      mode: "edit";
      playerId: string;
      baseline: PlayerMapping;
      initialForm: PlayerMappingEditInput;
      form: PlayerMappingEditInput;
      stale: boolean;
    };
type DeleteTarget = { playerId: string; expectedPlayer: PlayerMapping } | null;
const reason = (r: { reason: string; message: string }) => r.reason + ": " + r.message;
export function PlayerMappingApp() {
  const directory = useReplicant<PlayerDirectory>("player-directory"),
    draft = useReplicant<DraftConfig>("draft-config"),
    active = useReplicant<ActiveConfig | null>("active-config"),
    persistence = useReplicant<PostApplyPersistenceState>("post-apply-persistence"),
    integration = useReplicant<IntegrationStatus>("integration-status");
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState<PlayerFilter>("all"),
    [selected, setSelected] = useState<string | null>(null),
    [reloadPending, setReloadPending] = useState(false),
    [message, setMessage] = useState<string | null>(null),
    [editor, setEditor] = useState<Editor>({ mode: "view" }),
    [pending, setPending] = useState(false),
    [error, setError] = useState<string | null>(null),
    [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null),
    [pendingSelection, setPendingSelection] = useState<string | null>(null);
  useEffect(() => {
    if (directory.ready && pendingSelection && directory.value[pendingSelection]) {
      setSelected(pendingSelection);
      setPendingSelection(null);
      setMessage("Created.");
    }
  }, [directory, pendingSelection]);
  useEffect(() => {
    if (!directory.ready || editor.mode !== "edit") return;
    const latest = directory.value?.[editor.playerId];
    if (!latest) return;
    const changed = JSON.stringify(latest) !== JSON.stringify(editor.baseline);
    if (!changed) return;
    if (isEditInputEqual(editor.initialForm, editor.form)) {
      const form = playerMappingToEditInput(latest);
      setEditor({
        mode: "edit",
        playerId: latest.playerId,
        baseline: latest,
        initialForm: form,
        form,
        stale: false,
      });
    } else if (!editor.stale) setEditor({ ...editor, stale: true });
  }, [directory, editor]);
  if (![directory, draft, active, persistence, integration].every((i) => i.ready))
    return (
      <main className="player-mapping-shell">
        <p>Connecting to NodeCG…</p>
      </main>
    );
  const directoryValue = directory.value!,
    draftValue = draft.value!,
    activeValue = active.value!,
    persistenceValue = persistence.value!,
    integrationValue = integration.value!;
  const players = Object.values(directoryValue),
    usages = Object.fromEntries(
      players.map((p) => [
        p.playerId,
        getPlayerUsage(p.playerId, draftValue, activeValue, persistenceValue),
      ]),
    ),
    visible = sortPlayers(filterPlayers(searchPlayers(players, query), filter)),
    selectedPlayer = selected ? directoryValue[selected] : undefined;
  const dirty =
      editor.mode === "create" || editor.mode === "edit"
        ? !isEditInputEqual(editor.initialForm, editor.form)
        : false,
    blocked = editor.mode === "edit" && isUsageBlockingEdit(usages[editor.playerId]);
  const guard = () => {
    if (dirty) {
      setMessage("You have unsaved changes. Save or Cancel before continuing.");
      return true;
    }
    return false;
  };
  const choose = (id: string) => {
    if (!pendingSelection && !guard()) {
      setSelected(id);
      setDeleteTarget(null);
      setEditor({ mode: "view" });
      setError(null);
    }
  };
  const reload = async () => {
    if (pendingSelection || guard()) return;
    setReloadPending(true);
    try {
      const r = await createPlayerDirectoryApi().reload();
      setMessage(r.ok ? "Loaded " + r.playerCount + " players." : reason(r));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "NodeCG communication error");
    } finally {
      setReloadPending(false);
    }
  };
  const startEdit = () => {
    if (!selectedPlayer || isUsageBlockingEdit(usages[selectedPlayer.playerId])) return;
    setDeleteTarget(null);
    const form = playerMappingToEditInput(selectedPlayer);
    setEditor({
      mode: "edit",
      playerId: selectedPlayer.playerId,
      baseline: selectedPlayer,
      initialForm: form,
      form,
      stale: false,
    });
    setError(null);
  };
  const startCreate = () => {
    if (!pendingSelection && !guard()) {
      const form = createEmptyPlayerInput();
      setSelected(null);
      setDeleteTarget(null);
      setEditor({ mode: "create", initialForm: form, form });
      setError(null);
    }
  };
  const save = async () => {
    if (
      pending ||
      !dirty ||
      blocked ||
      editor.mode === "view" ||
      (editor.mode === "edit" && editor.stale)
    )
      return;
    if (editor.mode === "create" && !(editor.form.manualDisplayName ?? "").trim()) {
      setError("Manual display name is required.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const api = createPlayerDirectoryApi();
      const r =
        editor.mode === "create"
          ? await api.create(editor.form)
          : await api.update(editor.playerId, editor.baseline, editor.form);
      if (!r.ok) {
        setError(reason(r));
        if (r.reason === "player_changed" && editor.mode === "edit")
          setEditor({ ...editor, stale: true });
      } else if (editor.mode === "create") {
        setEditor({ mode: "view" });
        setPendingSelection(r.player.playerId);
      } else {
        setEditor({ mode: "view" });
        setMessage("Saved.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "NodeCG communication error");
    } finally {
      setPending(false);
    }
  };
  const remove = async () => {
    if (!selectedPlayer || isUsageBlockingEdit(usages[selectedPlayer.playerId])) return;
    if (!deleteTarget || deleteTarget.playerId !== selectedPlayer.playerId) {
      setDeleteTarget({ playerId: selectedPlayer.playerId, expectedPlayer: selectedPlayer });
      return;
    }
    setPending(true);
    setError(null);
    try {
      const r = await createPlayerDirectoryApi().delete(
        deleteTarget.playerId,
        deleteTarget.expectedPlayer,
      );
      if (!r.ok) {
        setDeleteTarget(null);
        setError(reason(r));
      } else {
        setSelected(null);
        setDeleteTarget(null);
        setMessage("Deleted.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "NodeCG communication error");
    } finally {
      setPending(false);
    }
  };
  return (
    <main className="player-mapping-shell">
      <header>
        <div>
          <span className="eyebrow">PLAYER MAPPING</span>
          <h1>Player Mapping</h1>
        </div>
        <div className="spreadsheet-status">
          Spreadsheet: <strong>{integrationValue.spreadsheet.state}</strong>
          <button disabled={reloadPending || dirty} onClick={() => void reload()}>
            {reloadPending ? "Reloading…" : "Reload from Spreadsheet"}
          </button>
        </div>
      </header>
      {message && <p className="callout">{message}</p>}
      {error && editor.mode === "view" && <p className="callout error">{error}</p>}
      <div className="player-mapping-layout">
        <section className="player-list-pane">
          <button disabled={dirty || pendingSelection !== null} onClick={startCreate}>
            New Player
          </button>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search players"
          />
          <select value={filter} onChange={(e) => setFilter(e.target.value as PlayerFilter)}>
            <option value="all">All</option>
            <option value="missing-racetime">Missing RaceTime</option>
            <option value="missing-speedruncom">Missing Speedrun.com</option>
            <option value="missing-twitch">Missing Twitch</option>
          </select>
          <PlayerList
            players={visible}
            selected={selected}
            usages={usages}
            onSelect={choose}
            disabled={pendingSelection !== null}
          />
        </section>
        <section className="player-detail-pane">
          {editor.mode === "view" ? (
            <PlayerDetail
              player={selectedPlayer}
              usage={selected ? usages[selected] : undefined}
              onEdit={startEdit}
              onDelete={remove}
              deleteConfirm={deleteTarget?.playerId === selectedPlayer?.playerId}
              onCancelDelete={() => setDeleteTarget(null)}
              actionsDisabled={
                pending ||
                pendingSelection !== null ||
                !selectedPlayer ||
                isUsageBlockingEdit(selected ? usages[selected] : undefined)
              }
            />
          ) : (
            <PlayerEditor
              mode={editor.mode}
              form={editor.form}
              dirty={dirty}
              pending={pending}
              stale={editor.mode === "edit" && editor.stale}
              blocked={blocked}
              error={error}
              onChange={(form) =>
                setEditor((e) =>
                  e.mode === "create" ? { ...e, form } : e.mode === "edit" ? { ...e, form } : e,
                )
              }
              onSave={() => void save()}
              onCancel={() => {
                setEditor({ mode: "view" });
                setError(null);
              }}
            />
          )}
        </section>
      </div>
    </main>
  );
}

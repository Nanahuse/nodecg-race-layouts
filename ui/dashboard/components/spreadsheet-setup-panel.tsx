import { useEffect, useState } from "react";
import { spreadsheetSetupApi } from "../api/spreadsheet-setup-api";
import {
  defaultSpreadsheetSettings,
  spreadsheetIdFromInput,
  spreadsheetSettingsFromConfig,
  type SpreadsheetSettings,
} from "../model/spreadsheet-config";

export function SpreadsheetSetupPanel() {
  const [settings, setSettings] = useState<SpreadsheetSettings>(defaultSpreadsheetSettings);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void spreadsheetSetupApi
      .getConfig()
      .then((response) => {
        if (response.ok) setSettings(spreadsheetSettingsFromConfig(response.settings));
      })
      .catch(() => setError("Could not load spreadsheet settings from the NodeCG database."));
  }, []);

  const valid = spreadsheetIdFromInput(settings.spreadsheetId).length > 0;
  const update = (key: keyof SpreadsheetSettings, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }));
    if (key === "spreadsheetId") {
      setConnected(false);
      setSheetNames([]);
    }
    setNotice(null);
    setError(null);
  };

  const connect = async () => {
    setPending(true);
    setError(null);
    setNotice(null);
    setConnected(false);
    try {
      const response = await spreadsheetSetupApi.connect(settings.spreadsheetId);
      if (!response.ok) {
        setError(response.message);
        return;
      }
      if (response.sheetNames.length === 0) {
        setError("Connected, but this spreadsheet does not contain any tabs.");
        return;
      }
      setSheetNames(response.sheetNames);
      setConnected(true);
      setSettings((current) => ({
        ...current,
        categoryMappingsSheet: chooseTab(
          response.sheetNames,
          current.categoryMappingsSheet,
          "CategoryMappings",
        ),
        categoryPresentationSheet: chooseTab(
          response.sheetNames,
          current.categoryPresentationSheet,
          "CategoryPresentation",
        ),
        raceHistorySheet: chooseTab(response.sheetNames, current.raceHistorySheet, "RaceHistory"),
      }));
      setNotice(`Connected. Found ${response.sheetNames.length} tabs.`);
    } catch {
      setError("Could not connect to NodeCG. Check that the bundle is running.");
    } finally {
      setPending(false);
    }
  };

  const save = async () => {
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const response = await spreadsheetSetupApi.save({
        spreadsheetUrl: settings.spreadsheetId,
        categoryMappingsSheet: settings.categoryMappingsSheet,
        categoryPresentationSheet: settings.categoryPresentationSheet,
        raceHistorySheet: settings.raceHistorySheet,
      });
      if (!response.ok) {
        setError(response.message);
        return;
      }
      setSettings(response.settings);
      setNotice("Spreadsheet settings saved to the NodeCG database and applied.");
    } catch {
      setError("Could not save spreadsheet settings to the NodeCG database.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="panel spreadsheet-setup" aria-labelledby="spreadsheet-setup-title">
      <span className="eyebrow">INTEGRATION SETUP</span>
      <h2 id="spreadsheet-setup-title">Spreadsheet Setup</h2>
      <p>Connect to a Google Spreadsheet, then choose the tabs used by this bundle.</p>
      <label>
        Google Spreadsheet URL or ID
        <input
          value={settings.spreadsheetId}
          onChange={(event) => update("spreadsheetId", event.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
          autoComplete="off"
        />
      </label>
      <div className="button-row">
        <button disabled={!valid || pending} onClick={() => void connect()}>
          {pending ? "Connecting…" : connected ? "Reconnect" : "Connect"}
        </button>
        {connected && <span className="spreadsheet-connected">Connected</span>}
      </div>
      <div className="spreadsheet-settings-grid">
        {(
          [
            ["categoryMappingsSheet", "Category mappings tab", "CategoryMappings"],
            ["categoryPresentationSheet", "Category presentation tab", "CategoryPresentation"],
            ["raceHistorySheet", "Race history tab", "RaceHistory"],
          ] as const
        ).map(([key, label, fallback]) => (
          <label key={key}>
            {label}
            <select
              value={settings[key]}
              disabled={!connected}
              onChange={(event) => update(key, event.target.value)}
            >
              {!sheetNames.includes(settings[key]) && (
                <option value={settings[key]}>{settings[key]}</option>
              )}
              {sheetNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              {sheetNames.length === 0 && <option value={fallback}>{fallback}</option>}
            </select>
          </label>
        ))}
      </div>
      <div className="button-row">
        <button disabled={!connected || pending} onClick={() => void save()}>
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
      <p className="muted">
        Spreadsheet URL and tab selections are stored in the NodeCG database. CategoryMappings and
        category presentation data remain stored in the selected Google Sheets tabs.
      </p>
      {notice && (
        <p className="callout success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="callout error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function chooseTab(names: string[], current: string, fallback: string): string {
  if (names.includes(current)) return current;
  if (names.includes(fallback)) return fallback;
  return names[0] ?? fallback;
}

import { useState } from "react";
import {
  configWithSpreadsheet,
  defaultSpreadsheetSettings,
  spreadsheetIdFromInput,
  spreadsheetSettingsFromConfig,
  type SpreadsheetSettings,
} from "../model/spreadsheet-config";

export function SpreadsheetSetupPanel() {
  const [baseConfig, setBaseConfig] = useState<Record<string, unknown>>({
    event: {
      name: "RTA Race Event",
      shortName: "RTA Race",
      logoUrl: "/bundles/nodecg-race-layouts/assets/event-logo.png",
    },
  });
  const [settings, setSettings] = useState<SpreadsheetSettings>(defaultSpreadsheetSettings);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid =
    spreadsheetIdFromInput(settings.spreadsheetId).length > 0 &&
    settings.categoryMappingsSheet.trim().length > 0 &&
    settings.categoryPresentationSheet.trim().length > 0 &&
    settings.raceHistorySheet.trim().length > 0;

  const update = (key: keyof SpreadsheetSettings, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setNotice(null);
  };

  const loadExistingConfig = async (file?: File) => {
    if (!file) return;
    setError(null);
    setNotice(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("The configuration file must contain a JSON object.");
      }
      setBaseConfig(parsed as Record<string, unknown>);
      setSettings(spreadsheetSettingsFromConfig(parsed));
      setNotice("Existing settings loaded. Other bundle settings will be preserved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read this JSON file.");
    }
  };

  const downloadConfig = () => {
    if (!valid) return;
    const content = configWithSpreadsheet(baseConfig, settings);
    const blobUrl = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = "nodecg-race-layouts.json";
    link.click();
    URL.revokeObjectURL(blobUrl);
    setNotice("Configuration downloaded. Place it in NodeCG's cfg folder, then restart NodeCG.");
  };

  const copyConfig = async () => {
    if (!valid) return;
    try {
      await navigator.clipboard.writeText(configWithSpreadsheet(baseConfig, settings));
      setNotice(
        "Configuration copied. Save it as cfg/nodecg-race-layouts.json, then restart NodeCG.",
      );
      setError(null);
    } catch {
      setError("Clipboard access is unavailable. Use Download configuration instead.");
    }
  };

  return (
    <section className="panel spreadsheet-setup" aria-labelledby="spreadsheet-setup-title">
      <span className="eyebrow">INTEGRATION SETUP</span>
      <h2 id="spreadsheet-setup-title">Spreadsheet Setup</h2>
      <p>
        Enter the Google Spreadsheet URL or ID and the names of its tabs. To preserve event or other
        bundle settings, load your current configuration file first.
      </p>
      <label className="config-file">
        Load existing bundle config (optional)
        <input
          type="file"
          accept="application/json,.json"
          onChange={(event) => void loadExistingConfig(event.target.files?.[0])}
        />
      </label>
      <div className="spreadsheet-settings-grid">
        <label>
          Spreadsheet URL or ID
          <input
            value={settings.spreadsheetId}
            onChange={(event) => update("spreadsheetId", event.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            autoComplete="off"
          />
        </label>
        <label>
          Category mappings tab
          <input
            value={settings.categoryMappingsSheet}
            onChange={(event) => update("categoryMappingsSheet", event.target.value)}
          />
        </label>
        <label>
          Category presentation tab
          <input
            value={settings.categoryPresentationSheet}
            onChange={(event) => update("categoryPresentationSheet", event.target.value)}
          />
        </label>
        <label>
          Race history tab
          <input
            value={settings.raceHistorySheet}
            onChange={(event) => update("raceHistorySheet", event.target.value)}
          />
        </label>
      </div>
      <div className="button-row">
        <button disabled={!valid} onClick={downloadConfig}>
          Download configuration
        </button>
        <button disabled={!valid} onClick={() => void copyConfig()}>
          Copy configuration
        </button>
      </div>
      <p className="muted">
        NodeCG reads bundle settings at startup. Replace <code>cfg/nodecg-race-layouts.json</code>
        with the downloaded file, then restart NodeCG. Also make sure the NodeCG service account has
        access to the spreadsheet.
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

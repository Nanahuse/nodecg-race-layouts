import { useEffect, useState } from "react";
import { spreadsheetSetupApi } from "../api/spreadsheet-setup-api";
import {
  configWithSpreadsheet,
  defaultSpreadsheetSettings,
  spreadsheetIdFromInput,
  spreadsheetSettingsFromConfig,
  type SpreadsheetSettings,
} from "../model/spreadsheet-config";

export function SpreadsheetSetupPanel() {
  const [baseConfig, setBaseConfig] = useState<Record<string, unknown>>({});
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
        if (!response.ok) return;
        const loadedConfig =
          typeof response.config === "object" && response.config !== null
            ? (response.config as Record<string, unknown>)
            : {};
        const config = {
          event: {
            name: "RTA Race Event",
            shortName: "RTA Race",
            logoUrl: "/bundles/nodecg-race-layouts/assets/event-logo.png",
          },
          ...loadedConfig,
        };
        setBaseConfig(config);
        setSettings(spreadsheetSettingsFromConfig(config));
      })
      .catch(() => setError("Could not load the current bundle settings from NodeCG."));
  }, []);

  const valid = spreadsheetIdFromInput(settings.spreadsheetId).length > 0;
  const update = (key: keyof SpreadsheetSettings, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }));
    if (key === "spreadsheetId" || key === "googleCredentialsFile") {
      setConnected(false);
      setSheetNames([]);
      setNotice(null);
    }
  };

  const connect = async () => {
    setPending(true);
    setError(null);
    setNotice(null);
    setConnected(false);
    try {
      const response = await spreadsheetSetupApi.connect(
        settings.spreadsheetId,
        settings.googleCredentialsFile,
      );
      if (!response.ok) {
        setError(response.message);
        return;
      }
      const names = response.sheetNames;
      if (names.length === 0) {
        setError("Connected, but this spreadsheet does not contain any tabs.");
        return;
      }
      setSheetNames(names);
      setConnected(true);
      setSettings((current) => ({
        ...current,
        categoryMappingsSheet: chooseTab(names, current.categoryMappingsSheet, "CategoryMappings"),
        categoryPresentationSheet: chooseTab(
          names,
          current.categoryPresentationSheet,
          "CategoryPresentation",
        ),
        raceHistorySheet: chooseTab(names, current.raceHistorySheet, "RaceHistory"),
      }));
      setNotice(`Connected. Found ${names.length} tabs.`);
    } catch {
      setError("Could not connect to NodeCG. Check that the bundle is running.");
    } finally {
      setPending(false);
    }
  };

  const downloadConfig = () => {
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
      <label>
        Google credentials file path (optional; uses ADC when blank)
        <input
          value={settings.googleCredentialsFile}
          onChange={(event) => update("googleCredentialsFile", event.target.value)}
          placeholder="C:/credentials/google-service-account.json"
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
        <button disabled={!connected} onClick={downloadConfig}>
          Download configuration
        </button>
        <button disabled={!connected} onClick={() => void copyConfig()}>
          Copy configuration
        </button>
      </div>
      <p className="muted">
        The selected tabs and credentials file path will be written to <code>spreadsheet</code> in
        the bundle config. Place the downloaded file at <code>cfg/nodecg-race-layouts.json</code>
        and restart NodeCG to apply it. Make sure the Google account has access to the spreadsheet.
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

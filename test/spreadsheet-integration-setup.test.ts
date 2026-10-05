import { describe, expect, it, vi } from "vitest";
import { setupSpreadsheetIntegration } from "../src/extension/setup";
import {
  createDefaultIntegrationStatus,
  createDefaultSpreadsheetSettings,
} from "../src/replicants/defaults";
import type { NodeCG } from "../src/types/nodecg";
import type { SpreadsheetClient } from "../src/extension/integrations/spreadsheet/client";

describe("setupSpreadsheetIntegration", () => {
  it("uses database settings immediately and reads credentials only from bundle config", () => {
    const settings = {
      value: createDefaultSpreadsheetSettings(),
      on: vi.fn(),
    };
    const status = { value: createDefaultIntegrationStatus(), on: vi.fn() };
    const nodecg = {
      bundleConfig: { googleCredentialsFile: "C:/keys/google.json" },
      Replicant: vi.fn((name: string) => (name === "spreadsheet-settings" ? settings : status)),
      log: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as unknown as NodeCG;
    const client = {} as SpreadsheetClient;
    const createClient = vi.fn(() => client);

    setupSpreadsheetIntegration(nodecg, createClient);
    expect(createClient).not.toHaveBeenCalled();

    settings.value = {
      spreadsheetId: "sheet-id",
      categoryMappingsSheet: "Mappings",
      categoryPresentationSheet: "Presentation",
      raceHistorySheet: "History",
    };
    const onChange = settings.on.mock.calls[0]?.[1] as (value: typeof settings.value) => void;
    onChange(settings.value);

    expect(createClient).toHaveBeenCalledWith({
      spreadsheetId: "sheet-id",
      googleCredentialsFile: "C:/keys/google.json",
    });
  });
});

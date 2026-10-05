import { describe, expect, it, vi } from "vitest";
import type { NodeCG, MessageHandler } from "../src/types/nodecg";
import {
  SPREADSHEET_SETUP_CONFIG_MESSAGE,
  SPREADSHEET_SETUP_CONNECT_MESSAGE,
  SPREADSHEET_SETUP_SAVE_MESSAGE,
} from "../src/protocol/spreadsheet-setup";
import { registerSpreadsheetSetupMessages } from "../src/extension/messages/spreadsheet-setup-messages";

function setup(config: unknown) {
  const handlers = new Map<string, MessageHandler>();
  const nodecg = {
    bundleConfig: config,
    listenFor: (name: string, handler: MessageHandler) => handlers.set(name, handler),
  } as unknown as NodeCG;
  const createClient = vi.fn(() => ({ listSheets: async () => ["Mappings", "History"] }));
  registerSpreadsheetSetupMessages(nodecg, createClient);
  return { handlers, createClient };
}

describe("Spreadsheet setup messages", () => {
  it("returns the config loaded by NodeCG from cfg", async () => {
    const config = {
      event: { name: "Final" },
      spreadsheet: { spreadsheetId: "sheet-id", googleCredentialsFile: "C:/private/google.json" },
    };
    const { handlers } = setup(config);
    const ack = vi.fn();
    await handlers.get(SPREADSHEET_SETUP_CONFIG_MESSAGE)?.(undefined, ack);
    expect(ack).toHaveBeenCalledWith(null, {
      ok: true,
      config: { event: { name: "Final" }, spreadsheet: { spreadsheetId: "sheet-id" } },
    });
  });

  it("connects using a spreadsheet URL and the configured credentials path", async () => {
    const { handlers, createClient } = setup({
      spreadsheet: { googleCredentialsFile: "C:/keys/google.json" },
    });
    const ack = vi.fn();
    await handlers.get(SPREADSHEET_SETUP_CONNECT_MESSAGE)?.(
      {
        spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-id/edit",
      },
      ack,
    );
    expect(createClient).toHaveBeenCalledWith({
      spreadsheetId: "sheet-id",
      googleCredentialsFile: "C:/keys/google.json",
    });
    expect(ack).toHaveBeenCalledWith(null, { ok: true, sheetNames: ["Mappings", "History"] });
  });

  it("rejects an empty spreadsheet URL without connecting", async () => {
    const { handlers, createClient } = setup({});
    const ack = vi.fn();
    await handlers.get(SPREADSHEET_SETUP_CONNECT_MESSAGE)?.({ spreadsheetUrl: " " }, ack);
    expect(createClient).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(null, {
      ok: false,
      message: "Enter a spreadsheet URL or ID.",
    });
  });

  it("generates config while retaining the credentials path from cfg", async () => {
    const config = {
      event: { name: "Final" },
      spreadsheet: { googleCredentialsFile: "C:/private/google.json", playersSheet: "Players" },
    };
    const { handlers } = setup(config);
    const ack = vi.fn();
    await handlers.get(SPREADSHEET_SETUP_SAVE_MESSAGE)?.(
      {
        spreadsheetUrl: "https://docs.google.com/spreadsheets/d/sheet-id/edit",
        categoryMappingsSheet: "Mappings",
        categoryPresentationSheet: "Presentation",
        raceHistorySheet: "History",
      },
      ack,
    );
    const response = ack.mock.calls[0]?.[1] as { configJson: string };
    expect(JSON.parse(response.configJson)).toEqual({
      event: { name: "Final" },
      spreadsheet: {
        spreadsheetId: "sheet-id",
        googleCredentialsFile: "C:/private/google.json",
        categoryMappingsSheet: "Mappings",
        categoryPresentationSheet: "Presentation",
        raceHistorySheet: "History",
      },
    });
  });
});

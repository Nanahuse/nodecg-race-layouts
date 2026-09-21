import { describe, expect, it } from "vitest";

import type { PlayerMapping } from "../src/domain";
import { PlayersSheetValidationError } from "../src/extension/integrations/spreadsheet/errors";
import {
  emptyPlayerSheetRow,
  PLAYER_SHEET_COLUMNS,
  playerMappingToPlayerSheetRow,
  playerSheetRowToValues,
} from "../src/extension/integrations/spreadsheet/players-row";
import { SpreadsheetPlayersRepository } from "../src/extension/integrations/spreadsheet/players-repository";
import { makeActivePlayer } from "./factories";
import {
  FakeSpreadsheetClient,
  makePlayerSheetRow,
  sheetValuesFromRows,
  sheetValuesWithHeader,
} from "./support/fakes";

const SHEET = "Players";
const UPDATED_AT = "2026-09-21T05:30:00.000Z";

function rowOf(player: PlayerMapping): ReturnType<typeof playerMappingToPlayerSheetRow> {
  return playerMappingToPlayerSheetRow(player, UPDATED_AT);
}

function makeRepository(client: FakeSpreadsheetClient): SpreadsheetPlayersRepository {
  return new SpreadsheetPlayersRepository(client, {
    sheetName: SHEET,
    now: () => new Date(UPDATED_AT),
  });
}

function firstUpdate(client: FakeSpreadsheetClient) {
  const update = client.updates[0];
  if (!update) {
    throw new Error("expected an update call");
  }
  return update;
}

function firstAppend(client: FakeSpreadsheetClient) {
  const append = client.appends[0];
  if (!append) {
    throw new Error("expected an append call");
  }
  return append;
}

async function loadError(repository: SpreadsheetPlayersRepository): Promise<unknown> {
  try {
    await repository.loadAll();
    throw new Error("expected loadAll to reject");
  } catch (error) {
    return error;
  }
}

describe("SpreadsheetPlayersRepository.loadAll", () => {
  it("returns a directory keyed by player id", async () => {
    const p1 = makeActivePlayer("p1");
    const p2 = makeActivePlayer("p2");
    const client = new FakeSpreadsheetClient(sheetValuesFromRows([rowOf(p1), rowOf(p2)]));

    const directory = await makeRepository(client).loadAll();

    expect(Object.keys(directory)).toEqual(["p1", "p2"]);
    expect(directory["p1"]).toEqual(p1);
  });

  it("skips blank rows", async () => {
    const p1 = makeActivePlayer("p1");
    const client = new FakeSpreadsheetClient(
      sheetValuesFromRows([rowOf(p1), emptyPlayerSheetRow()]),
    );

    const directory = await makeRepository(client).loadAll();
    expect(Object.keys(directory)).toEqual(["p1"]);
  });

  it("fails the whole load when a row has an unknown state", async () => {
    const client = new FakeSpreadsheetClient(
      sheetValuesFromRows([makePlayerSheetRow({ player_id: "p1", racetime_state: "unresolved" })]),
    );

    const error = await loadError(makeRepository(client));
    expect(error).toBeInstanceOf(PlayersSheetValidationError);
    if (error instanceof PlayersSheetValidationError) {
      expect(error.issues.map((issue) => issue.code)).toContain("racetime_state_invalid");
    }
  });

  it("fails the whole load on duplicate external ids", async () => {
    const p1 = makeActivePlayer("p1");
    const p2 = makeActivePlayer("p2", {
      racetime: {
        state: "linked",
        value: { userId: "rt-account-p1", name: "Same", twitchLogin: null },
      },
    });
    const client = new FakeSpreadsheetClient(sheetValuesFromRows([rowOf(p1), rowOf(p2)]));

    const error = await loadError(makeRepository(client));
    expect(error).toBeInstanceOf(PlayersSheetValidationError);
    if (error instanceof PlayersSheetValidationError) {
      expect(error.issues.map((issue) => issue.code)).toContain("racetime_user_id_duplicate");
    }
  });

  it("fails when a required header column is missing", async () => {
    const client = new FakeSpreadsheetClient([["player_id"], ["p1"]]);
    const error = await loadError(makeRepository(client));
    expect(error).toBeInstanceOf(PlayersSheetValidationError);
    if (error instanceof PlayersSheetValidationError) {
      expect(error.issues.map((issue) => issue.code)).toContain("header_missing_column");
    }
  });
});

describe("SpreadsheetPlayersRepository.upsert", () => {
  it("updates an existing row instead of appending", async () => {
    const p1 = makeActivePlayer("p1");
    const client = new FakeSpreadsheetClient(sheetValuesFromRows([rowOf(p1)]));

    await makeRepository(client).upsert([{ ...p1, manualDisplayName: "Updated" }]);

    expect(client.appends).toHaveLength(0);
    expect(client.updates).toHaveLength(1);
    const update = firstUpdate(client);
    expect(update.range).toBe("'Players'!A2:N2");
    expect(update.values[0]?.[0]).toBe("p1");
    expect(update.values[0]?.[1]).toBe("Updated");
    expect(update.values[0]?.[13]).toBe(UPDATED_AT);
  });

  it("appends a new row for an unknown player id", async () => {
    const p1 = makeActivePlayer("p1");
    const p2 = makeActivePlayer("p2");
    const client = new FakeSpreadsheetClient(sheetValuesFromRows([rowOf(p1)]));

    await makeRepository(client).upsert([p2]);

    expect(client.updates).toHaveLength(0);
    expect(client.appends).toHaveLength(1);
    const append = firstAppend(client);
    expect(append.range).toBe("'Players'!A1");
    expect(append.values[0]?.[0]).toBe("p2");
  });

  it("rejects an upsert that would duplicate an external id, without writing", async () => {
    const p1 = makeActivePlayer("p1");
    const p2 = makeActivePlayer("p2", {
      racetime: {
        state: "linked",
        value: { userId: "rt-account-p1", name: "Same", twitchLogin: null },
      },
    });
    const client = new FakeSpreadsheetClient(sheetValuesFromRows([rowOf(p1)]));

    await expect(makeRepository(client).upsert([p2])).rejects.toBeInstanceOf(
      PlayersSheetValidationError,
    );
    expect(client.updates).toHaveLength(0);
    expect(client.appends).toHaveLength(0);
  });

  it("rejects duplicate player ids within the incoming batch", async () => {
    const client = new FakeSpreadsheetClient(sheetValuesFromRows([rowOf(makeActivePlayer("p1"))]));
    const duplicate = makeActivePlayer("p1", {
      racetime: {
        state: "linked",
        value: { userId: "rt-other", name: "Other", twitchLogin: null },
      },
    });

    await expect(
      makeRepository(client).upsert([makeActivePlayer("p1"), duplicate]),
    ).rejects.toBeInstanceOf(PlayersSheetValidationError);
  });

  it("preserves extra columns and follows the sheet header order when updating", async () => {
    const p1 = makeActivePlayer("p1");
    const header = ["notes", ...PLAYER_SHEET_COLUMNS];
    const existingRow = ["keep-me", ...playerSheetRowToValues(rowOf(p1))];
    const client = new FakeSpreadsheetClient(sheetValuesWithHeader(header, [existingRow]));

    await makeRepository(client).upsert([{ ...p1, manualDisplayName: "Updated" }]);

    const written = firstUpdate(client).values[0];
    expect(written?.[0]).toBe("keep-me");
    expect(written?.[header.indexOf("player_id")]).toBe("p1");
    expect(written?.[header.indexOf("manual_display_name")]).toBe("Updated");
  });
});

describe("SpreadsheetPlayersRepository.delete", () => {
  it("deletes the row matching the player id", async () => {
    const p1 = makeActivePlayer("p1");
    const p2 = makeActivePlayer("p2");
    const client = new FakeSpreadsheetClient(sheetValuesFromRows([rowOf(p1), rowOf(p2)]));

    await makeRepository(client).delete("p2");

    expect(client.deleted).toEqual([{ sheetName: SHEET, rowNumber: 3 }]);
    expect(client.updates).toHaveLength(0);
  });

  it("is a no-op when the player id is not found", async () => {
    const client = new FakeSpreadsheetClient(sheetValuesFromRows([rowOf(makeActivePlayer("p1"))]));

    await makeRepository(client).delete("ghost");

    expect(client.deleted).toHaveLength(0);
  });
});

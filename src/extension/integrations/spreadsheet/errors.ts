import type { PlayerId } from "../../../domain";

/** A single problem found while reading or validating the Players sheet. */
export type PlayersSheetIssue = {
  code: string;
  message: string;
  /** 1-based spreadsheet row number, or null when the issue is sheet-wide. */
  row: number | null;
  playerId: PlayerId | null;
};

export class SpreadsheetIntegrationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Low-level failure talking to the spreadsheet provider. */
export class SpreadsheetClientError extends SpreadsheetIntegrationError {}

/**
 * The sheet was read successfully but the data is not a valid Player
 * Directory. The whole load is rejected; callers must not apply a partial
 * directory.
 */
export class PlayersSheetValidationError extends SpreadsheetIntegrationError {
  readonly issues: readonly PlayersSheetIssue[];

  constructor(sheetName: string, issues: readonly PlayersSheetIssue[]) {
    super(`Players sheet "${sheetName}" failed validation with ${issues.length} issue(s).`);
    this.issues = issues;
  }
}

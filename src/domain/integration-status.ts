export type ServiceState = "disconnected" | "connecting" | "connected" | "error";

export type ServiceStatus = {
  state: ServiceState;
  message: string | null;
};

export type SpeedrunComStatusState = "idle" | "fetching" | "ready" | "error";

export type SpeedrunComStatus = {
  state: SpeedrunComStatusState;
  message: string | null;
};

export type SpreadsheetStatusState = "idle" | "loading" | "saving" | "saved" | "error";

export type SpreadsheetStatus = {
  state: SpreadsheetStatusState;
  message: string | null;
};

export type BroadcastStatusState =
  | "empty"
  | "loading"
  | "resolving"
  | "resolution_required"
  | "fetching"
  | "ready"
  | "dirty"
  | "applying"
  | "error";

export type BroadcastStatus = {
  state: BroadcastStatusState;

  draftRevision: number | null;
  activeRevision: number | null;

  message: string | null;
};

export type IntegrationStatus = {
  racetime: ServiceStatus;

  speedrunCom: SpeedrunComStatus;

  spreadsheet: SpreadsheetStatus;

  broadcast: BroadcastStatus;
};

// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { eventMessageName } from "@nanahuse/player-manager-protocol";
import { describe, expect, it, vi } from "vitest";
import {
  createDefaultDraftConfig,
  createDefaultDraftSpeedrunSnapshot,
  createDefaultIntegrationStatus,
  createDefaultRaceSession,
} from "../src/replicants/defaults";
import { App } from "../ui/dashboard/app";

const mocks = vi.hoisted(() => ({
  replicants: new Map<string, { ready: true; value: unknown }>(),
  listeners: [] as Array<{
    eventName: string;
    bundleName: string;
    handler: (data: unknown) => void;
  }>,
  listenFor: vi.fn(),
  unlisten: vi.fn(),
  listPlayers: vi.fn(),
}));

vi.mock("../ui/dashboard/hooks/use-replicant", () => ({
  useReplicant: (name: string) => mocks.replicants.get(name),
}));
vi.mock("../ui/dashboard/api/nodecg-client", () => ({
  nodecg: {
    listenFor: mocks.listenFor,
    unlisten: mocks.unlisten,
  },
}));
vi.mock("../ui/dashboard/api/participant-api", () => ({
  createParticipantApi: () => ({ listPlayers: mocks.listPlayers }),
}));
vi.mock("../ui/dashboard/components/category-editor", () => ({ CategoryEditor: () => null }));
vi.mock("../ui/dashboard/components/category-presentation-editor", () => ({
  CategoryPresentationEditor: () => null,
}));
vi.mock("../ui/dashboard/components/speedrun-snapshot-panel", () => ({
  SpeedrunSnapshotPanel: () => null,
}));
vi.mock("../ui/dashboard/components/broadcast-apply-panel", () => ({
  BroadcastApplyPanel: () => null,
}));
vi.mock("../ui/dashboard/components/persistence-panel", () => ({ PersistencePanel: () => null }));
vi.mock("../ui/dashboard/components/spreadsheet-setup-panel", () => ({
  SpreadsheetSetupPanel: () => null,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

describe("Dashboard Player Manager Directory subscription", () => {
  it("cleans up on revision changes and unmount, and ignores stale list responses", async () => {
    mocks.replicants.clear();
    mocks.listeners.length = 0;
    mocks.listenFor.mockReset().mockImplementation((eventName, bundleName, handler) => {
      mocks.listeners.push({ eventName, bundleName, handler });
    });
    mocks.unlisten.mockReset().mockImplementation((eventName, bundleName, handler) => {
      const index = mocks.listeners.findIndex(
        (entry) =>
          entry.eventName === eventName &&
          entry.bundleName === bundleName &&
          entry.handler === handler,
      );
      if (index >= 0) mocks.listeners.splice(index, 1);
    });
    const draft = createDefaultDraftConfig();
    mocks.replicants.set("draft-config", { ready: true, value: draft });
    mocks.replicants.set("active-config", { ready: true, value: null });
    mocks.replicants.set("draft-race-session", {
      ready: true,
      value: createDefaultRaceSession(),
    });
    mocks.replicants.set("integration-status", {
      ready: true,
      value: createDefaultIntegrationStatus(),
    });
    mocks.replicants.set("post-apply-persistence", {
      ready: true,
      value: { state: "idle", queue: [], lastSavedActiveRevision: null, message: null },
    });
    mocks.replicants.set("draft-speedrun-snapshot", {
      ready: true,
      value: createDefaultDraftSpeedrunSnapshot(),
    });
    const requests = [deferred<unknown>(), deferred<unknown>(), deferred<unknown>()];
    mocks.listPlayers.mockReset();
    requests.forEach((request) => mocks.listPlayers.mockReturnValueOnce(request.promise));

    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(createElement(App)));
    expect(mocks.listeners).toHaveLength(1);
    expect(mocks.listenFor).toHaveBeenLastCalledWith(
      eventMessageName("directoryChanged"),
      "player-manager",
      expect.any(Function),
    );

    await act(async () => mocks.listeners[0]!.handler(undefined));
    expect(mocks.listPlayers).toHaveBeenCalledTimes(2);

    mocks.replicants.set("draft-config", { ready: true, value: { ...draft, revision: 1 } });
    await act(async () => root.render(createElement(App)));
    expect(mocks.listeners).toHaveLength(1);
    expect(mocks.unlisten).toHaveBeenLastCalledWith(
      eventMessageName("directoryChanged"),
      "player-manager",
      expect.any(Function),
    );

    await act(async () => {
      requests[2]!.resolve({ ok: true, players: [{ playerId: "fresh", displayName: "Fresh" }] });
      await requests[2]!.promise;
    });
    await act(async () => {
      requests[1]!.resolve({ ok: true, players: [{ playerId: "old", displayName: "Old" }] });
      requests[0]!.resolve({ ok: true, players: [{ playerId: "older", displayName: "Older" }] });
      await Promise.all([requests[0]!.promise, requests[1]!.promise]);
    });
    expect([...container.querySelectorAll("option")].map((option) => option.textContent)).toContain(
      "Fresh",
    );
    expect(
      [...container.querySelectorAll("option")].map((option) => option.textContent),
    ).not.toContain("Old");

    await act(async () => root.unmount());
    expect(mocks.listeners).toHaveLength(0);
    expect(mocks.unlisten).toHaveBeenCalledTimes(2);
  });
});

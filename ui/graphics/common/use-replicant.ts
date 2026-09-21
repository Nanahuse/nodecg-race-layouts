import { useEffect, useState } from "react";
import { nodecg, type BrowserReplicant } from "./nodecg-client";

export type ReplicantSnapshot<T> = { ready: false; value: undefined } | { ready: true; value: T };

const registry = new Map<string, BrowserReplicant<unknown>>();

function get<T>(name: string): BrowserReplicant<T> {
  const existing = registry.get(name);
  if (existing) return existing as BrowserReplicant<T>;
  const replicant = nodecg.Replicant<T>(name);
  registry.set(name, replicant as BrowserReplicant<unknown>);
  return replicant;
}

export function useReplicant<T>(name: string): ReplicantSnapshot<T> {
  const [snapshot, setSnapshot] = useState<ReplicantSnapshot<T>>({
    ready: false,
    value: undefined,
  });

  useEffect(() => {
    const replicant = get<T>(name);
    const listener = (value: T) => setSnapshot({ ready: true, value });
    replicant.on("change", listener);
    return () => replicant.off?.("change", listener);
  }, [name]);

  return snapshot;
}

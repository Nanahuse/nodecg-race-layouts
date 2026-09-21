import { useEffect, useState } from "react";
import { nodecg, type BrowserReplicant } from "../api/nodecg-client";
export type ReplicantSnapshot<T> = { ready: false; value: undefined } | { ready: true; value: T };
const registry = new Map<string, BrowserReplicant<unknown>>();
function get<T>(name: string): BrowserReplicant<T> {
  const existing = registry.get(name);
  if (existing) return existing as BrowserReplicant<T>;
  const value = nodecg.Replicant<T>(name);
  registry.set(name, value as BrowserReplicant<unknown>);
  return value;
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

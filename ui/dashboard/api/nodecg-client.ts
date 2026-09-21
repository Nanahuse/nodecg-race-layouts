export type BrowserReplicant<T> = {
  value?: T;
  on(event: "change", listener: (value: T) => void): void;
  off?(event: "change", listener: (value: T) => void): void;
};
export type DashboardNodeCG = {
  Replicant<T>(name: string): BrowserReplicant<T>;
  sendMessage<T>(name: string, data?: unknown): Promise<T>;
};
export const nodecg = (window as unknown as Window & { nodecg: DashboardNodeCG }).nodecg;

export type BrowserReplicant<T> = {
  value?: T;
  on(event: "change", listener: (value: T) => void): void;
  off?(event: "change", listener: (value: T) => void): void;
};

export type GraphicsNodeCG = {
  Replicant<T>(name: string): BrowserReplicant<T>;
};

export const nodecg = (window as unknown as Window & { nodecg: GraphicsNodeCG }).nodecg;

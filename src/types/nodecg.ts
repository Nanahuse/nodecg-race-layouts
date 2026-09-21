/**
 * Minimal structural typings for the parts of the NodeCG extension API this
 * bundle uses. Kept local so the bundle does not need to depend on the full
 * NodeCG package just to type the extension entry point.
 */

export type ReplicantOptions<T> = {
  defaultValue?: T;
  persistent?: boolean;
  schemaPath?: string;
};

export type ReplicantChangeListener<T> = (value: T, oldValue?: T) => void;

export interface Replicant<T> {
  readonly name: string;
  value: T;
  on(event: "change", listener: ReplicantChangeListener<T>): void;
}

export interface NodeCGLogger {
  trace(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface NodeCG {
  Replicant<T = unknown>(name: string, opts?: ReplicantOptions<T>): Replicant<T>;
  log: NodeCGLogger;
  /**
   * Contents of the bundle's config file (validated against
   * `configschema.json`). `undefined` when the bundle has no config.
   */
  bundleConfig: unknown;
}

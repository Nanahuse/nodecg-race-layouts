export type SpeedrunComErrorCode =
  | "aborted"
  | "timeout"
  | "network_error"
  | "http_error"
  | "not_found"
  | "rate_limited"
  | "invalid_json"
  | "invalid_payload";

/**
 * Base error for the Speedrun.com integration. Callers branch on `code`
 * instead of parsing `message`.
 */
export class SpeedrunComError extends Error {
  readonly code: SpeedrunComErrorCode;

  constructor(code: SpeedrunComErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

export class SpeedrunComAbortedError extends SpeedrunComError {
  constructor(message: string, options?: ErrorOptions) {
    super("aborted", message, options);
  }
}

export class SpeedrunComTimeoutError extends SpeedrunComError {
  constructor(message: string, options?: ErrorOptions) {
    super("timeout", message, options);
  }
}

export class SpeedrunComNetworkError extends SpeedrunComError {
  constructor(message: string, options?: ErrorOptions) {
    super("network_error", message, options);
  }
}

export class SpeedrunComHttpError extends SpeedrunComError {
  readonly status: number;

  constructor(status: number, message: string, options?: ErrorOptions) {
    super("http_error", message, options);
    this.status = status;
  }
}

export class SpeedrunComNotFoundError extends SpeedrunComError {
  constructor(message: string, options?: ErrorOptions) {
    super("not_found", message, options);
  }
}

export class SpeedrunComRateLimitedError extends SpeedrunComError {
  readonly retryAfterMs: number | null;

  constructor(message: string, retryAfterMs: number | null = null, options?: ErrorOptions) {
    super("rate_limited", message, options);
    this.retryAfterMs = retryAfterMs;
  }
}

export class SpeedrunComInvalidJsonError extends SpeedrunComError {
  constructor(message: string, options?: ErrorOptions) {
    super("invalid_json", message, options);
  }
}

export class SpeedrunComPayloadError extends SpeedrunComError {
  constructor(message: string, options?: ErrorOptions) {
    super("invalid_payload", message, options);
  }
}

export function describeSpeedrunComError(error: unknown): string {
  if (error instanceof SpeedrunComError) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export function isSpeedrunComAborted(error: unknown): boolean {
  return error instanceof SpeedrunComError && error.code === "aborted";
}

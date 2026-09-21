import { SpeedrunComPayloadError } from "./errors";

export type SpeedrunPagination = {
  offset: number;
  max: number;
  size: number;
  nextUri: string | null;
};

export type ParsedCollection = {
  data: unknown[];
  pagination: SpeedrunPagination | null;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new SpeedrunComPayloadError(`${path} must be an object.`);
  }
  return value;
}

export function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new SpeedrunComPayloadError(`${path} must be an array.`);
  }
  return value;
}

export function requireString(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new SpeedrunComPayloadError(`${path} must be a non-empty string.`);
  }
  return value;
}

export function optionalString(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "string") {
    throw new SpeedrunComPayloadError(`${path} must be a string or null.`);
  }
  return value;
}

export function requireBoolean(
  record: Record<string, unknown>,
  key: string,
  path: string,
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw new SpeedrunComPayloadError(`${path} must be a boolean.`);
  }
  return value;
}

export function optionalBoolean(
  record: Record<string, unknown>,
  key: string,
  path: string,
): boolean | null {
  const value = record[key];
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "boolean") {
    throw new SpeedrunComPayloadError(`${path} must be a boolean or null.`);
  }
  return value;
}

export function optionalStringArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
): string[] {
  const value = record[key];
  if (value === null || value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new SpeedrunComPayloadError(`${path} must be an array of strings.`);
  }
  return value.map((item, index) => {
    if (typeof item !== "string") {
      throw new SpeedrunComPayloadError(`${path}[${index}] must be a string.`);
    }
    return item;
  });
}

/** Remove the `{ "data": ... }` response envelope. */
export function parseSingleEnvelope(payload: unknown): unknown {
  const root = requireRecord(payload, "response");
  if (!("data" in root)) {
    throw new SpeedrunComPayloadError("response.data is missing.");
  }
  return root.data;
}

/** Remove the `{ "data": [...], "pagination": ... }` collection envelope. */
export function parseCollectionEnvelope(payload: unknown): ParsedCollection {
  const root = requireRecord(payload, "response");
  if (!Array.isArray(root.data)) {
    throw new SpeedrunComPayloadError("response.data must be an array.");
  }
  return { data: root.data, pagination: parsePagination(root.pagination) };
}

function parsePagination(value: unknown): SpeedrunPagination | null {
  if (!isRecord(value)) {
    return null;
  }
  const offset = typeof value.offset === "number" ? value.offset : 0;
  const max = typeof value.max === "number" ? value.max : 0;
  const size = typeof value.size === "number" ? value.size : 0;

  let nextUri: string | null = null;
  if (Array.isArray(value.links)) {
    for (const link of value.links) {
      if (isRecord(link) && link.rel === "next" && typeof link.uri === "string") {
        nextUri = link.uri;
        break;
      }
    }
  }

  return { offset, max, size, nextUri };
}

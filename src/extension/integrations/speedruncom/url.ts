/** Speedrun.com API v1 base URL. Defined once so it is never duplicated. */
export const SPEEDRUNCOM_API_BASE_URL = "https://www.speedrun.com/api/v1";

export type QueryValue = string | number | boolean | undefined;

export function buildSpeedrunComUrl(path: string, query: Record<string, QueryValue> = {}): string {
  const url = new URL(`${SPEEDRUNCOM_API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

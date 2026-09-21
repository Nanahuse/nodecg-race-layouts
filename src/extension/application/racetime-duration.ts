export function formatRaceTimeDuration(value: string): string | null {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(value);
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  const hours = Number(match[1] ?? 0),
    minutes = Number(match[2] ?? 0),
    seconds = Number(match[3] ?? 0);
  if (![hours, minutes, seconds].every(Number.isFinite) || minutes >= 60 || seconds >= 60)
    return null;
  const secPart = match[3] ?? "0";
  const sec = match[3]
    ? (seconds % 60).toFixed(secPart.includes(".") ? (secPart.split(".")[1]?.length ?? 0) : 0)
    : "0";
  const parts =
    hours > 0
      ? [`${hours}`, String(minutes).padStart(2, "0"), sec.padStart(2, "0")]
      : [String(hours * 60 + minutes), sec.padStart(2, "0")];
  return parts.join(":");
}

export type StatusTone = "success" | "progress" | "warning" | "error" | "neutral";
export function statusTone(state: string): StatusTone {
  if (["ready", "connected", "saved"].includes(state)) return "success";
  if (["connecting", "loading", "fetching", "applying"].includes(state)) return "progress";
  if (["dirty", "resolution_required", "reconciliation_required"].includes(state)) return "warning";
  if (state === "error") return "error";
  return "neutral";
}

// Take history helpers for scene shots. Every provider job appends a new
// take; nothing here mutates or overwrites an existing take.

export type Take = {
  id: string;
  scene_id: string;
  status: string;
  approved: boolean;
  created_at: string;
  [key: string]: unknown;
};

export type NumberedTake<T extends Take = Take> = T & { take_number: number };

/** Number takes chronologically (oldest = Take 1) and return newest first. */
export function numberTakes<T extends Take>(rows: T[] | null | undefined): NumberedTake<T>[] {
  const sorted = [...(rows ?? [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)) || a.id.localeCompare(b.id));
  return sorted.map((row, index) => ({ ...row, take_number: index + 1 })).reverse();
}

/** The approved take is authoritative. Returns null when none or when the DB is inconsistent. */
export function approvedTake<T extends Take>(takes: T[]): T | null {
  const approved = takes.filter(t => t.approved === true && t.status === "approved");
  return approved.length === 1 ? approved[0] : null;
}

export function hasConflictingApprovals(takes: Take[]): boolean {
  return takes.filter(t => t.approved === true && t.status === "approved").length > 1;
}

/** Take to show by default: the approved one, else the newest. Never hides approved work behind a newer row. */
export function displayedTake<T extends Take>(takes: T[], selectedId?: string | null): T | null {
  if (selectedId) {
    const chosen = takes.find(t => t.id === selectedId);
    if (chosen) return chosen;
  }
  return approvedTake(takes) ?? takes[0] ?? null;
}

export type KeyframeSelection = { first_frame_asset_id: string | null; last_frame_asset_id: string | null } | null;

export function frameRole(selection: KeyframeSelection, takeId: string): "first" | "last" | null {
  if (selection?.first_frame_asset_id === takeId) return "first";
  if (selection?.last_frame_asset_id === takeId) return "last";
  return null;
}

import type { Answers } from "@/modules/anamnesis/fields";

// What this tab last stored of each anamnesis, kept in memory only (never in
// localStorage or another browser storage; it is gone on reload).
//
// The browser's back and forward buttons show pages from the client router
// cache, rendered with the props of the first visit. Without this, the form
// would come back with the answers and version of that visit: the latest text
// would seem gone and the next save would hit the version conflict. Keeping
// the version here avoids re-rendering the page on every autosave.

export type AnamnesisSnapshot = {
  updatedAt: string;
  answers: Answers;
  takenOn: string;
  status: "in_progress" | "completed";
};

const latestById = new Map<string, AnamnesisSnapshot>();
// Patients whose anamneses changed since their record was last shown.
const changedPatients = new Set<string>();

// The newer of what the page brought and what this tab stored since.
export function startingPoint(
  id: string,
  fromPage: AnamnesisSnapshot,
): AnamnesisSnapshot {
  const stored = latestById.get(id);
  return stored && Date.parse(stored.updatedAt) > Date.parse(fromPage.updatedAt)
    ? stored
    : fromPage;
}

export function rememberSaved(
  patientId: string,
  id: string,
  snapshot: AnamnesisSnapshot,
) {
  latestById.set(id, snapshot);
  changedPatients.add(patientId);
}

// True once after an anamnesis of the patient changed in this tab.
export function takeChanged(patientId: string): boolean {
  return changedPatients.delete(patientId);
}

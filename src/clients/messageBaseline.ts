export type MessageBaseline = {
  patientMessageCount: number;
  lastPatientText?: string;
  lastPatientContainerIdentity?: string;
  capturedAt: string;
};

export type LatestMessageState = {
  count: number;
  text?: string;
  containerIdentity?: string;
};

export function isNewerThanBaseline(baseline: MessageBaseline, latest: LatestMessageState): boolean {
  if (latest.count > baseline.patientMessageCount) return true;
  if (!latest.text) return false;
  if (latest.containerIdentity && baseline.lastPatientContainerIdentity &&
      latest.containerIdentity !== baseline.lastPatientContainerIdentity) return true;
  return latest.text !== baseline.lastPatientText;
}

export function retainNewerState(
  baseline: MessageBaseline,
  accepted: LatestMessageState,
  candidate: LatestMessageState,
): LatestMessageState {
  if (!isNewerThanBaseline(baseline, candidate)) return accepted;

  // Once a new response is accepted, only let the same DOM message evolve or
  // a genuinely appended message supersede it. Resumed encounters can reorder
  // historical groups while React reconciles the newly streamed response.
  if (candidate.count > accepted.count) return candidate;
  if (candidate.containerIdentity && candidate.containerIdentity === accepted.containerIdentity) {
    return candidate;
  }
  return accepted;
}

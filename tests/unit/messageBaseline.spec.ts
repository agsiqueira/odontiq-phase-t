import { expect, test } from "@playwright/test";
import { isNewerThanBaseline, retainNewerState, type MessageBaseline } from "../../src/clients/messageBaseline.js";

const baseline = (overrides: Partial<MessageBaseline> = {}): MessageBaseline => ({
  patientMessageCount: 0,
  capturedAt: "2026-07-21T00:00:00.000Z",
  ...overrides,
});

test("empty encounter has no new response", () => expect(isNewerThanBaseline(baseline(), { count: 0 })).toBe(false));
test("existing patient message is not new", () => expect(isNewerThanBaseline(baseline({ patientMessageCount: 2, lastPatientText: "old", lastPatientContainerIdentity: "p-2" }), { count: 2, text: "old", containerIdentity: "p-2" })).toBe(false));
test("appended patient message is new", () => expect(isNewerThanBaseline(baseline({ patientMessageCount: 2 }), { count: 3, text: "new" })).toBe(true));
test("streamed replacement in the last container is new", () => expect(isNewerThanBaseline(baseline({ patientMessageCount: 2, lastPatientText: "partial", lastPatientContainerIdentity: "p-2" }), { count: 2, text: "partial complete", containerIdentity: "p-2" })).toBe(true));
test("duplicate text in a different turn is new", () => expect(isNewerThanBaseline(baseline({ patientMessageCount: 2, lastPatientText: "same", lastPatientContainerIdentity: "p-2" }), { count: 3, text: "same", containerIdentity: "p-3" })).toBe(true));
test("long history remains a constant-size comparison", () => expect(isNewerThanBaseline(baseline({ patientMessageCount: 10_000, lastPatientText: "old" }), { count: 10_001, text: "new" })).toBe(true));
test("unchanged state represents no response before timeout", () => expect(isNewerThanBaseline(baseline({ patientMessageCount: 4, lastPatientText: "last" }), { count: 4, text: "last" })).toBe(false));
test("historical DOM reordering cannot replace an accepted new response", () => {
  const before = baseline({ patientMessageCount: 20, lastPatientText: "old airway answer", lastPatientContainerIdentity: "patient-19" });
  const accepted = { count: 21, text: "My tooth is causing severe pain.", containerIdentity: "patient-20" };
  const reorderedHistoricalCandidate = { count: 21, text: "old fever answer", containerIdentity: "patient-18" };
  expect(retainNewerState(before, accepted, reorderedHistoricalCandidate)).toEqual(accepted);
});

test("the accepted streamed response may evolve in the same container", () => {
  const before = baseline({ patientMessageCount: 20, lastPatientText: "old airway answer", lastPatientContainerIdentity: "patient-19" });
  const accepted = { count: 21, text: "My tooth is causing", containerIdentity: "patient-20" };
  const completed = { count: 21, text: "My tooth is causing severe pain.", containerIdentity: "patient-20" };
  expect(retainNewerState(before, accepted, completed)).toEqual(completed);
});

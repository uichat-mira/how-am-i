import { SCHEMA_ID } from "../../src/schema";

export const SYNTHETIC_BATCH_ID = "c647a4b7-8a66-4e88-a13e-c203188ba985";
export const SYNTHETIC_EVENT_ID = "5279291f-386a-4930-96e3-bd302e4161c1";

export function syntheticEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    event_id: SYNTHETIC_EVENT_ID,
    occurred_at: "2026-11-17T13:00:00Z",
    kind: "candidate.captured",
    level: "info",
    repository: "uichat-mira/cloud-auth",
    issue_number: 123,
    run_id: "44000000000",
    run_attempt: 1,
    stage: "capture",
    outcome: "captured",
    evidence_ref: {
      type: "actions-run",
      id: "44000000000",
    },
    ...overrides,
  };
}

export function syntheticBatch(events: unknown[] = [syntheticEvent()]): Record<string, unknown> {
  return {
    schema: SCHEMA_ID,
    batch_id: SYNTHETIC_BATCH_ID,
    events,
  };
}

export function syntheticBody(events?: unknown[]): string {
  return JSON.stringify(syntheticBatch(events));
}

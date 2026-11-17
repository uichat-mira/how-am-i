import { describe, expect, it } from "vitest";
import { MAX_EVENTS, ValidationError, validateBatch } from "../src/schema";
import { syntheticBatch, syntheticEvent } from "./helpers/fixtures";

function expectValidationCode(value: unknown, code: string): void {
  try {
    validateBatch(value);
    expect.unreachable(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).code).toBe(code);
  }
}

describe("haomai.telemetry.v1 validation", () => {
  it("accepts the synthetic contract sample", () => {
    const batch = validateBatch(syntheticBatch());
    expect(batch.schema).toBe("haomai.telemetry.v1");
    expect(batch.events).toHaveLength(1);
    expect(batch.events[0]?.run_id).toBe("44000000000");
    expect(batch.events[0]?.evidence_ref).toEqual({
      type: "actions-run",
      id: "44000000000",
    });
  });

  it("accepts optional error_code on a failure event", () => {
    const batch = validateBatch(
      syntheticBatch([syntheticEvent({ kind: "verify.failed", level: "error", error_code: "TESTS_FAILED" })]),
    );
    expect(batch.events[0]?.error_code).toBe("TESTS_FAILED");
  });

  it("rejects an unsupported or missing schema identifier", () => {
    expectValidationCode({ ...syntheticBatch(), schema: "haomai.telemetry.v2" }, "unsupported_schema");
    const missingSchema = syntheticBatch();
    delete missingSchema.schema;
    expectValidationCode(missingSchema, "unsupported_schema");
  });

  it("rejects malformed batch ids", () => {
    expectValidationCode({ ...syntheticBatch(), batch_id: "not-a-uuid" }, "invalid_batch_id");
  });

  it("rejects unknown top-level metadata", () => {
    expectValidationCode({ ...syntheticBatch(), metadata: { host: "secret-host" } }, "unsupported_field");
  });

  it("rejects client-supplied trust identity", () => {
    expectValidationCode(
      { ...syntheticBatch(), trust_class: "trusted_pipeline" },
      "unsupported_field",
    );
    expectValidationCode(
      syntheticBatch([syntheticEvent({ trust_class: "trusted_pipeline" })]),
      "unsupported_field",
    );
  });

  it("rejects free-text prompt, log, stdout and header payloads", () => {
    for (const field of ["prompt", "log", "stdout", "stderr", "headers", "authorization", "metadata"]) {
      expectValidationCode(syntheticBatch([syntheticEvent({ [field]: "secret material" })]), "unsupported_field");
    }
  });

  it("rejects unknown event kinds", () => {
    expectValidationCode(
      syntheticBatch([syntheticEvent({ kind: "tool.executed" })]),
      "unsupported_event_kind",
    );
  });

  it("rejects unknown evidence reference fields and types", () => {
    expectValidationCode(
      syntheticBatch([syntheticEvent({ evidence_ref: { type: "actions-run", id: "1", url: "https://evil.example" } })]),
      "unsupported_field",
    );
    expectValidationCode(
      syntheticBatch([syntheticEvent({ evidence_ref: { type: "url", id: "1" } })]),
      "invalid_evidence_ref",
    );
  });

  it("requires run_id to stay a digit string", () => {
    expectValidationCode(syntheticBatch([syntheticEvent({ run_id: 44000000000 })]), "invalid_run_id");
  });

  it("rejects a missing required event field", () => {
    const event = syntheticEvent();
    delete event.run_id;
    expectValidationCode(syntheticBatch([event]), "invalid_run_id");
  });

  it("rejects path traversal or URL-shaped repository values", () => {
    for (const repository of ["../../etc/passwd", "https://example.com/a", "owner", "owner/repo/extra"]) {
      expectValidationCode(syntheticBatch([syntheticEvent({ repository })]), "invalid_repository");
    }
  });

  it("rejects malformed timestamps and levels", () => {
    expectValidationCode(
      syntheticBatch([syntheticEvent({ occurred_at: "yesterday" })]),
      "invalid_occurred_at",
    );
    expectValidationCode(syntheticBatch([syntheticEvent({ level: "debug" })]), "invalid_level");
  });

  it("rejects an empty batch and a batch above 16 events", () => {
    expectValidationCode({ ...syntheticBatch(), events: [] }, "invalid_events");
    const tooMany = Array.from({ length: MAX_EVENTS + 1 }, (_, index) =>
      syntheticEvent({ event_id: `5279291f-386a-4930-96e3-bd302e4161c${index % 10}` }),
    );
    expectValidationCode({ ...syntheticBatch(), events: tooMany }, "too_many_events");
  });

  it("rejects an individual event above 2 KiB before field validation", () => {
    expectValidationCode(
      syntheticBatch([syntheticEvent({ summary: "x".repeat(3000) })]),
      "event_too_large",
    );
  });

  it("rejects evidence ids outside the bounded digit form", () => {
    expectValidationCode(
      syntheticBatch([syntheticEvent({ evidence_ref: { type: "artifact", id: "../../secret" } })]),
      "invalid_evidence_ref",
    );
  });

  it("rejects malformed error codes", () => {
    expectValidationCode(
      syntheticBatch([syntheticEvent({ kind: "worker.failed", error_code: "lowercase" })]),
      "invalid_error_code",
    );
  });
});

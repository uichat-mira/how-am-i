export const SCHEMA_ID = "haomai.telemetry.v1";
export const MAX_BODY_BYTES = 32 * 1024;
export const MAX_EVENTS = 16;
export const MAX_EVENT_BYTES = 2 * 1024;

export const EVENT_KINDS = [
  "pipeline.enrolled",
  "worker.started",
  "worker.stopped",
  "worker.failed",
  "candidate.captured",
  "candidate.unavailable",
  "verify.passed",
  "verify.failed",
  "delivery.draft_pr_created",
  "delivery.failed",
  "recovery.detected",
  "recovery.failed",
  "run.finished",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_LEVELS = ["info", "warn", "error"] as const;
export type EventLevel = (typeof EVENT_LEVELS)[number];

export const EVIDENCE_TYPES = ["actions-run", "artifact", "pull-request", "issue"] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export interface EvidenceRef {
  type: EvidenceType;
  id: string;
}

export interface TelemetryEvent {
  event_id: string;
  occurred_at: string;
  kind: EventKind;
  level: EventLevel;
  repository: string;
  issue_number: number;
  run_id: string;
  run_attempt: number;
  stage: string;
  outcome: string;
  evidence_ref?: EvidenceRef;
  error_code?: string;
}

export interface TelemetryBatch {
  schema: typeof SCHEMA_ID;
  batch_id: string;
  events: TelemetryEvent[];
}

const BATCH_FIELDS = new Set(["schema", "batch_id", "events"]);
const EVENT_FIELDS = new Set([
  "event_id",
  "occurred_at",
  "kind",
  "level",
  "repository",
  "issue_number",
  "run_id",
  "run_attempt",
  "stage",
  "outcome",
  "evidence_ref",
  "error_code",
]);
const EVIDENCE_FIELDS = new Set(["type", "id"]);

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const RUN_ID_PATTERN = /^[0-9]{1,32}$/;
const SLUG_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const OCCURRED_AT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export class ValidationError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super(code);
    this.name = "ValidationError";
    this.code = code;
    this.status = status;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejectUnknownFields(value: Record<string, unknown>, allowed: Set<string>): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ValidationError("unsupported_field", 400);
    }
  }
}

function requireObject(value: unknown, code: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new ValidationError(code, 400);
  }
  return value;
}

function requireString(value: unknown, code: string, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new ValidationError(code, 400);
  }
  return value;
}

function requirePattern(value: unknown, pattern: RegExp, code: string, maxLength: number): string {
  const text = requireString(value, code, maxLength);
  if (!pattern.test(text)) {
    throw new ValidationError(code, 400);
  }
  return text;
}

function requireInteger(value: unknown, min: number, max: number, code: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ValidationError(code, 400);
  }
  return value;
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], code: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(code, 400);
  }
  return value as T;
}

function validateEvidenceRef(value: unknown): EvidenceRef {
  const evidence = requireObject(value, "invalid_evidence_ref");
  rejectUnknownFields(evidence, EVIDENCE_FIELDS);
  return {
    type: requireEnum(evidence.type, EVIDENCE_TYPES, "invalid_evidence_ref"),
    id: requirePattern(evidence.id, RUN_ID_PATTERN, "invalid_evidence_ref", 20),
  };
}

function validateEvent(value: unknown): TelemetryEvent {
  const event = requireObject(value, "invalid_event");
  rejectUnknownFields(event, EVENT_FIELDS);

  const eventId = requirePattern(event.event_id, UUID_PATTERN, "invalid_event_id", 64);
  const occurredAt = requirePattern(
    event.occurred_at,
    OCCURRED_AT_PATTERN,
    "invalid_occurred_at",
    32,
  );
  if (Number.isNaN(Date.parse(occurredAt))) {
    throw new ValidationError("invalid_occurred_at", 400);
  }

  const validated: TelemetryEvent = {
    event_id: eventId,
    occurred_at: occurredAt,
    kind: requireEnum(event.kind, EVENT_KINDS, "unsupported_event_kind"),
    level: requireEnum(event.level, EVENT_LEVELS, "invalid_level"),
    repository: requirePattern(event.repository, REPOSITORY_PATTERN, "invalid_repository", 140),
    issue_number: requireInteger(event.issue_number, 1, 2_147_483_647, "invalid_issue_number"),
    run_id: requirePattern(event.run_id, RUN_ID_PATTERN, "invalid_run_id", 32),
    run_attempt: requireInteger(event.run_attempt, 1, 1000, "invalid_run_attempt"),
    stage: requirePattern(event.stage, SLUG_PATTERN, "invalid_stage", 32),
    outcome: requirePattern(event.outcome, SLUG_PATTERN, "invalid_outcome", 32),
  };

  if (event.evidence_ref !== undefined) {
    validated.evidence_ref = validateEvidenceRef(event.evidence_ref);
  }
  if (event.error_code !== undefined) {
    validated.error_code = requirePattern(
      event.error_code,
      ERROR_CODE_PATTERN,
      "invalid_error_code",
      64,
    );
  }

  return validated;
}

export function validateBatch(value: unknown): TelemetryBatch {
  const batch = requireObject(value, "invalid_batch");
  rejectUnknownFields(batch, BATCH_FIELDS);

  if (batch.schema !== SCHEMA_ID) {
    throw new ValidationError("unsupported_schema", 400);
  }
  const batchId = requirePattern(batch.batch_id, UUID_PATTERN, "invalid_batch_id", 64);

  if (!Array.isArray(batch.events) || batch.events.length === 0) {
    throw new ValidationError("invalid_events", 400);
  }
  if (batch.events.length > MAX_EVENTS) {
    throw new ValidationError("too_many_events", 400);
  }

  const events = batch.events.map((rawEvent) => {
    if (new TextEncoder().encode(JSON.stringify(rawEvent)).byteLength > MAX_EVENT_BYTES) {
      throw new ValidationError("event_too_large", 413);
    }
    return validateEvent(rawEvent);
  });

  return { schema: SCHEMA_ID, batch_id: batchId, events };
}

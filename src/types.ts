export interface Env {
  HAOMAI_HMAC_SECRET: string;
}

export type HaomaiLogRecord = {
  event: "haomai.event";
  schema: string;
  received_at: string;
  app_id: string;
  trust_class: string;
  batch_id: string;
  event_id: string;
  occurred_at: string;
  kind: string;
  level: string;
  repository: string;
  issue_number: number;
  run_id: string;
  run_attempt: number;
  stage: string;
  outcome: string;
  evidence_ref?: { type: string; id: string };
  error_code?: string;
};

export type Logger = (record: HaomaiLogRecord) => void;

export interface WorkerOptions {
  logger?: Logger;
  now?: () => number;
}

import {
  APP_ID,
  MAX_TIMESTAMP_DRIFT_SECONDS,
  TRUST_CLASS,
} from "./constants";
import { signRequestBody, timingSafeEqualHex } from "./hmac";
import {
  MAX_BODY_BYTES,
  SCHEMA_ID,
  ValidationError,
  validateBatch,
  type TelemetryBatch,
} from "./schema";
import type { Env, HaomaiLogRecord, Logger, WorkerOptions } from "./types";

const APP_ID_PATTERN = /^[a-z0-9-]{1,64}$/;
const TIMESTAMP_PATTERN = /^[0-9]{10}$/;
const NONCE_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;
const SIGNATURE_PATTERN = /^[0-9a-f]{64}$/i;

interface ResponseError {
  error: {
    code: string;
  };
}

function jsonResponse(status: number, body: unknown, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function errorResponse(status: number, code: string, headers?: HeadersInit): Response {
  const body: ResponseError = { error: { code } };
  return jsonResponse(status, body, headers);
}

class BodyTooLargeError extends Error {}

async function readBodyLimited(request: Request, limit: number): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    if (!/^[0-9]+$/.test(contentLength)) {
      throw new ValidationError("invalid_content_length", 400);
    }
    if (Number(contentLength) > limit) {
      throw new BodyTooLargeError();
    }
  }

  if (request.body === null) {
    return new Uint8Array(0);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new ValidationError("invalid_utf8", 400);
  }
}

function parseJsonBatch(bytes: Uint8Array): TelemetryBatch {
  const text = decodeUtf8(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ValidationError("invalid_json", 400);
  }
  return validateBatch(parsed);
}

function buildLogRecord(
  batch: TelemetryBatch,
  event: TelemetryBatch["events"][number],
  receivedAt: string,
): HaomaiLogRecord {
  return {
    event: "haomai.event",
    schema: batch.schema,
    received_at: receivedAt,
    app_id: APP_ID,
    trust_class: TRUST_CLASS,
    batch_id: batch.batch_id,
    ...event,
  };
}

async function handleEvents(
  request: Request,
  env: Env,
  logger: Logger,
  now: () => number,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.search !== "") {
    return errorResponse(400, "query_not_allowed");
  }

  if (!env.HAOMAI_HMAC_SECRET) {
    return errorResponse(503, "service_not_configured");
  }

  const contentType = request.headers.get("content-type");
  if (contentType === null || contentType.split(";")[0]?.trim().toLowerCase() !== "application/json") {
    return errorResponse(415, "unsupported_media_type");
  }

  const appId = request.headers.get("x-haomai-app-id");
  const timestamp = request.headers.get("x-haomai-timestamp");
  const nonce = request.headers.get("x-haomai-nonce");
  const signature = request.headers.get("x-haomai-signature");
  if (
    appId === null ||
    timestamp === null ||
    nonce === null ||
    signature === null ||
    !APP_ID_PATTERN.test(appId) ||
    !TIMESTAMP_PATTERN.test(timestamp) ||
    !NONCE_PATTERN.test(nonce) ||
    !SIGNATURE_PATTERN.test(signature)
  ) {
    return errorResponse(401, "unauthorized");
  }

  if (appId !== APP_ID) {
    return errorResponse(401, "unauthorized");
  }

  const nowSeconds = Math.floor(now() / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > MAX_TIMESTAMP_DRIFT_SECONDS) {
    return errorResponse(401, "timestamp_out_of_window");
  }

  let body: Uint8Array;
  try {
    body = await readBodyLimited(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return errorResponse(413, "body_too_large");
    }
    if (error instanceof ValidationError) {
      return errorResponse(error.status, error.code);
    }
    throw error;
  }

  const expectedSignature = await signRequestBody(
    env.HAOMAI_HMAC_SECRET,
    request.method,
    url.pathname,
    timestamp,
    nonce,
    body,
  );
  if (!timingSafeEqualHex(expectedSignature, signature.toLowerCase())) {
    return errorResponse(401, "unauthorized");
  }

  let batch: TelemetryBatch;
  try {
    batch = parseJsonBatch(body);
  } catch (error) {
    if (error instanceof ValidationError) {
      return errorResponse(error.status, error.code);
    }
    throw error;
  }

  const receivedAt = new Date(now()).toISOString();
  try {
    for (const event of batch.events) {
      logger(buildLogRecord(batch, event, receivedAt));
    }
  } catch {
    return errorResponse(503, "log_emission_failed");
  }

  return jsonResponse(202, {
    accepted: true,
    schema: SCHEMA_ID,
    batch_id: batch.batch_id,
    event_count: batch.events.length,
    received_at: receivedAt,
    delivery: "log_only",
    persisted: false,
    exactly_once: false,
  });
}

export function createWorker(options: WorkerOptions = {}): ExportedHandler<Env> {
  const logger: Logger = options.logger ?? ((record) => console.log(record));
  const now: () => number = options.now ?? (() => Date.now());

  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        if (request.method !== "GET") {
          return errorResponse(405, "method_not_allowed", { allow: "GET" });
        }
        return jsonResponse(200, {
          status: "ok",
          service: "how-am-i",
          schema: SCHEMA_ID,
        });
      }

      if (url.pathname === "/v1/events") {
        if (request.method !== "POST") {
          return errorResponse(405, "method_not_allowed", { allow: "POST" });
        }
        return handleEvents(request, env, logger, now);
      }

      return errorResponse(404, "not_found");
    },
  };
}

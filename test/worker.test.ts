import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { MAX_TIMESTAMP_DRIFT_SECONDS } from "../src/constants";
import type { Env } from "../src/types";
import { createWorker } from "../src/worker";
import { MAX_BODY_BYTES } from "../src/schema";
import { syntheticBody } from "./helpers/fixtures";
import { TEST_HMAC_SECRET } from "./helpers/secret";
import { signPayload } from "./helpers/sign";

const env: Env = { HAOMAI_HMAC_SECRET: TEST_HMAC_SECRET };
const ctx = {} as ExecutionContext;
const encoder = new TextEncoder();

function fixedNow(timestampSeconds: number): () => number {
  return () => timestampSeconds * 1000;
}

describe("GET /health", () => {
  it("returns non-sensitive liveness and schema information", async () => {
    const response = await SELF.fetch("https://haomai.test/health");
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      status: "ok",
      service: "how-am-i",
      schema: "haomai.telemetry.v1",
    });
    const text = JSON.stringify(body);
    expect(text).not.toContain(TEST_HMAC_SECRET);
    expect(text).not.toContain("mira-worker-reporter");
  });

  it("rejects non-GET methods", async () => {
    const response = await SELF.fetch("https://haomai.test/health", { method: "POST" });
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
  });
});

describe("POST /v1/events in the Workers runtime", () => {
  it("accepts a valid synthetic signed batch with 202 log-only semantics", async () => {
    const signed = await signPayload(syntheticBody());
    const response = await SELF.fetch("https://haomai.test/v1/events", {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
    });
    expect(response.status).toBe(202);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      accepted: true,
      schema: "haomai.telemetry.v1",
      event_count: 1,
      delivery: "log_only",
      persisted: false,
      exactly_once: false,
    });
    expect(JSON.stringify(body)).not.toContain(TEST_HMAC_SECRET);
  });

  it("accepts the same signed request twice, demonstrating no nonce store or exactly-once", async () => {
    const signed = await signPayload(syntheticBody());
    const first = await SELF.fetch("https://haomai.test/v1/events", {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
    });
    const replay = await SELF.fetch("https://haomai.test/v1/events", {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
    });
    expect(first.status).toBe(202);
    expect(replay.status).toBe(202);
  });

  it("rejects a modified signature header with 401", async () => {
    const signed = await signPayload(syntheticBody());
    const signature = signed.headers["x-haomai-signature"] ?? "";
    signed.headers["x-haomai-signature"] =
      signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0");
    const response = await SELF.fetch("https://haomai.test/v1/events", {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
    });
    expect(response.status).toBe(401);
  });

  it("rejects a tampered body with 401", async () => {
    const signed = await signPayload(syntheticBody());
    const tampered = signed.body.replace("candidate.captured", "verify.passed");
    const response = await SELF.fetch("https://haomai.test/v1/events", {
      method: "POST",
      headers: signed.headers,
      body: tampered,
    });
    expect(response.status).toBe(401);
  });

  it("rejects a wrong secret, wrong app id and missing signature headers with 401", async () => {
    const wrongSecret = await signPayload(syntheticBody(), { secret: "another-secret-value" });
    const wrongApp = await signPayload(syntheticBody(), { appId: "temporary-debug-reporter" });
    const missing = await signPayload(syntheticBody());
    delete missing.headers["x-haomai-signature"];

    for (const attempt of [wrongSecret, wrongApp, missing]) {
      const response = await SELF.fetch("https://haomai.test/v1/events", {
        method: "POST",
        headers: attempt.headers,
        body: attempt.body,
      });
      expect(response.status).toBe(401);
    }
  });

  it("rejects timestamps outside the 90 second window", async () => {
    const stale = await signPayload(syntheticBody(), {
      timestamp: Math.floor(Date.now() / 1000) - MAX_TIMESTAMP_DRIFT_SECONDS - 1,
    });
    const response = await SELF.fetch("https://haomai.test/v1/events", {
      method: "POST",
      headers: stale.headers,
      body: stale.body,
    });
    expect(response.status).toBe(401);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "timestamp_out_of_window",
    );
  });

  it("rejects an oversized body before signature work", async () => {
    const oversized = JSON.stringify({ padding: "x".repeat(MAX_BODY_BYTES + 1) });
    const response = await SELF.fetch("https://haomai.test/v1/events", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-haomai-app-id": "mira-worker-reporter",
        "x-haomai-timestamp": String(Math.floor(Date.now() / 1000)),
        "x-haomai-nonce": "test-nonce-0123456789",
        "x-haomai-signature": "0".repeat(64),
      },
      body: oversized,
    });
    expect(response.status).toBe(413);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("body_too_large");
  });

  it("rejects unsupported media types", async () => {
    const signed = await signPayload(syntheticBody());
    const response = await SELF.fetch("https://haomai.test/v1/events", {
      method: "POST",
      headers: { ...signed.headers, "content-type": "text/plain" },
      body: signed.body,
    });
    expect(response.status).toBe(415);
  });

  it("rejects query strings, wrong methods and unknown paths", async () => {
    const signed = await signPayload(syntheticBody());
    const query = await SELF.fetch("https://haomai.test/v1/events?run_id=1", {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
    });
    expect(query.status).toBe(400);

    const getEvents = await SELF.fetch("https://haomai.test/v1/events");
    expect(getEvents.status).toBe(405);
    expect(getEvents.headers.get("allow")).toBe("POST");

    const unknown = await SELF.fetch("https://haomai.test/v1/other");
    expect(unknown.status).toBe(404);
  });

  it("never echoes the secret or signature in rejection responses", async () => {
    const signed = await signPayload(syntheticBody(), { secret: "wrong-secret-value" });
    const response = await SELF.fetch("https://haomai.test/v1/events", {
      method: "POST",
      headers: signed.headers,
      body: signed.body,
    });
    const text = await response.text();
    expect(response.status).toBe(401);
    expect(text).not.toContain(TEST_HMAC_SECRET);
    expect(text).not.toContain(signed.headers["x-haomai-signature"] ?? "");
    expect(text).not.toContain("wrong-secret-value");
  });
});

describe("handler logging and failure behavior", () => {
  it("emits sanitized structured JSON and resolves server-side trust fields", async () => {
    const logs: unknown[] = [];
    const worker = createWorker({
      logger: (record) => logs.push(record),
      now: fixedNow(1_700_000_000),
    });
    const timestamp = 1_700_000_000;
    const signed = await signPayload(syntheticBody(), { timestamp });
    const response = await worker.fetch!(
      new Request("https://haomai.test/v1/events", {
        method: "POST",
        headers: signed.headers,
        body: signed.body,
      }),
      env,
      ctx,
    );

    expect(response.status).toBe(202);
    expect(logs).toHaveLength(1);
    const record = logs[0] as Record<string, unknown>;
    expect(record).toMatchObject({
      event: "haomai.event",
      schema: "haomai.telemetry.v1",
      received_at: "2023-11-14T22:13:20.000Z",
      app_id: "mira-worker-reporter",
      trust_class: "trusted_pipeline",
      batch_id: "c647a4b7-8a66-4e88-a13e-c203188ba985",
      event_id: "5279291f-386a-4930-96e3-bd302e4161c1",
      run_id: "44000000000",
    });
    const serialized = JSON.stringify(logs[0]);
    expect(serialized).not.toContain(TEST_HMAC_SECRET);
    expect(serialized).not.toContain(signed.headers["x-haomai-signature"] ?? "");
    expect(serialized).not.toContain("content-type");
  });

  it("accepts the same event_id under a fresh signature twice, with no read-side dedupe", async () => {
    const logs: unknown[] = [];
    const worker = createWorker({
      logger: (record) => logs.push(record),
      now: fixedNow(1_700_000_000),
    });
    const body = syntheticBody();
    for (const nonce of ["first-nonce-0123456789", "second-nonce-012345678"]) {
      const signed = await signPayload(body, { timestamp: 1_700_000_000, nonce });
      const response = await worker.fetch!(
        new Request("https://haomai.test/v1/events", {
          method: "POST",
          headers: signed.headers,
          body: signed.body,
        }),
        env,
        ctx,
      );
      expect(response.status).toBe(202);
    }
    expect(logs).toHaveLength(2);
    expect((logs[0] as Record<string, unknown>).event_id).toBe(
      (logs[1] as Record<string, unknown>).event_id,
    );
  });

  it("fails closed with 503 when the log emission throws", async () => {
    const worker = createWorker({
      logger: () => {
        throw new Error("sink unavailable");
      },
      now: fixedNow(1_700_000_000),
    });
    const signed = await signPayload(syntheticBody(), { timestamp: 1_700_000_000 });
    const response = await worker.fetch!(
      new Request("https://haomai.test/v1/events", {
        method: "POST",
        headers: signed.headers,
        body: signed.body,
      }),
      env,
      ctx,
    );
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).not.toContain("sink unavailable");
    expect(((JSON.parse(text) as { error: { code: string } }).error).code).toBe("log_emission_failed");
  });

  it("fails closed when the Worker secret binding is missing", async () => {
    const worker = createWorker({ logger: () => {}, now: fixedNow(1_700_000_000) });
    const signed = await signPayload(syntheticBody(), { timestamp: 1_700_000_000 });
    const response = await worker.fetch!(
      new Request("https://haomai.test/v1/events", {
        method: "POST",
        headers: signed.headers,
        body: signed.body,
      }),
      {} as Env,
      ctx,
    );
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "service_not_configured",
    );
  });

  it("rejects invalid UTF-8 bodies after authenticating raw bytes", async () => {
    const logs: unknown[] = [];
    const worker = createWorker({ logger: (record) => logs.push(record), now: fixedNow(1_700_000_000) });
    const invalid = new Uint8Array([0x7b, 0xff, 0x7d]);
    const signed = await signPayload("placeholder", { timestamp: 1_700_000_000 });
    const { signRequestBody } = await import("../src/hmac");
    signed.headers["x-haomai-signature"] = await signRequestBody(
      TEST_HMAC_SECRET,
      "POST",
      "/v1/events",
      "1700000000",
      "test-nonce-0123456789",
      invalid,
    );
    const response = await worker.fetch!(
      new Request("https://haomai.test/v1/events", {
        method: "POST",
        headers: signed.headers,
        body: invalid,
      }),
      env,
      ctx,
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("invalid_utf8");
    expect(logs).toHaveLength(0);
  });

  it("treats a zero-length signed body as invalid JSON without logging", async () => {
    const logs: unknown[] = [];
    const worker = createWorker({ logger: (record) => logs.push(record), now: fixedNow(1_700_000_000) });
    const signed = await signPayload("", { timestamp: 1_700_000_000 });
    const response = await worker.fetch!(
      new Request("https://haomai.test/v1/events", {
        method: "POST",
        headers: signed.headers,
        body: encoder.encode(""),
      }),
      env,
      ctx,
    );
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("invalid_json");
    expect(logs).toHaveLength(0);
  });
});

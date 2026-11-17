import { describe, expect, it } from "vitest";
import {
  buildSigningInput,
  hmacSha256Hex,
  sha256Hex,
  signRequestBody,
  timingSafeEqualHex,
} from "../src/hmac";

const encoder = new TextEncoder();

describe("SHA-256", () => {
  it("matches the standard empty-string vector", async () => {
    expect(await sha256Hex(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("matches the standard abc vector", async () => {
    expect(await sha256Hex(encoder.encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("HMAC-SHA-256", () => {
  it("matches RFC 4231 test case 2", async () => {
    expect(await hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("binds method, path, timestamp, nonce and body hash into one canonical string", () => {
    expect(buildSigningInput("POST", "/v1/events", "1700000000", "nonce-0123456789", "abcd")).toBe(
      "v1\nPOST\n/v1/events\n1700000000\nnonce-0123456789\nabcd",
    );
  });

  it("produces a deterministic lowercase hex signature for fixed inputs", async () => {
    const signature = await signRequestBody(
      "haomai-test-only-hmac-secret-v1",
      "POST",
      "/v1/events",
      "1700000000",
      "test-nonce-0123456789",
      encoder.encode(JSON.stringify({ schema: "haomai.telemetry.v1" })),
    );
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(signature).toBe(
      await signRequestBody(
        "haomai-test-only-hmac-secret-v1",
        "POST",
        "/v1/events",
        "1700000000",
        "test-nonce-0123456789",
        encoder.encode(JSON.stringify({ schema: "haomai.telemetry.v1" })),
      ),
    );
  });

  it("changes when the method, path, timestamp, nonce or body changes", async () => {
    const base = {
      method: "POST",
      path: "/v1/events",
      timestamp: "1700000000",
      nonce: "test-nonce-0123456789",
      body: encoder.encode("{}"),
    };
    const signatures = await Promise.all([
      signRequestBody("secret", base.method, base.path, base.timestamp, base.nonce, base.body),
      signRequestBody("secret", "PUT", base.path, base.timestamp, base.nonce, base.body),
      signRequestBody("secret", base.method, "/v1/other", base.timestamp, base.nonce, base.body),
      signRequestBody("secret", base.method, base.path, "1700000001", base.nonce, base.body),
      signRequestBody("secret", base.method, base.path, base.timestamp, "other-nonce-012345", base.body),
      signRequestBody("secret", base.method, base.path, base.timestamp, base.nonce, encoder.encode("[]")),
    ]);
    expect(new Set(signatures).size).toBe(signatures.length);
  });
});

describe("constant-time comparison helper", () => {
  it("accepts identical hex and rejects a single changed bit", () => {
    expect(timingSafeEqualHex("abcd", "abcd")).toBe(true);
    expect(timingSafeEqualHex("abcd", "abce")).toBe(false);
  });

  it("rejects different lengths without throwing", () => {
    expect(timingSafeEqualHex("abcd", "abcde")).toBe(false);
  });
});

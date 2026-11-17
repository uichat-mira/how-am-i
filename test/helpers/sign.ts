import { signRequestBody } from "../../src/hmac";
import { TEST_APP_ID, TEST_HMAC_SECRET } from "./secret";

export interface SignOptions {
  secret?: string;
  timestamp?: number;
  nonce?: string;
  appId?: string;
  path?: string;
  method?: string;
}

export async function signPayload(
  body: string,
  options: SignOptions = {},
): Promise<{ headers: Record<string, string>; body: string }> {
  const method = options.method ?? "POST";
  const path = options.path ?? "/v1/events";
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const nonce = options.nonce ?? "test-nonce-0123456789";
  const signature = await signRequestBody(
    options.secret ?? TEST_HMAC_SECRET,
    method,
    path,
    timestamp,
    nonce,
    new TextEncoder().encode(body),
  );

  return {
    body,
    headers: {
      "content-type": "application/json",
      "x-haomai-app-id": options.appId ?? TEST_APP_ID,
      "x-haomai-timestamp": timestamp,
      "x-haomai-nonce": nonce,
      "x-haomai-signature": signature,
    },
  };
}

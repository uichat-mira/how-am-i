const encoder = new TextEncoder();

export function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(new Uint8Array(digest));
}

export function buildSigningInput(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  bodySha256Hex: string,
): string {
  return `v1\n${method}\n${path}\n${timestamp}\n${nonce}\n${bodySha256Hex}`;
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(new Uint8Array(signature));
}

export function timingSafeEqualHex(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ provided.charCodeAt(index);
  }
  return difference === 0;
}

export async function signRequestBody(
  secret: string,
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  body: Uint8Array,
): Promise<string> {
  const bodyHash = await sha256Hex(body);
  return hmacSha256Hex(secret, buildSigningInput(method, path, timestamp, nonce, bodyHash));
}

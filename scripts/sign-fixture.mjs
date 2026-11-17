import { createHash, createHmac, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const secret = process.env.HAOMAI_HMAC_SECRET;
if (!secret) {
  console.error("HAOMAI_HMAC_SECRET is required (use the same value as the local Worker binding).");
  process.exit(1);
}

const fixturePath = resolve(process.argv[2] ?? "fixtures/synthetic-batch.json");
const body = await readFile(fixturePath);
const bodyHash = createHash("sha256").update(body).digest("hex");
const timestamp = String(Math.floor(Date.now() / 1000));
const nonce = randomBytes(18).toString("base64url");
const path = "/v1/events";
const method = "POST";
const signingInput = `v1\n${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
const signature = createHmac("sha256", secret).update(signingInput).digest("hex");

console.log(`# synthetic fixture: ${fixturePath}`);
console.log(`curl -i http://127.0.0.1:8787${path} \\`);
console.log(`  -X ${method} \\`);
console.log(`  -H 'content-type: application/json' \\`);
console.log(`  -H 'x-haomai-app-id: mira-worker-reporter' \\`);
console.log(`  -H 'x-haomai-timestamp: ${timestamp}' \\`);
console.log(`  -H 'x-haomai-nonce: ${nonce}' \\`);
console.log(`  -H 'x-haomai-signature: ${signature}' \\`);
console.log(`  --data-binary @${fixturePath}`);

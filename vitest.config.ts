import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
import { TEST_HMAC_SECRET } from "./test/helpers/secret.ts";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          HAOMAI_HMAC_SECRET: TEST_HMAC_SECRET,
        },
      },
    }),
  ],
});

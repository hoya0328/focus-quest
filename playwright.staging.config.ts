import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3210";
const remoteBaseURL = Boolean(process.env.E2E_BASE_URL);
const localChrome = process.env.CI ? {} : { channel: "chrome" as const };

export default defineConfig({
  testDir: "./e2e",
  testMatch: /staging\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  use: {
    ...devices["Desktop Chrome"],
    ...localChrome,
    baseURL,
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: remoteBaseURL
    ? undefined
    : {
        command:
          "npx wrangler dev --cwd dist/server --config wrangler.json --ip 127.0.0.1 --port 3210 --local",
        env: {
          CLOUDFLARE_DEV_REGISTRY_PATH: `${process.cwd()}/.wrangler/e2e-staging-registry`,
          XDG_CONFIG_HOME: `${process.cwd()}/.wrangler/xdg-e2e-staging`,
          SUPABASE_URL: process.env.E2E_SUPABASE_URL || "",
          SUPABASE_SERVICE_ROLE_KEY:
            process.env.E2E_SUPABASE_SERVICE_ROLE_KEY || "",
        },
        reuseExistingServer: false,
        timeout: 120_000,
        url: baseURL,
      },
});

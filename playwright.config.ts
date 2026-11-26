import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3110";
const localChrome = process.env.CI ? {} : { channel: "chrome" as const };

export default defineConfig({
  testDir: "./e2e",
  testIgnore: /staging\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  workers: 2,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    serviceWorkers: "block",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command:
      "npx wrangler dev --config wrangler.public.jsonc --ip 127.0.0.1 --port 3110 --local",
    env: {
      CLOUDFLARE_DEV_REGISTRY_PATH: `${process.cwd()}/.wrangler/e2e-registry`,
      XDG_CONFIG_HOME: `${process.cwd()}/.wrangler/xdg-e2e`,
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: baseURL,
  },
  projects: [
    {
      name: "desktop-chromium",
      testMatch: [/guest\.spec\.ts/, /world-growth\.spec\.ts/, /privacy\.spec\.ts/, /launch\.spec\.ts/, /support-install\.spec\.ts/],
      use: { ...devices["Desktop Chrome"], ...localChrome },
    },
    {
      name: "mobile-chromium",
      testMatch: /responsive\.spec\.ts/,
      use: { ...devices["Pixel 7"], ...localChrome },
    },
    {
      name: "tablet-chromium",
      testMatch: /responsive\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        ...localChrome,
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
        viewport: { height: 1194, width: 834 },
      },
    },
  ],
});

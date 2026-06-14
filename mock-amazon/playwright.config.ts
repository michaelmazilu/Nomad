import { defineConfig, devices } from "@playwright/test";

// E2E tests prove the storefront is DOM-operable end to end (acceptance §11).
// They boot the production server on :3100 and drive it with only data-testid /
// accessible-name selectors — the same surface a ChatGPT-style agent would use.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run build && npm run start -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.DEBUG_BASE_URL;

export default defineConfig({
  testDir: "./tests/debug",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: externalBaseUrl ?? "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  webServer: externalBaseUrl ? [] : [
    {
      command: "python backend/app.py",
      url: "http://127.0.0.1:5174/api/maps/catalog",
      timeout: 30_000,
      reuseExistingServer: true,
    },
    {
      command: "npm run dev",
      url: "http://127.0.0.1:5173/debug",
      timeout: 30_000,
      reuseExistingServer: true,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});

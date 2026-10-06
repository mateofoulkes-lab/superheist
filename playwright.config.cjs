const { defineConfig } = require("@playwright/test");
const fs = require("node:fs");
const options = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean);
const executablePath = options.find((p) => fs.existsSync(p));
module.exports = defineConfig({
  testDir: "tests/ui",
  testMatch: "*.spec.cjs",
  workers: 1,
  timeout: 30000,
  use: {
    browserName: "chromium",
    headless: true,
    launchOptions: executablePath ? { executablePath } : {},
    baseURL: "http://127.0.0.1:4173",
  },
  webServer: {
    command: "node scripts/serve.cjs",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
  },
});

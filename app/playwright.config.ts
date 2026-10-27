import fs from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Nesta máquina o download de browsers do Playwright falha; usa o Chromium já instalado se existir.
const local = path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright", "chromium-1234", "chrome-win64", "chrome.exe");
const executablePath = process.env.PW_CHROMIUM ?? (fs.existsSync(local) ? local : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1, // o banco de demonstração é compartilhado entre os testes
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3211",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  // Os e2e rodam na base de DEMONSTRAÇÃO (.data/pglite-demo), num servidor próprio na porta 3211,
  // para nunca escrever na base real. Antes: npm run db:seed:demo
  webServer: {
    command: "npx next dev -p 3211",
    url: "http://localhost:3211/login",
    reuseExistingServer: true,
    timeout: 180_000,
    env: { RADAR_DB_DIR: ".data/pglite-demo" },
  },
});

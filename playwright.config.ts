import path from "node:path";
import { defineConfig, devices } from "playwright/test";

const remoteBaseUrl = process.env.ORHA_E2E_BASE_URL?.trim();
const localBaseUrl = process.env.GITHUB_ACTIONS
  ? "http://127.0.0.1:4173/social-orha/"
  : "http://127.0.0.1:4173/";
const baseURL = ensureTrailingSlash(remoteBaseUrl || localBaseUrl);
const usesLocalServer = !remoteBaseUrl;
const publicRetries = process.env.CI ? 2 : 0;
const stagingSupabaseUrl = process.env.ORHA_STAGING_SUPABASE_URL?.trim();
const stagingSupabasePublishableKey =
  process.env.ORHA_STAGING_SUPABASE_PUBLISHABLE_KEY?.trim();
const stagingBrowserEnvironment =
  stagingSupabaseUrl && stagingSupabasePublishableKey
    ? {
        VITE_SUPABASE_URL: stagingSupabaseUrl,
        VITE_SUPABASE_PUBLISHABLE_KEY: stagingSupabasePublishableKey,
      }
    : undefined;

const publicChromiumViewports = [
  { name: "320x568", width: 320, height: 568, mobile: true },
  { name: "375x667", width: 375, height: 667, mobile: true },
  { name: "390x844", width: 390, height: 844, mobile: true },
  { name: "393x852", width: 393, height: 852, mobile: true },
  { name: "430x932", width: 430, height: 932, mobile: true },
  { name: "440x932", width: 440, height: 932, mobile: true },
  { name: "tablet-768x1024", width: 768, height: 1024, mobile: true },
  { name: "tablet-1024x768", width: 1024, height: 768, mobile: true },
  { name: "1280x800", width: 1280, height: 800, mobile: false },
  { name: "1440x900", width: 1440, height: 900, mobile: false },
] as const;

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export default defineConfig({
  testDir: path.resolve("e2e"),
  outputDir: "test-results",
  globalTeardown: path.resolve("e2e/global-teardown.ts"),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [
        ["github"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ]
    : [
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ],
  use: {
    baseURL,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  webServer: usesLocalServer
    ? {
        command:
          "npm run build && npm run preview -- --host 127.0.0.1 --port 4173",
        cwd: process.cwd(),
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
        ...(stagingBrowserEnvironment
          ? { env: stagingBrowserEnvironment }
          : {}),
      }
    : undefined,
  projects: [
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        trace: "off",
        screenshot: "off",
        video: "off",
      },
    },
    ...publicChromiumViewports.map(({ name, width, height, mobile }) => ({
      name: `public-chromium-${name}`,
      testMatch: /public-.*\.spec\.ts/,
      retries: publicRetries,
      use: mobile
        ? {
            browserName: "chromium" as const,
            viewport: { width, height },
            deviceScaleFactor: 3,
            hasTouch: true,
            isMobile: true,
          }
        : {
            ...devices["Desktop Chrome"],
            viewport: { width, height },
          },
    })),
    {
      name: "public-webkit-390x844",
      testMatch: /public-.*\.spec\.ts/,
      retries: publicRetries,
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "public-pwa-chromium",
      testMatch: /pwa-.*\.spec\.ts/,
      retries: publicRetries,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        serviceWorkers: "allow",
      },
    },
    {
      name: "auth-lifecycle-chromium",
      testMatch: /auth-lifecycle\.spec\.ts/,
      retries: 0,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
        trace: "off",
        screenshot: "off",
        video: "off",
      },
    },
    {
      name: "authenticated-chromium",
      dependencies: ["auth-setup"],
      testMatch: /authenticated-.*\.spec\.ts|multiuser-.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        trace: "off",
        video: "off",
      },
    },
    {
      name: "staging-social-smoke-chromium",
      testMatch: /staging-social-browser-smoke\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        serviceWorkers: "block",
        trace: "retain-on-failure",
        video: "retain-on-failure",
      },
    },
  ],
});

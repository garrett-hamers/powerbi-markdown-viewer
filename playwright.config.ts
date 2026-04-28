import { defineConfig } from "@playwright/test";

export default defineConfig({
    testDir: "./e2e",
    testMatch: "**/*.playwright.spec.ts",
    timeout: 30000,
    use: {
        browserName: "chromium",
        headless: true,
    },
    reporter: [["list"]],
});

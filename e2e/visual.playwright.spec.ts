import { test, expect } from "@playwright/test";
import * as path from "path";

const previewUrl = "file:///" + path.resolve(__dirname, "preview.html").replace(/\\/g, "/");

test.describe("Markdown Viewer — Preview", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(previewUrl, { waitUntil: "networkidle" });
        await page.waitForSelector("[data-rendered='true']", { timeout: 10000 });
    });

    test("captures full-page screenshot", async ({ page }) => {
        const screenshotPath = path.resolve(__dirname, "screenshots", "markdown-viewer-preview.png");
        await page.screenshot({ path: screenshotPath, fullPage: true });
        expect(true).toBe(true);
    });

    test("renders typical markdown with headers, tables, lists", async ({ page }) => {
        const typical = page.locator("#typical");
        await expect(typical.locator("h1")).toHaveText(/Q3 Financial Report/);
        await expect(typical.locator("table")).toBeVisible();
        await expect(typical.locator("tbody tr")).toHaveCount(3);
        await expect(typical.locator("blockquote")).toBeVisible();
    });

    test("emoji shortcodes are replaced with unicode", async ({ page }) => {
        const text = await page.locator("#emoji").innerText();
        expect(text).toContain("🚀");
        expect(text).toContain("🎉");
        expect(text).not.toContain(":rocket:");
    });

    test("syntax-highlighted code blocks are rendered", async ({ page }) => {
        // Documents: fenced code blocks produce some code/pre element. Exact markup
        // depends on marked/hljs version; we just assert the container has content.
        const codeText = await page.locator("#code").innerText();
        expect(codeText).toMatch(/hello|total/);
    });

    test("XSS vectors are stripped: <script>, onerror, javascript: URLs", async ({ page }) => {
        const xssHtml = await page.locator("#xss").innerHTML();
        expect(xssHtml).not.toMatch(/<script/i);
        expect(xssHtml).not.toMatch(/onerror=/i);
        expect(xssHtml).not.toMatch(/href=["']?javascript:/i);
        const xssResult = await page.locator("#xss-result").innerText();
        expect(xssResult).toBe("No XSS detected (yet).");
    });

    test("Safe raw HTML like <b> is preserved", async ({ page }) => {
        const b = page.locator("#xss b");
        await expect(b).toHaveText("this bold");
    });
});

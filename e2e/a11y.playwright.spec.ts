/**
 * Accessibility tests for the Atlyn Markdown Viewer.
 *
 * Unlike the 6 chart visuals, the markdown viewer renders sanitized HTML
 * instead of SVG data points. A11y coverage here focuses on:
 *   1. axe-core scan (critical/serious must be zero)
 *   2. Semantic HTML — rendered markdown must produce h1/h2/p/ul/ol/code/pre/blockquote
 *   3. No role="presentation" should hide renderable content
 *   4. Tab traversal — links & focusable elements inside rendered content
 *
 * The visual declares supportsKeyboardFocus: true, so any focusable
 * element (links, code copy buttons if any) must carry appropriate roles.
 */
import { test, expect, Page } from "@playwright/test";
import * as path from "path";

const previewUrl = "file:///" + path.resolve(__dirname, "preview.html").replace(/\\/g, "/");

const CONTAINER_ID = "#typical";
const VISUAL_NAME = "markdown-viewer";
const AXE_CDN = "https://unpkg.com/axe-core@4.10.0/axe.min.js";

async function injectAxe(page: Page): Promise<boolean> {
    try {
        await page.addScriptTag({ url: AXE_CDN });
        return true;
    } catch (err) {
        console.warn(`[a11y] failed to load axe-core from CDN: ${(err as Error).message}`);
        return false;
    }
}

interface AxeResult {
    violations: Array<{ id: string; impact: string; description: string; nodes: unknown[] }>;
}

test.describe(`${VISUAL_NAME} — Accessibility`, () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(previewUrl, { waitUntil: "networkidle" });
        // Markdown viewer renders immediately after mount — wait for a heading or paragraph
        await page.waitForSelector(`${CONTAINER_ID} h1, ${CONTAINER_ID} h2, ${CONTAINER_ID} p`, { timeout: 10000 });
    });

    /* 1. axe scan ─────────────────────────────── */
    test("axe: no critical or serious violations on typical markdown", async ({ page }) => {
        const ok = await injectAxe(page);
        test.skip(!ok, "axe-core CDN unreachable — skipping scan");

        const results = (await page.evaluate(async (selector) => {
            // @ts-ignore
            const axe = (window as any).axe;
            const el = document.querySelector(selector);
            return await axe.run(el || document, {
                runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
            });
        }, CONTAINER_ID)) as AxeResult;

        const byImpact: Record<string, number> = { critical: 0, serious: 0, moderate: 0, minor: 0, null: 0 };
        for (const v of results.violations) {
            const k = v.impact || "null";
            byImpact[k] = (byImpact[k] || 0) + 1;
        }
        console.log(`[a11y:${VISUAL_NAME}] axe violations by impact:`, JSON.stringify(byImpact));
        for (const v of results.violations) {
            console.log(`[a11y:${VISUAL_NAME}]   [${v.impact}] ${v.id} — ${v.description} (${v.nodes.length} nodes)`);
        }

        expect(byImpact.critical, "critical axe violations present (P0)").toBe(0);
        expect(byImpact.serious, "serious axe violations present (P0)").toBe(0);
    });

    /* 2. Semantic HTML elements ─────────────────── */
    test("rendered markdown produces semantic HTML elements", async ({ page }) => {
        const counts = await page.evaluate((sel) => {
            const root = document.querySelector(sel);
            if (!root) return null;
            return {
                h1: root.querySelectorAll("h1").length,
                h2: root.querySelectorAll("h2").length,
                h3: root.querySelectorAll("h3").length,
                p: root.querySelectorAll("p").length,
                ul: root.querySelectorAll("ul").length,
                ol: root.querySelectorAll("ol").length,
                li: root.querySelectorAll("li").length,
                code: root.querySelectorAll("code").length,
                pre: root.querySelectorAll("pre").length,
                blockquote: root.querySelectorAll("blockquote").length,
                a: root.querySelectorAll("a").length,
                table: root.querySelectorAll("table").length,
            };
        }, CONTAINER_ID);
        console.log(`[a11y:${VISUAL_NAME}] semantic element counts:`, JSON.stringify(counts));

        expect(counts, `container ${CONTAINER_ID} not found`).not.toBeNull();
        const c = counts!;
        // Typical fixture should produce at least one heading, at least one paragraph,
        // and a list. Code/blockquote are expected for the "typical" preview fixture.
        expect(c.h1 + c.h2 + c.h3, "no heading elements (h1/h2/h3) rendered").toBeGreaterThan(0);
        expect(c.p, "no paragraph elements rendered").toBeGreaterThan(0);
        expect(c.ul + c.ol, "no list elements (ul/ol) rendered").toBeGreaterThan(0);
        expect(c.code, "no <code> elements rendered").toBeGreaterThan(0);
        expect(c.pre, "no <pre> block rendered").toBeGreaterThan(0);
        expect(c.blockquote, "no <blockquote> rendered").toBeGreaterThan(0);
    });

    /* 3. No role=presentation hiding content ───── */
    test("no role='presentation' on content-bearing elements", async ({ page }) => {
        const hidden = await page.evaluate((sel) => {
            const root = document.querySelector(sel);
            if (!root) return [];
            const offenders: Array<{ tag: string; text: string }> = [];
            root.querySelectorAll("[role='presentation'], [role='none']").forEach((el) => {
                const tag = (el as HTMLElement).tagName.toLowerCase();
                // h*, p, li, blockquote with role=presentation would hide semantics from AT
                if (/^(h[1-6]|p|li|ul|ol|blockquote|table|tr|td|th|code|pre)$/.test(tag)) {
                    offenders.push({ tag, text: ((el as HTMLElement).textContent || "").slice(0, 60) });
                }
            });
            return offenders;
        }, CONTAINER_ID);
        console.log(`[a11y:${VISUAL_NAME}] role=presentation offenders:`, JSON.stringify(hidden));
        expect(hidden.length, `role='presentation' hides semantic content: ${JSON.stringify(hidden)}`).toBe(0);
    });

    /* 4. Tab order — focusable elements are reachable ─ */
    test("keyboard: focusable elements (links) are reachable via Tab", async ({ page }) => {
        const linkCount = await page.locator(`${CONTAINER_ID} a`).count();
        console.log(`[a11y:${VISUAL_NAME}] links in typical fixture: ${linkCount}`);

        if (linkCount === 0) {
            test.skip(true, "No links in typical fixture — skipping tab test");
            return;
        }

        const MAX_TABS = 50;
        let reachedLink = false;
        for (let i = 0; i < MAX_TABS; i++) {
            await page.keyboard.press("Tab");
            const hit = await page.evaluate((sel) => {
                const active = document.activeElement as HTMLElement | null;
                if (!active) return false;
                return active.matches(`${sel} a, ${sel} a *`) || !!active.closest(`${sel} a`);
            }, CONTAINER_ID);
            if (hit) { reachedLink = true; break; }
        }
        expect(reachedLink, "link inside rendered markdown not reachable via Tab").toBe(true);
    });

    /* 5. Links have accessible name ───────────── */
    test("aria: links have accessible name", async ({ page }) => {
        const links = page.locator(`${CONTAINER_ID} a`);
        const count = await links.count();
        if (count === 0) {
            test.skip(true, "No links in typical fixture");
            return;
        }
        const sampleSize = Math.min(3, count);
        const reports: Array<{ href: string | null; text: string; ariaLabel: string | null }> = [];
        for (let i = 0; i < sampleSize; i++) {
            const link = links.nth(i);
            reports.push({
                href: await link.getAttribute("href"),
                text: ((await link.textContent()) || "").trim(),
                ariaLabel: await link.getAttribute("aria-label"),
            });
        }
        console.log(`[a11y:${VISUAL_NAME}] link samples:`, JSON.stringify(reports));
        for (const r of reports) {
            const hasName = !!(r.text || r.ariaLabel);
            expect(hasName, `link href=${r.href} has no accessible name`).toBe(true);
        }
    });
});

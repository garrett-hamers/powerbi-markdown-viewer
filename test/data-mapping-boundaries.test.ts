/**
 * Boundary-condition tests for Markdown Viewer's DataView extraction.
 *
 * The markdown-viewer visual has no separate dataParser module; DataView
 * ingestion happens inline in visual.ts:
 *   const markdownContent = (dv.single?.value != null) ? String(dv.single.value) : "";
 *   if (!markdownContent || markdownContent.trim() === "") showLandingPage();
 *
 * We replicate that extraction contract here as `extractMarkdown(dv)` and
 * assert the same boundary behavior the visual relies on.
 */
import { describe, it, expect } from "vitest";

interface SingleDataView {
    single?: { value?: unknown } | null;
}

/**
 * Reproduction of the inline DataView → markdown extraction logic in visual.ts.
 * Returns the extracted string, or null if the visual would fall back to
 * the landing-page / no-data state.
 */
function extractMarkdown(dv: SingleDataView | null | undefined): string | null {
    if (!dv) return null;
    const v = dv.single?.value;
    if (v === undefined || v === null) return null;
    const content = String(v);
    if (!content || content.trim() === "") return null;
    return content;
}

describe("markdown-viewer DataView extraction — boundary conditions", () => {
    it("empty string value → no-data sentinel (null)", () => {
        expect(extractMarkdown({ single: { value: "" } })).toBeNull();
    });

    it("whitespace-only string → no-data sentinel (null)", () => {
        expect(extractMarkdown({ single: { value: "   \n\t  " } })).toBeNull();
    });

    it("null value → no-data sentinel (null), does not throw", () => {
        expect(() => extractMarkdown({ single: { value: null } })).not.toThrow();
        expect(extractMarkdown({ single: { value: null } })).toBeNull();
    });

    it("undefined .single → no-data sentinel (null)", () => {
        expect(extractMarkdown({})).toBeNull();
        expect(extractMarkdown({ single: undefined })).toBeNull();
    });

    it("null DataView → no-data sentinel (null)", () => {
        expect(() => extractMarkdown(null)).not.toThrow();
        expect(extractMarkdown(null)).toBeNull();
        expect(extractMarkdown(undefined)).toBeNull();
    });

    it("numeric value → stringified (coerced via String())", () => {
        expect(extractMarkdown({ single: { value: 42 } })).toBe("42");
    });

    it("boolean value → stringified", () => {
        expect(extractMarkdown({ single: { value: true } })).toBe("true");
    });

    it("object value → stringified (no throw)", () => {
        expect(() => extractMarkdown({ single: { value: { a: 1 } } })).not.toThrow();
        expect(typeof extractMarkdown({ single: { value: { a: 1 } } })).toBe("string");
    });

    it("massive string (>1MB) handled without throw, returned intact", () => {
        const oneMB = "a".repeat(1024 * 1024 + 500); // ~1.05 MB
        const start = Date.now();
        const result = extractMarkdown({ single: { value: oneMB } });
        const elapsed = Date.now() - start;
        expect(result).not.toBeNull();
        expect(result!.length).toBe(oneMB.length);
        expect(elapsed).toBeLessThan(1000);
    });

    it("unicode — zero-width joiner sequences preserved", () => {
        // family emoji: man + ZWJ + woman + ZWJ + boy
        const family = "\u{1F468}\u200D\u{1F469}\u200D\u{1F466}";
        const result = extractMarkdown({ single: { value: `Hello ${family}` } });
        expect(result).toBe(`Hello ${family}`);
    });

    it("unicode — RTL control marks preserved", () => {
        // mix of RLM, LRM, Arabic text
        const rtl = "hello\u200Fمرحبا\u200Eworld";
        const result = extractMarkdown({ single: { value: rtl } });
        expect(result).toBe(rtl);
    });

    it("unicode — astral / surrogate-pair characters preserved", () => {
        // 🚀 (U+1F680) + 𝄞 (U+1D11E) + 😀 (U+1F600)
        const astral = "🚀𝄞😀 mixed with ascii";
        const result = extractMarkdown({ single: { value: astral } });
        expect(result).toBe(astral);
        // String length should count UTF-16 code units (surrogate pairs = 2 each)
        expect(result!.length).toBe(astral.length);
    });

    it("unicode — lone surrogate does not throw on String() coercion", () => {
        // Lone high surrogate (unpaired) — technically invalid but should not throw.
        const broken = "\uD83D_broken";
        expect(() => extractMarkdown({ single: { value: broken } })).not.toThrow();
        expect(extractMarkdown({ single: { value: broken } })).toBe(broken);
    });

    it("loads large.json fixture (single.value) without issue", async () => {
        const fs = await import("node:fs");
        const path = await import("node:path");
        const fixturePath = path.resolve(__dirname, "../e2e/fixtures/large.json");
        const dv = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
        expect(() => extractMarkdown(dv)).not.toThrow();
        const result = extractMarkdown(dv);
        expect(result).not.toBeNull();
        expect(typeof result).toBe("string");
    });
});

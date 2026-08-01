import { describe, expect, it } from "vitest";

import {
    createDocumentModel,
    createStructuredDocumentModel,
    DOCUMENT_LIMITS,
    findSearchMatches
} from "../src/documentModel";

const emojiMap = { ":rocket:": "🚀" };

describe("semantic document model", () => {
    it("creates deterministic heading IDs, an outline, and a logical search index", () => {
        const model = createDocumentModel([
            "# Release notes",
            "",
            "## Changes",
            "",
            "Searchable paragraph.",
            "",
            "## Changes",
            "",
            "```text",
            "Searchable code",
            "```"
        ].join("\n"), emojiMap);

        expect(model.outline.map((entry) => entry.id)).toEqual([
            "release-notes",
            "changes",
            "changes-2"
        ]);
        expect(model.outline.map((entry) => entry.level)).toEqual([1, 2, 2]);
        expect(findSearchMatches(model, "searchable")).toHaveLength(2);
        expect(model.searchIndex.some((entry) => entry.text.includes("Searchable code"))).toBe(true);
    });

    it("exposes policy diagnostics without copying hostile payloads", () => {
        const hostileUrl = "https://secret.example/private-token";
        const model = createDocumentModel([
            "<script>alert('secret')</script>",
            `<img src="${hostileUrl}">`,
            `[Unsafe](javascript:alert('secret'))`,
            "> [!WARNING] Review this content"
        ].join("\n\n"), emojiMap);

        expect(model.completeness).toBe("partial");
        expect(model.diagnostics.map((diagnostic) => diagnostic.category)).toEqual(
            expect.arrayContaining(["unsupported-tag", "external-resource", "unsafe-link"])
        );
        expect(model.diagnostics.every((diagnostic) =>
            !diagnostic.message.includes(hostileUrl)
            && !diagnostic.message.includes("secret")
        )).toBe(true);
        expect(model.blocks.some((block) => block.type === "status")).toBe(true);
    });

    it("returns a bounded partial model for oversized source", () => {
        const model = createDocumentModel(
            "x".repeat(DOCUMENT_LIMITS.maxSourceCharacters + 1),
            emojiMap
        );

        expect(model.completeness).toBe("partial");
        expect(model.blocks).toHaveLength(0);
        expect(model.diagnostics[0].category).toBe("source-size-limit");
    });

    it("bounds raw HTML and unknown code blocks before highlighting", () => {
        const oversized = createDocumentModel(
            `<pre><code>${"x".repeat(DOCUMENT_LIMITS.maxCodeCharacters + 1)}</code></pre>`,
            emojiMap
        );
        expect(oversized.completeness).toBe("partial");
        expect(oversized.blocks).toHaveLength(0);
        expect(oversized.diagnostics.some((item) => item.category === "code-size-limit"))
            .toBe(true);

        const unknown = createDocumentModel(
            `\`\`\`unknown-language\n${"x".repeat(DOCUMENT_LIMITS.maxAutoDetectCharacters + 1)}\n\`\`\``,
            emojiMap
        );
        expect(unknown.completeness).toBe("partial");
        expect(unknown.blocks).toHaveLength(0);
        expect(unknown.diagnostics.some((item) => item.category === "auto-detect-limit"))
            .toBe(true);
    });

    it("bounds the number of code blocks without silently truncating", () => {
        const source = Array.from(
            { length: DOCUMENT_LIMITS.maxCodeBlocks + 1 },
            () => "<pre><code>x</code></pre>"
        ).join("\n");
        const model = createDocumentModel(source, emojiMap);

        expect(model.completeness).toBe("partial");
        expect(model.diagnostics.some((item) => item.category === "code-block-limit"))
            .toBe(true);
    });

    it("decodes safe text and HTTPS URL entities without activating markup", () => {
        const model = createDocumentModel(
            "Copyright &copy; &#x1F680; &amp;\n\n[Query](https://example.com/?a=1&amp;b=2)",
            emojiMap
        );
        const paragraph = model.blocks.find((block) => block.type === "paragraph");
        const link = model.blocks
            .flatMap((block) => block.type === "paragraph" ? block.children : [])
            .find((node) => node.type === "link");

        expect(paragraph?.text).toContain("© 🚀 &");
        expect(link).toMatchObject({
            type: "link",
            safe: true,
            href: "https://example.com/?a=1&b=2"
        });
    });

    it("preserves soft breaks, boolean disclosure state, and explicit aliases", () => {
        const model = createDocumentModel(
            "line one\nline two\n\n<details open><summary>More</summary><p>Body</p></details>\n\n"
            + `\`\`\`js\n${"x".repeat(DOCUMENT_LIMITS.maxAutoDetectCharacters + 1)}\n\`\`\``,
            emojiMap
        );
        const paragraph = model.blocks.find((block) => block.type === "paragraph");
        const disclosure = model.blocks.find((block) => block.type === "disclosure");

        expect(paragraph?.children.some((node) => node.type === "break")).toBe(true);
        expect(disclosure?.type).toBe("disclosure");
        expect(disclosure && disclosure.type === "disclosure" ? disclosure.open : false).toBe(true);
        expect(model.diagnostics.some((item) => item.category === "auto-detect-limit")).toBe(false);
    });

    it("preserves Markdown table alignment through the safe model", () => {
        const model = createDocumentModel(
            "| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |",
            emojiMap
        );
        const table = model.blocks.find((block) => block.type === "table");

        expect(table?.type).toBe("table");
        expect(table && table.type === "table" ? table.alignments : []).toEqual([
            "left", "center", "right"
        ]);
    });

    it("reports bounded structured rows and preserves explicit status text", () => {
        const rows = Array.from({ length: DOCUMENT_LIMITS.maxLiveStructuredRows + 1 }, (_, index) => ({
            index,
            sectionKey: `section-${index}`,
            title: `Section ${index}`,
            body: `Body ${index}`,
            kind: "paragraph" as const,
            status: index === 0 ? "warning" as const : "unknown" as const,
            order: index,
            selectionKey: `selection-${index}`
        }));
        const model = createStructuredDocumentModel(rows, emojiMap, rows.length);

        expect(model.source.loadedRows).toBe(DOCUMENT_LIMITS.maxLiveStructuredRows);
        expect(model.source.totalRows).toBe(rows.length);
        expect(model.completeness).toBe("partial");
        expect(model.diagnostics.some((diagnostic) => diagnostic.category === "row-limit")).toBe(true);
        expect(model.blocks.some((block) => block.type === "status")).toBe(true);
    });

    it("preserves row provenance across every generated structured block", () => {
        const model = createStructuredDocumentModel([{
            index: 7,
            sectionKey: "section-7",
            title: "Section 7",
            body: "Body text\n\n> quote",
            kind: "paragraph",
            status: "warning",
            value: "42",
            link: "https://example.com",
            selectionKey: "selection-7"
        }], emojiMap, 1);

        expect(model.blocks.length).toBeGreaterThan(2);
        expect(model.blocks.every((block) =>
            block.sourceRowIndex === 7 && block.selectionKey === "selection-7"
        )).toBe(true);
        const quote = model.blocks.find((block) => block.type === "quote");
        expect(quote?.type).toBe("quote");
        expect(quote && quote.type === "quote"
            ? quote.children.every((child) =>
                child.sourceRowIndex === 7 && child.selectionKey === "selection-7"
            )
            : false).toBe(true);
    });

    it("bounds nested aggregate blocks and excludes omitted headings from the outline", () => {
        const body = Array.from(
            { length: 1499 },
            (_, index) => `### Nested heading ${index}\n\nText ${index}`
        ).join("\n\n");
        const model = createStructuredDocumentModel([
            {
                index: 0,
                sectionKey: "first",
                title: "First",
                body,
                kind: "paragraph",
                status: "unknown",
                order: 0,
                selectionKey: "first"
            },
            {
                index: 1,
                sectionKey: "second",
                title: "Second",
                body,
                kind: "paragraph",
                status: "unknown",
                order: 1,
                selectionKey: "second"
            }
        ], emojiMap, 2);
        const headingCount = model.blocks.reduce(
            (count, block) => count + (block.type === "heading" ? 1 : 0),
            0
        );

        expect(model.stats.blockCount).toBeLessThanOrEqual(DOCUMENT_LIMITS.maxBlocks);
        expect(model.outline).toHaveLength(headingCount);
        expect(new Set(model.outline.map((entry) => entry.id)).size)
            .toBe(model.outline.length);
    });
});

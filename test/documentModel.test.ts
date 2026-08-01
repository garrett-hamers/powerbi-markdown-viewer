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
});

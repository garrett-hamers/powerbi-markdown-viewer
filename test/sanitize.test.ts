import { describe, it, expect } from "vitest";
import DOMPurify from "dompurify";
import { marked } from "marked";

function renderSafe(md: string): string {
    const raw = marked.parse(md) as string;
    return DOMPurify.sanitize(raw, { ADD_ATTR: ["target", "rel"] });
}

describe("markdown sanitization (DOMPurify)", () => {
    it("strips <script> tags injected directly", () => {
        const html = renderSafe("Hello\n\n<script>alert('XSS')</script>");
        expect(html).not.toContain("<script");
        expect(html).not.toContain("alert");
    });

    it("strips javascript: URLs from links", () => {
        const html = renderSafe("[click](javascript:alert(1))");
        expect(html).not.toMatch(/href=["']javascript:/i);
    });

    it("strips onerror handlers from <img>", () => {
        const html = renderSafe('<img src="x" onerror="alert(1)">');
        expect(html).not.toMatch(/onerror=/i);
        expect(html).not.toContain("alert");
    });

    it("strips onclick handlers from raw HTML", () => {
        const html = renderSafe('<a href="#" onclick="alert(1)">x</a>');
        expect(html).not.toMatch(/onclick=/i);
    });

    it("strips <iframe> tags", () => {
        const html = renderSafe('<iframe src="https://evil.example"></iframe>');
        expect(html).not.toContain("<iframe");
    });

    it("preserves safe markdown output (headers, lists, emphasis, code)", () => {
        const html = renderSafe("# Heading\n\n- item 1\n- **bold**\n\n`code`");
        expect(html).toContain("<h1");
        expect(html).toContain("<ul");
        expect(html).toContain("<strong>bold</strong>");
        expect(html).toContain("<code>code</code>");
    });

    it("preserves http and https links", () => {
        const html = renderSafe("[ok](https://example.com)");
        expect(html).toMatch(/href=["']https:\/\/example\.com/);
    });

    it("preserves tables", () => {
        const html = renderSafe("| a | b |\n| --- | --- |\n| 1 | 2 |");
        expect(html).toContain("<table");
        expect(html).toContain("<td>1</td>");
    });
});

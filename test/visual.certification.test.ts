import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import powerbi from "powerbi-visuals-api";
import hljs from "highlight.js";

import { Visual } from "../src/visual";
import { createMockHost, MockHostOptions } from "./helpers/mockHost";

import DataView = powerbi.DataView;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

function createDataView(
    markdown: powerbi.PrimitiveValue,
    objects?: powerbi.DataViewObjects
): DataView {
    return {
        metadata: {
            objects,
            columns: [{
                displayName: "Markdown Content",
                queryName: "Measures.Markdown",
                roles: { markdownContent: true },
                type: { text: true }
            }]
        },
        single: { value: markdown }
    } as DataView;
}

function createUpdateOptions(
    markdown?: powerbi.PrimitiveValue,
    objects?: powerbi.DataViewObjects
): VisualUpdateOptions {
    return {
        dataViews: markdown === undefined ? [] : [createDataView(markdown, objects)],
        viewport: { width: 640, height: 480 },
        type: 2
    } as VisualUpdateOptions;
}

function createVisual(options: MockHostOptions = {}) {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const harness = createMockHost(options);
    const visual = new Visual({ element, host: harness.host } as VisualConstructorOptions);

    return { element, harness, visual };
}

function createHighlightResult(value: string): ReturnType<typeof hljs.highlight> {
    return { value } as ReturnType<typeof hljs.highlight>;
}

describe("certification behavior", () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("signals rendering completion for data and empty-data updates", () => {
        const { element, harness, visual } = createVisual();

        visual.update(createUpdateOptions("# Ready"));
        visual.update(createUpdateOptions());

        expect(harness.eventCalls).toEqual([
            "started", "finished",
            "started", "finished"
        ]);
        expect(element.querySelector(".landing-page h2")?.textContent)
            .toBe("Atlyn Markdown Viewer");
    });

    it("clears the prior measure when the host withholds an invalid multi-measure view", () => {
        const { element, harness, visual } = createVisual();

        visual.update(createUpdateOptions("# One valid measure"));
        visual.update(createUpdateOptions());

        expect(element.textContent).not.toContain("One valid measure");
        expect(element.querySelector(".landing-page h2")?.textContent)
            .toBe("Atlyn Markdown Viewer");
        expect(harness.eventCalls).toEqual([
            "started", "finished",
            "started", "finished"
        ]);
        expect(harness.failureReasons).toEqual([]);
    });

    it("signals rendering failure exactly once and renders a safe error message", () => {
        const { element, harness, visual } = createVisual({ failSelectionBuilder: true });

        visual.update(createUpdateOptions("# Fails after parsing"));

        expect(harness.eventCalls).toEqual(["started", "failed"]);
        expect(harness.failureReasons).toEqual(["selection builder failed"]);
        expect(element.querySelector(".error")?.textContent)
            .toBe("Error: selection builder failed");
        expect(element.querySelector(".error")?.getAttribute("role")).toBe("alert");
    });

    it("applies high-contrast formatting before signaling a first-render failure", () => {
        let container: HTMLElement;
        let formattingAtFailure: Record<string, string> | undefined;
        const created = createVisual({
            failSelectionBuilder: true,
            highContrast: true,
            onRenderingFailed: () => {
                formattingAtFailure = {
                    backgroundColor: container.style.backgroundColor,
                    color: container.style.color,
                    fontSize: container.style.fontSize,
                    padding: container.style.padding
                };
            }
        });
        container = created.element.querySelector(".markdown-container") as HTMLElement;

        created.visual.update(createUpdateOptions("# Fails on first render"));

        expect(created.harness.eventCalls).toEqual(["started", "failed"]);
        expect(formattingAtFailure).toEqual({
            backgroundColor: "rgb(0, 0, 0)",
            color: "rgb(255, 255, 0)",
            fontSize: "14px",
            padding: "20px"
        });
        expect(container.classList.contains("high-contrast")).toBe(true);
        expect(container.querySelector(".error")?.getAttribute("role")).toBe("alert");
    });

    it("clears stale formatting before signaling a high-contrast failure", () => {
        let container: HTMLElement;
        let formattingAtFailure: Record<string, string> | undefined;
        const created = createVisual({
            failSelectionBuilderOnCall: 2,
            highContrast: true,
            onRenderingFailed: () => {
                formattingAtFailure = {
                    backgroundColor: container.style.backgroundColor,
                    borderStyle: container.style.borderStyle,
                    color: container.style.color,
                    fontSize: container.style.fontSize,
                    padding: container.style.padding
                };
            }
        });
        container = created.element.querySelector(".markdown-container") as HTMLElement;
        const staleObjects = {
            markdown: {
                fontFamily: "Arial",
                fontSize: 30,
                padding: 36,
                showBorder: true
            }
        } as powerbi.DataViewObjects;

        created.visual.update(createUpdateOptions("# Styled success", staleObjects));
        expect(container.style.fontSize).toBe("30px");
        expect(container.style.padding).toBe("36px");
        expect(container.style.borderWidth).toBe("2px");

        created.visual.update(createUpdateOptions("# Default failure"));

        expect(created.harness.eventCalls).toEqual([
            "started", "finished",
            "started", "failed"
        ]);
        expect(formattingAtFailure).toEqual({
            backgroundColor: "rgb(0, 0, 0)",
            borderStyle: "none",
            color: "rgb(255, 255, 0)",
            fontSize: "14px",
            padding: "20px"
        });
        expect(container.style.fontFamily).toBe("\"Segoe UI\", sans-serif");
        expect(container.querySelector(".error")?.textContent)
            .toBe("Error: selection builder failed");
    });

    it("builds a formatting model after an empty-data update", () => {
        const { harness, visual } = createVisual();

        visual.update(createUpdateOptions());
        const formattingModel = visual.getFormattingModel();

        expect(harness.eventCalls).toEqual(["started", "finished"]);
        expect(formattingModel.cards).toHaveLength(1);
    });

    it("sanitizes executable markup and automatic external resource loads", () => {
        const { element, visual } = createVisual();
        const markdown = [
            "# Safe heading",
            "<script>alert('xss')</script>",
            "<img src=\"https://evil.example/track.png\" onerror=\"alert(1)\">",
            "<form action=\"https://evil.example\"><input name=\"secret\"></form>",
            "<table background=\"https://evil.example/table.png\"><tr><td background=\"https://evil.example/cell.png\">Cell</td></tr></table>",
            "[Safe link](https://example.com/docs)",
            "[Unsafe link](javascript:alert(1))"
        ].join("\n\n");

        visual.update(createUpdateOptions(markdown));

        expect(element.querySelector(".error"), element.textContent ?? "").toBeNull();
        expect(element.querySelector(".markdown-container")?.textContent).toContain("Safe heading");
        expect(element.querySelector("h1")?.textContent).toBe("Safe heading");
        expect(element.querySelector("table td")?.textContent).toBe("Cell");
        expect(element.querySelector("script, img, form, input, iframe, object, embed")).toBeNull();
        expect(element.querySelector(
            "[background], [src], [srcset], [poster], [dynsrc], [lowsrc], [ping], [onerror], [onclick]"
        )).toBeNull();

        const links = Array.from(element.querySelectorAll("a"));
        const safeLink = links.find((link) => link.textContent === "Safe link");
        const unsafeLink = element.querySelector(".unsupported-link");

        expect(safeLink?.hasAttribute("href")).toBe(false);
        expect(safeLink?.getAttribute("data-safe-href")).toBe("https://example.com/docs");
        expect(safeLink?.getAttribute("role")).toBe("link");
        expect(safeLink?.getAttribute("tabindex")).toBe("0");
        expect(safeLink?.hasAttribute("target")).toBe(false);
        expect(safeLink?.hasAttribute("rel")).toBe(false);
        expect(safeLink?.hasAttribute("referrerpolicy")).toBe(false);
        expect(unsafeLink?.textContent).toBe("Unsafe link (unsupported link)");
        expect(unsafeLink?.getAttribute("title"))
            .toBe("Only absolute HTTPS links can be opened.");
    });

    it("routes safe link activation through the Power BI host without native navigation", () => {
        const { element, harness, visual } = createVisual();
        visual.update(createUpdateOptions(
            "[Safe link](https://example.com/docs) [Unsafe link](http://example.com/docs)"
        ));

        const links = Array.from(element.querySelectorAll("a"));
        const safeLink = links.find((link) => link.textContent === "Safe link");
        const unsafeLink = element.querySelector(".unsupported-link");
        expect(safeLink).toBeDefined();
        expect(unsafeLink).toBeDefined();

        const primaryClick = new MouseEvent("click", {
            bubbles: true,
            button: 0,
            cancelable: true
        });
        const middleClick = new MouseEvent("auxclick", {
            bubbles: true,
            button: 1,
            cancelable: true
        });
        const enterKey = new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: "Enter"
        });
        const spaceKey = new KeyboardEvent("keydown", {
            bubbles: true,
            cancelable: true,
            key: " "
        });

        safeLink!.dispatchEvent(primaryClick);
        safeLink.dispatchEvent(middleClick);
        safeLink.dispatchEvent(enterKey);
        safeLink.dispatchEvent(spaceKey);

        expect(primaryClick.defaultPrevented).toBe(true);
        expect(middleClick.defaultPrevented).toBe(true);
        expect(enterKey.defaultPrevented).toBe(true);
        expect(spaceKey.defaultPrevented).toBe(true);
        expect(safeLink.hasAttribute("href")).toBe(false);
        expect(harness.launchedUrls).toEqual([
            "https://example.com/docs",
            "https://example.com/docs",
            "https://example.com/docs",
            "https://example.com/docs"
        ]);

        unsafeLink!.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
        unsafeLink.dispatchEvent(new MouseEvent("auxclick", { bubbles: true, button: 1 }));
        unsafeLink.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
        unsafeLink.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: " " }));

        expect(unsafeLink.hasAttribute("href")).toBe(false);
        expect(unsafeLink.hasAttribute("data-safe-href")).toBe(false);
        expect(harness.launchedUrls).toHaveLength(4);
    });

    it("preserves emoji shortcodes in code and link destinations", () => {
        const { element, visual } = createVisual();
        visual.update(createUpdateOptions([
            "Text :rocket:",
            "",
            "Inline `:rocket:`",
            "",
            "```text",
            ":rocket:",
            "```",
            "",
            "[destination :rocket:](https://example.com/:rocket:)"
        ].join("\n")));

        expect(element.querySelector("p")?.textContent).toBe("Text 🚀");
        expect(element.querySelector("p code")?.textContent).toBe(":rocket:");
        expect(element.querySelector("pre code")?.textContent).toBe(":rocket:\n");

        const link = element.querySelector("a[data-safe-href]");
        expect(link?.textContent).toBe("destination 🚀");
        expect(link?.getAttribute("data-safe-href"))
            .toBe("https://example.com/:rocket:");
    });

    it("renders hostile URLs and active markup as inert explanatory text", () => {
        const { element, visual } = createVisual();
        visual.update(createUpdateOptions([
            "<svg onload=\"alert(1)\"><script>alert(1)</script></svg>",
            "<math href=\"javascript:alert(1)\">math</math>",
            "<p onclick=\"alert(1)\" style=\"background:url(https://evil.example/x)\">safe text</p>",
            "[JavaScript](javascript:alert(1))",
            "[Data](data:text/html,<script>alert(1)</script>)",
            "[Relative](/internal)",
            "[Malformed](https://[invalid)"
        ].join("\n\n")));

        const container = element.querySelector(".markdown-container");
        expect(container?.querySelector(
            "svg, math, script, [onload], [onclick], [style], [href]"
        )).toBeNull();
        expect(element.textContent).toContain("safe text");
        expect(element.querySelectorAll(".unsupported-link").length).toBeGreaterThanOrEqual(3);
        expect(element.querySelector(".error")).toBeNull();
    });

    it("renders malformed markdown without executing or failing", () => {
        const { element, harness, visual } = createVisual();
        visual.update(createUpdateOptions([
            "# Recoverable document",
            "",
            "[broken link](",
            "",
            "```text",
            "unclosed :rocket:"
        ].join("\n")));

        expect(element.querySelector("h1")?.textContent).toBe("Recoverable document");
        expect(element.querySelector("pre code")?.textContent)
            .toContain("unclosed :rocket:");
        expect(element.querySelector(".error")).toBeNull();
        expect(harness.eventCalls).toEqual(["started", "finished"]);
    });

    it("keeps malformed numeric entities inert without throwing", () => {
        const { element, harness, visual } = createVisual();

        visual.update(createUpdateOptions("Text &#99999999;"));

        expect(element.querySelector(".error")).toBeNull();
        expect(element.textContent).toContain("Text");
        expect(harness.failureReasons).toEqual([]);
    });

    it("decodes named, numeric, and URL entities exactly once", () => {
        const { element, visual } = createVisual();

        visual.update(createUpdateOptions([
            "Copyright &copy; &#x1F680; &amp; &#x110000;",
            "",
            "[Query](https://example.com/?a=1&amp;b=2)"
        ].join("\n")));

        expect(element.querySelector("p")?.textContent)
            .toBe("Copyright © 🚀 & \uFFFD");
        expect(element.querySelector("a[data-safe-href]")?.getAttribute("data-safe-href"))
            .toBe("https://example.com/?a=1&b=2");
    });

    it("reuses unchanged rendered content and preserves reading state", () => {
        const explicitHighlight = vi.spyOn(hljs, "highlight");
        const { element, visual } = createVisual();
        const markdown = [
            "[Documentation](https://example.com/docs)",
            "",
            "```javascript",
            "const answer = 42;",
            "```"
        ].join("\n");

        visual.update(createUpdateOptions(markdown));
        const container = element.querySelector(".markdown-container") as HTMLElement;
        const firstLink = element.querySelector("a[data-safe-href]") as HTMLElement;
        container.scrollTop = 73;
        firstLink.focus();

        visual.update(createUpdateOptions(markdown, {
            markdown: { fontSize: 18 }
        } as powerbi.DataViewObjects));

        expect(element.querySelector("a[data-safe-href]")).toBe(firstLink);
        expect(document.activeElement).toBe(firstLink);
        expect(container.scrollTop).toBe(73);
        expect(container.style.fontSize).toBe("18px");
        expect(explicitHighlight).toHaveBeenCalledOnce();
    });

    it("skips document work and selection allocation for resize-only updates", () => {
        const explicitHighlight = vi.spyOn(hljs, "highlight");
        const { element, harness, visual } = createVisual();
        visual.update(createUpdateOptions("```javascript\nconst answer = 42;\n```"));
        const firstDocument = element.querySelector(".markdown-container")?.firstChild;
        const initialSelectionCount = harness.measureIds.length;

        visual.update({
            dataViews: [],
            viewport: { width: 320, height: 240 },
            type: 4
        } as VisualUpdateOptions);

        expect(element.querySelector(".markdown-container")?.firstChild).toBe(firstDocument);
        expect(harness.measureIds).toHaveLength(initialSelectionCount);
        expect(explicitHighlight).toHaveBeenCalledOnce();
    });

    it("rejects oversized documents before allocating selection IDs or highlighting", () => {
        const explicitHighlight = vi.spyOn(hljs, "highlight");
        const { element, harness, visual } = createVisual();

        visual.update(createUpdateOptions("x".repeat(250_001)));

        expect(element.querySelector(".error")?.textContent)
            .toContain("250,000 character limit");
        expect(harness.measureIds).toHaveLength(0);
        expect(explicitHighlight).not.toHaveBeenCalled();
    });

    it("bounds automatic detection for long unlabelled code blocks", () => {
        const { element, harness, visual } = createVisual();

        visual.update(createUpdateOptions(`\`\`\`\n${"x".repeat(8_001)}\n\`\`\``));

        expect(element.querySelector(".error")?.textContent)
            .toContain("add a language hint");
        expect(harness.measureIds).toHaveLength(0);
    });

    it("applies code limits to raw HTML blocks and unknown hints before highlighting", () => {
        const explicitHighlight = vi.spyOn(hljs, "highlight");
        const automaticHighlight = vi.spyOn(hljs, "highlightAuto");
        const { element, harness, visual } = createVisual();

        visual.update(createUpdateOptions(
            `<pre><code>${"x".repeat(20_001)}</code></pre>`
        ));

        expect(element.querySelector(".error")?.textContent)
            .toContain("20,000 character limit");
        expect(explicitHighlight).not.toHaveBeenCalled();
        expect(automaticHighlight).not.toHaveBeenCalled();
        expect(harness.measureIds).toHaveLength(0);

        visual.update(createUpdateOptions(
            `\`\`\`unknown-language\n${"x".repeat(8_001)}\n\`\`\``
        ));

        expect(element.querySelector(".error")?.textContent)
            .toContain("add a language hint");
        expect(automaticHighlight).not.toHaveBeenCalled();
        expect(harness.measureIds).toHaveLength(0);
    });

    it("counts raw HTML code blocks before highlighting", () => {
        const automaticHighlight = vi.spyOn(hljs, "highlightAuto");
        const { element, harness, visual } = createVisual();
        const blocks = Array.from({ length: 101 }, () => "<pre><code>x</code></pre>").join("\n");

        visual.update(createUpdateOptions(blocks));

        expect(element.querySelector(".error")?.textContent)
            .toContain("100 code block limit");
        expect(automaticHighlight).not.toHaveBeenCalled();
        expect(harness.measureIds).toHaveLength(0);
    });

    it("creates scoped Unicode-safe IDs for duplicate and empty headings", () => {
        const first = createVisual({ instanceId: "instance-one" });
        const second = createVisual({ instanceId: "instance-two" });
        const markdown = "# 🚀 Café\n\n# 🚀 Café\n\n# Привет мир\n\n#";

        first.visual.update(createUpdateOptions(markdown));
        second.visual.update(createUpdateOptions(markdown));

        const firstIds = Array.from(first.element.querySelectorAll("h1")).map((heading) =>
            heading.id
        );
        const secondIds = Array.from(second.element.querySelectorAll("h1")).map((heading) =>
            heading.id
        );
        expect(new Set(firstIds).size).toBe(4);
        expect(firstIds[0]).toContain("🚀");
        expect(firstIds[1]).toContain("-2");
        expect(firstIds[2]).toContain("привет-мир");
        expect(firstIds[3]).toContain("heading");
        expect(new Set([...firstIds, ...secondIds]).size).toBe(8);
        expect(first.element.querySelector("h1")?.getAttribute("tabindex")).toBe("-1");
    });

    it("wraps tables in a focusable logical overflow container", () => {
        const { element, visual } = createVisual();

        visual.update(createUpdateOptions("| A | B |\n| --- | --- |\n| 1 | 2 |"));

        const wrapper = element.querySelector(".table-scroll");
        expect(wrapper?.getAttribute("tabindex")).toBe("0");
        expect(wrapper?.getAttribute("aria-label")).toBe("Scrollable table");
        expect(wrapper?.querySelector("table th")?.getAttribute("scope")).toBe("col");
        expect(wrapper?.querySelector("table")?.parentElement).toBe(wrapper);
    });

    it("preserves table-wrapper focus across changed and unchanged updates", () => {
        const { element, visual } = createVisual();
        visual.update(createUpdateOptions(
            "| A | B |\n| --- | --- |\n| 1 | 2 |"
        ));

        const container = element.querySelector(".markdown-container") as HTMLElement;
        const wrapper = element.querySelector(".table-scroll") as HTMLElement;
        container.scrollTop = 17;
        wrapper.focus();

        visual.update(createUpdateOptions(
            "| A | B |\n| --- | --- |\n| 1 | 2 |"
        ));
        expect(document.activeElement).toBe(wrapper);

        visual.update(createUpdateOptions(
            "| A | B |\n| --- | --- |\n| 3 | 4 |"
        ));
        expect(document.activeElement).toBe(element.querySelector(".table-scroll"));
        expect(container.scrollTop).toBe(17);
    });

    it("sets RTL direction and uses localized visual-owned strings", () => {
        const { element, visual } = createVisual({
            locale: "ar-SA",
            localizedStrings: {
                MarkdownViewer_DisplayName: "عارض Markdown",
                MarkdownViewer_ContentLabel: "محتوى Markdown"
            }
        });

        visual.update(createUpdateOptions());

        const container = element.querySelector(".markdown-container");
        expect(container?.getAttribute("dir")).toBe("rtl");
        expect(container?.getAttribute("aria-label")).toBe("محتوى Markdown");
        expect(element.querySelector(".landing-page h2")?.textContent).toBe("عارض Markdown");
    });

    it("localizes formatting model card and slice labels through the host manager", () => {
        const { visual } = createVisual({
            localizedStrings: {
                MarkdownViewer_Settings: "Configuración",
                MarkdownViewer_FontFamily: "Familia"
            }
        });

        visual.update(createUpdateOptions("# Localized"));
        const model = visual.getFormattingModel();
        const card = model.cards[0] as {
            displayName?: string;
            groups?: Array<{ slices?: Array<{ displayName?: string }> }>;
        };

        expect(card.displayName).toBe("Configuración");
        expect(card.groups?.[0]?.slices?.[0]?.displayName).toBe("Familia");
    });
    it("restores scroll and equivalent focus after changed content", () => {
        const { element, visual } = createVisual();
        visual.update(createUpdateOptions(
            "[Before](https://example.com/before)\n\nParagraph"
        ));

        const container = element.querySelector(".markdown-container") as HTMLElement;
        const firstLink = element.querySelector("a[data-safe-href]") as HTMLElement;
        container.scrollTop = 41;
        firstLink.focus();

        visual.update(createUpdateOptions(
            "[After](https://example.com/before)\n\nChanged paragraph"
        ));

        const nextLink = element.querySelector("a[data-safe-href]");
        expect(nextLink).not.toBe(firstLink);
        expect(document.activeElement).toBe(nextLink);
        expect(container.scrollTop).toBe(41);
    });

    it("falls back to document focus when changed content removes the focused target", () => {
        const { element, visual } = createVisual();
        visual.update(createUpdateOptions(
            "[Before](https://example.com/before)\n\nParagraph"
        ));

        const container = element.querySelector(".markdown-container") as HTMLElement;
        const firstLink = element.querySelector("a[data-safe-href]") as HTMLElement;
        container.scrollTop = 29;
        firstLink.focus();

        visual.update(createUpdateOptions(
            "[After](https://example.com/after)\n\nChanged paragraph"
        ));

        expect(document.activeElement).toBe(container);
        expect(container.scrollTop).toBe(29);
    });

    it("replaces content when incoming filters produce a new single value", () => {
        const { element, harness, visual } = createVisual();

        visual.update(createUpdateOptions("# Before filter"));
        visual.update(createUpdateOptions("# After filter"));

        expect(element.querySelector("h1")?.textContent).toBe("After filter");
        expect(element.textContent).not.toContain("Before filter");
        expect(harness.eventCalls).toEqual([
            "started", "finished",
            "started", "finished"
        ]);
    });

    it("applies every declared formatting property and resets toggled borders", () => {
        const { element, visual } = createVisual();
        const objects = {
            markdown: {
                fontFamily: "Arial",
                fontSize: 18,
                fontColor: { solid: { color: "#123456" } },
                backgroundColor: { solid: { color: "#FEDCBA" } },
                padding: 12,
                showBorder: true
            }
        } as powerbi.DataViewObjects;

        visual.update(createUpdateOptions("# Styled", objects));

        const container = element.querySelector(".markdown-container") as HTMLElement;
        expect(container.style.fontFamily).toBe("Arial");
        expect(container.style.fontSize).toBe("18px");
        expect(container.style.color).toBe("rgb(18, 52, 86)");
        expect(container.style.backgroundColor).toBe("rgb(254, 220, 186)");
        expect(container.style.padding).toBe("12px");
        expect(container.style.border).toBe("1px solid rgb(229, 231, 235)");
        expect(container.style.getPropertyValue("--text-color")).toBe("#123456");
        expect(container.style.getPropertyValue("--bg-color")).toBe("#FEDCBA");

        visual.update(createUpdateOptions("# Defaults"));

        expect(container.style.borderStyle).toBe("none");
        expect(container.style.borderRadius).toBe("0px");
    });

    it("uses only Power BI high-contrast colors and exposes keyboard focus", () => {
        const { element, visual } = createVisual({ highContrast: true });
        const objects = {
            markdown: {
                fontColor: { solid: { color: "#123456" } },
                backgroundColor: { solid: { color: "#FEDCBA" } },
                showBorder: true
            }
        } as powerbi.DataViewObjects;

        visual.update(createUpdateOptions("[Documentation](https://example.com)", objects));

        const container = element.querySelector(".markdown-container") as HTMLElement;
        const link = element.querySelector("a[data-safe-href]");
        expect(container.classList.contains("high-contrast")).toBe(true);
        expect(container.getAttribute("role")).toBe("document");
        expect(container.getAttribute("aria-label")).toBe("Markdown content");
        expect(container.getAttribute("tabindex")).toBe("0");
        expect(container.style.color).toBe("rgb(255, 255, 0)");
        expect(container.style.backgroundColor).toBe("rgb(0, 0, 0)");
        expect(container.style.border).toBe("2px solid rgb(255, 255, 0)");
        expect(container.style.getPropertyValue("--accent-color")).toBe("#FFFF00");
        expect(container.style.getPropertyValue("--link-color")).toBe("#00FFFF");
        expect(link?.getAttribute("role")).toBe("link");
        expect(link?.getAttribute("tabindex")).toBe("0");
    });

    it("strips arbitrary input classes while preserving validated code hints", () => {
        const { element, visual } = createVisual({ highContrast: true });
        visual.update(createUpdateOptions([
            "<p class=\"alert-warning dark-mode error hljs-keyword\">Safe text</p>",
            "<pre><code class=\"language-javascript alert-warning hljs-string\">const value = 1;</code></pre>"
        ].join("\n\n")));

        const paragraph = element.querySelector("p");
        const codeBlock = element.querySelector("pre code");
        expect(paragraph?.hasAttribute("class")).toBe(false);
        expect(Array.from(codeBlock?.classList ?? []).sort())
            .toEqual(["hljs", "language-javascript"]);
        expect(Array.from(codeBlock?.querySelectorAll("[class]") ?? []).every(
            (node) => Array.from(node.classList).every(
                (className) => /^hljs-[a-z0-9_-]+$/i.test(className)
            )
        )).toBe(true);
        expect((element.querySelector(".markdown-container") as HTMLElement)
            .style.getPropertyValue("--text-color")).toBe("#FFFF00");
    });

    it("uses validated fenced language hints instead of automatic detection", () => {
        const explicitHighlight = vi.spyOn(hljs, "highlight").mockReturnValue(
            createHighlightResult("<span class=\"hljs-keyword\">const</span> answer = 42;")
        );
        const automaticHighlight = vi.spyOn(hljs, "highlightAuto").mockReturnValue(
            createHighlightResult("automatic")
        );
        const { element, visual } = createVisual();

        visual.update(createUpdateOptions(
            "```javascript\nconst answer = 42;\n```"
        ));

        expect(explicitHighlight).toHaveBeenCalledOnce();
        expect(explicitHighlight).toHaveBeenCalledWith(
            "const answer = 42;\n",
            { language: "javascript", ignoreIllegals: true }
        );
        expect(automaticHighlight).not.toHaveBeenCalled();
        expect(element.querySelector("pre code")?.classList.contains(
            "language-javascript"
        )).toBe(true);
    });

    it("uses automatic detection only for absent or unknown language hints", () => {
        const explicitHighlight = vi.spyOn(hljs, "highlight").mockReturnValue(
            createHighlightResult("explicit")
        );
        const automaticHighlight = vi.spyOn(hljs, "highlightAuto").mockReturnValue(
            createHighlightResult("<span class=\"hljs-string\">automatic</span>")
        );
        const { element, visual } = createVisual();

        visual.update(createUpdateOptions("```unknown-language\nfirst\n```"));
        expect(element.querySelector("pre code")?.classList.contains(
            "language-unknown-language"
        )).toBe(false);

        visual.update(createUpdateOptions("```\nsecond\n```"));

        expect(explicitHighlight).not.toHaveBeenCalled();
        expect(automaticHighlight).toHaveBeenNthCalledWith(1, "first\n");
        expect(automaticHighlight).toHaveBeenNthCalledWith(2, "second\n");
    });

    it("re-sanitizes hostile syntax-highlighter output to controlled spans", () => {
        vi.spyOn(hljs, "highlight").mockReturnValue(createHighlightResult([
            "<span class=\"hljs-keyword alert-warning\" style=\"color:red\" onclick=\"alert(1)\">",
            "const<img src=\"https://evil.example/track.png\" onerror=\"alert(1)\"></span>",
            "<a href=\"https://evil.example\">external</a>",
            "<span class=\"dark-mode\"><script>alert(1)</script>value</span>"
        ].join("")));
        const { element, visual } = createVisual();

        visual.update(createUpdateOptions(
            "```javascript\nconst answer = 42;\n```"
        ));

        const codeBlock = element.querySelector("pre code");
        const descendants = Array.from(codeBlock?.querySelectorAll("*") ?? []);
        expect(descendants.length).toBeGreaterThan(0);
        expect(descendants.every((node) => node.tagName === "SPAN")).toBe(true);
        expect(codeBlock?.querySelector(
            "a, img, script, [style], [onclick], [onerror], [src], [href]"
        )).toBeNull();
        expect(codeBlock?.querySelector(".alert-warning, .dark-mode")).toBeNull();
        expect(codeBlock?.querySelector("span")?.className).toBe("hljs-keyword");
        expect(Array.from(codeBlock?.querySelectorAll("span[class]") ?? []).every(
            (span) => Array.from(span.classList).every(
                (className) => /^hljs-[a-z0-9_-]+$/i.test(className)
            )
        )).toBe(true);
    });

    it("highlights code without rendering executable inline markup", () => {
        const { element, visual } = createVisual();

        visual.update(createUpdateOptions(
            "```javascript\nconst answer = 42;\n```\n\n`<img src=x onerror=alert(1)>`"
        ));

        const codeBlock = element.querySelector("pre code");
        expect(codeBlock?.classList.contains("hljs")).toBe(true);
        expect(codeBlock?.querySelector("span")).not.toBeNull();
        expect(codeBlock?.textContent).toContain("const answer = 42;");
        expect(element.querySelector("img, script")).toBeNull();
        expect(element.textContent).toContain("<img src=x onerror=alert(1)>");
    });

    it("handles null and mismatched primitive values without exceptions", () => {
        const { element, harness, visual } = createVisual();

        for (const value of [0, -1, Infinity, true]) {
            visual.update(createUpdateOptions(value));
            expect(element.querySelector(".error")).toBeNull();
        }
        visual.update(createUpdateOptions(null));

        expect(element.querySelector(".landing-page")).not.toBeNull();
        expect(harness.eventCalls).not.toContain("failed");
    });

    it("keeps multiple visual instances independent", () => {
        const first = createVisual();
        const second = createVisual();

        first.visual.update(createUpdateOptions("# First instance"));
        second.visual.update(createUpdateOptions("# Second instance"));

        expect(first.element.querySelector("h1")?.textContent).toBe("First instance");
        expect(second.element.querySelector("h1")?.textContent).toBe("Second instance");
        expect(first.harness.eventCalls).toEqual(["started", "finished"]);
        expect(second.harness.eventCalls).toEqual(["started", "finished"]);
    });

    it("supports data-point and empty-space context-menu modes", () => {
        const { element, harness, visual } = createVisual();
        visual.update(createUpdateOptions("# Context target"));

        expect(element.querySelector(".error"), element.textContent ?? "").toBeNull();
        expect(element.querySelector(".markdown-container")?.textContent).toContain("Context target");
        const heading = element.querySelector("h1");
        expect(heading).not.toBeNull();

        const dataPointEvent = new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: 21,
            clientY: 34
        });
        heading!.dispatchEvent(dataPointEvent);

        const emptySpaceEvent = new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: 55,
            clientY: 89
        });
        element.dispatchEvent(emptySpaceEvent);

        expect(dataPointEvent.defaultPrevented).toBe(true);
        expect(emptySpaceEvent.defaultPrevented).toBe(true);
        expect(harness.measureIds).toEqual(["Measures.Markdown"]);
        expect(harness.contextMenuCalls).toHaveLength(2);
        expect(harness.contextMenuCalls[0]).toEqual({
            selectionId: harness.dataPointSelectionId,
            position: { x: 21, y: 34 }
        });
        expect(harness.contextMenuCalls[1].selectionId).toEqual({});
        expect(harness.contextMenuCalls[1].position).toEqual({ x: 55, y: 89 });
    });

    it("removes its context-menu listener when destroyed", () => {
        const { element, harness, visual } = createVisual();
        visual.destroy();

        element.dispatchEvent(new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true
        }));

        expect(harness.contextMenuCalls).toHaveLength(0);
    });
});

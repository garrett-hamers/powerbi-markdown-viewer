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
        const unsafeLink = links.find((link) => link.textContent === "Unsafe link");

        expect(safeLink?.hasAttribute("href")).toBe(false);
        expect(safeLink?.getAttribute("data-safe-href")).toBe("https://example.com/docs");
        expect(safeLink?.getAttribute("role")).toBe("link");
        expect(safeLink?.getAttribute("tabindex")).toBe("0");
        expect(safeLink?.hasAttribute("target")).toBe(false);
        expect(safeLink?.hasAttribute("rel")).toBe(false);
        expect(safeLink?.hasAttribute("referrerpolicy")).toBe(false);
        expect(unsafeLink?.hasAttribute("href")).toBe(false);
        expect(unsafeLink?.hasAttribute("data-safe-href")).toBe(false);
    });

    it("routes safe link activation through the Power BI host without native navigation", () => {
        const { element, harness, visual } = createVisual();
        visual.update(createUpdateOptions(
            "[Safe link](https://example.com/docs) [Unsafe link](http://example.com/docs)"
        ));

        const links = Array.from(element.querySelectorAll("a"));
        const safeLink = links.find((link) => link.textContent === "Safe link");
        const unsafeLink = links.find((link) => link.textContent === "Unsafe link");
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

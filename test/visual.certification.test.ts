import { beforeEach, describe, expect, it } from "vitest";
import powerbi from "powerbi-visuals-api";

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

describe("certification behavior", () => {
    beforeEach(() => {
        document.body.replaceChildren();
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

    it("highlights code without inserting unsanitized markup", () => {
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

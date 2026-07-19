import { beforeEach, describe, expect, it } from "vitest";
import powerbi from "powerbi-visuals-api";

import { Visual } from "../src/visual";
import { createMockHost } from "./helpers/mockHost";

import DataView = powerbi.DataView;
import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

function createDataView(markdown: string): DataView {
    return {
        metadata: {
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

function createUpdateOptions(markdown?: string): VisualUpdateOptions {
    return {
        dataViews: markdown === undefined ? [] : [createDataView(markdown)],
        viewport: { width: 640, height: 480 },
        type: 2
    } as VisualUpdateOptions;
}

function createVisual(options: { failSelectionBuilder?: boolean } = {}) {
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

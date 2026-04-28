/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect } from "vitest";
import powerbi from "powerbi-visuals-api";
import { Visual } from "../src/visual";
import { createMockHost } from "../e2e/mocks/host";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

function updateVisual(hostOptions: Parameters<typeof createMockHost>[0]) {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const host = createMockHost(hostOptions);
    const visual = new Visual({ element, host } as VisualConstructorOptions);
    const dataView: any = {
        metadata: { columns: [], objects: {} },
        single: {
            value: [
                "# Theme check",
                "",
                "[Read more](https://example.com)",
                "",
                "> Important note",
                "",
                "| A | B |",
                "| - | - |",
                "| 1 | 2 |",
                "",
                "```ts",
                "const value = 1;",
                "```"
            ].join("\n")
        }
    };

    visual.update({
        dataViews: [dataView],
        viewport: { width: 640, height: 360 },
        type: 2
    } as unknown as VisualUpdateOptions);

    return element.querySelector(".markdown-container") as HTMLElement;
}

describe("Power BI theme and high-contrast variables", () => {
    it("uses host high-contrast palette for readable semantic markdown surfaces", () => {
        const container = updateVisual({
            isHighContrast: true,
            palette: {
                foreground: "#FFFF00",
                background: "#000000",
                foregroundSelected: "#00FFFF",
                hyperlink: "#FFFF00"
            }
        });

        expect(container).toBeTruthy();
        expect(container.classList.contains("high-contrast")).toBe(true);
        expect(container.style.getPropertyValue("--markdown-text-color")).toBe("#FFFF00");
        expect(container.style.getPropertyValue("--markdown-bg-color")).toBe("#000000");
        expect(container.style.getPropertyValue("--markdown-border-color")).toBe("#FFFF00");
        expect(container.style.getPropertyValue("--markdown-focus-color")).toBe("#00FFFF");
        expect(container.querySelector("blockquote")).toBeTruthy();
        expect(container.querySelector("table")).toBeTruthy();
        expect(container.querySelector("pre code")).toBeTruthy();
    });

    it("keeps sanitized links semantic and adds safe external-link attributes", () => {
        const container = updateVisual({ isHighContrast: false });
        const link = container.querySelector("a") as HTMLAnchorElement;

        expect(link).toBeTruthy();
        expect(link.textContent).toBe("Read more");
        expect(link.target).toBe("_blank");
        expect(link.rel).toBe("noopener noreferrer");
        expect(link.referrerPolicy).toBe("no-referrer");
    });
});

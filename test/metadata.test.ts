import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readJson(path: string) {
    return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

describe("certification metadata", () => {
    const pbiviz = readJson("pbiviz.json");
    const packageManifest = readJson("package.json");
    const capabilities = readJson("capabilities.json");

    it("keeps canonical name, version, API, and GUID aligned", () => {
        expect(pbiviz.visual.displayName).toBe("Atlyn Markdown Viewer");
        expect(pbiviz.visual.version).toBe("1.0.2.0");
        expect(packageManifest.version).toBe(pbiviz.visual.version);
        expect(pbiviz.apiVersion).toBe("5.11.0");
        expect(pbiviz.visual.guid)
            .toBe("markdownViewer7897821586924C6F9CD657CB549A6967");
    });

    it("uses a certification-audited deterministic package command", () => {
        expect(packageManifest.scripts.package).toContain("package --certification-audit");
        expect(packageManifest.scripts.package).toContain("atlynMarkdownViewer.pbiviz");
        expect(packageManifest.scripts.package).toContain("Expected exactly one generated .pbiviz file");
    });

    it("uses the locked local Power BI toolchain", () => {
        expect(packageManifest.devDependencies["powerbi-visuals-tools"]).toBe("7.1.2");
        expect(packageManifest.scripts.package).not.toContain("npx");
        expect(packageManifest.overrides.sockjs.uuid).toBe("11.1.1");
    });

    it("declares no external runtime privileges", () => {
        expect(capabilities.privileges).toEqual([]);
        expect(capabilities.supportsEmptyDataView).toBe(true);
    });
});

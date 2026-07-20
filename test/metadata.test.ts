import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readJson(path: string) {
    return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

function readText(path: string): string {
    return readFileSync(resolve(process.cwd(), path), "utf8");
}

function findFiles(root: string, fileName: string): string[] {
    const ignoredDirectories = new Set([".git", ".tmp", "dist", "node_modules"]);
    const matches: string[] = [];

    for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (!ignoredDirectories.has(entry.name)) {
                matches.push(...findFiles(resolve(root, entry.name), fileName));
            }
        } else if (entry.name === fileName) {
            matches.push(resolve(root, entry.name));
        }
    }

    return matches;
}

describe("certification metadata", () => {
    const pbiviz = readJson("pbiviz.json");
    const packageManifest = readJson("package.json");
    const packageLock = readJson("package-lock.json");
    const capabilities = readJson("capabilities.json");

    it("keeps canonical name, version, API, and GUID aligned", () => {
        expect(pbiviz.visual.displayName).toBe("Atlyn Markdown Viewer");
        expect(pbiviz.visual.version).toBe("1.0.3.0");
        expect(packageManifest.version).toBe(pbiviz.visual.version);
        expect(packageLock.version).toBe(pbiviz.visual.version);
        expect(packageLock.packages[""].version).toBe(pbiviz.visual.version);
        expect(pbiviz.apiVersion).toBe("5.11.0");
        expect(pbiviz.visual.guid)
            .toBe("markdownViewer7897821586924C6F9CD657CB549A6967");
    });

    it("contains exactly one visual and every required repository file", () => {
        const requiredFiles = [
            ".gitignore",
            "capabilities.json",
            "eslint.config.mjs",
            "package-lock.json",
            "package.json",
            "pbiviz.json",
            "tsconfig.json"
        ];

        for (const file of requiredFiles) {
            expect(existsSync(resolve(process.cwd(), file)), file).toBe(true);
        }
        expect(findFiles(process.cwd(), "pbiviz.json")).toHaveLength(1);
    });

    it("uses a certification-audited deterministic package command", () => {
        expect(packageManifest.scripts.package).toContain("package --certification-audit");
        expect(packageManifest.scripts.package).toContain("atlynMarkdownViewer.pbiviz");
        expect(packageManifest.scripts.package).toContain("Expected exactly one generated .pbiviz file");
    });

    it("uses the locked local Power BI toolchain", () => {
        expect(packageManifest.dependencies["powerbi-visuals-api"]).toBe("5.11.0");
        expect(packageManifest.devDependencies["powerbi-visuals-tools"]).toBe("7.1.2");
        expect(packageLock.packages["node_modules/powerbi-visuals-api"].version).toBe("5.11.0");
        expect(packageLock.packages["node_modules/powerbi-visuals-tools"].version).toBe("7.1.2");
        expect(packageManifest.scripts.package).not.toContain("npx");
        expect(packageManifest.overrides.sockjs.uuid).toBe("11.1.1");
    });

    it("uses Microsoft's required ESLint script and recommended configuration", () => {
        expect(packageManifest.scripts.eslint)
            .toBe("npx eslint . --ext .js,.jsx,.ts,.tsx");
        const eslintConfig = readText("eslint.config.mjs");
        expect(eslintConfig).toContain("eslint-plugin-powerbi-visuals");
        expect(eslintConfig).toContain("configs.recommended");
    });

    it("ignores all generated package output required by certification", () => {
        const ignored = readText(".gitignore").split(/\r?\n/);
        expect(ignored).toContain("node_modules/");
        expect(ignored).toContain(".tmp/");
        expect(ignored).toContain("dist/");
        expect(ignored).toContain("*.pbiviz");
    });

    it("declares no external runtime privileges", () => {
        expect(capabilities.privileges).toEqual([]);
        expect(pbiviz.externalJS).toBeNull();
        expect(pbiviz.dependencies).toBeNull();
        expect(capabilities.supportsEmptyDataView).toBe(true);
    });

    it("declares only the supported single-measure contract", () => {
        expect(capabilities.dataRoles).toEqual([{
            displayName: "Markdown Content",
            name: "markdownContent",
            kind: "Measure"
        }]);
        expect(capabilities.dataViewMappings).toEqual([{
            single: { role: "markdownContent" }
        }]);
        expect(capabilities.supportsHighlight).toBe(false);
        expect(capabilities.supportsKeyboardFocus).toBe(true);
        expect(capabilities.supportsLandingPage).toBe(true);
    });

    it("uses only public npm registry dependencies", () => {
        const dependencySpecs = {
            ...packageManifest.dependencies,
            ...packageManifest.devDependencies
        };
        const privateSpecPattern =
            /^(?:bitbucket:|file:|git(?:\+|:)|github:|gitlab:|https?:|link:|workspace:)/i;

        for (const [name, spec] of Object.entries(dependencySpecs)) {
            expect(spec, name).not.toMatch(privateSpecPattern);
        }

        for (const [name, entry] of Object.entries(packageLock.packages)) {
            const resolved = (entry as { resolved?: string }).resolved;
            if (resolved) {
                expect(resolved, name).toMatch(/^https:\/\/registry\.npmjs\.org\//);
            }
        }
    });

    it("keeps application source free of forbidden dynamic and request APIs", () => {
        const source = [
            readText("src/settings.ts"),
            readText("src/visual.ts")
        ].join("\n");
        const forbiddenPatterns = [
            /\bXMLHttpRequest\b/,
            /\bfetch\s*\(/,
            /\beval\s*\(/,
            /\bFunction\s*\(/,
            /\bWebSocket\b/,
            /\brequestAnimationFrame\s*\(/,
            /\bsetInterval\s*\(/,
            /\bsetTimeout\s*\(/,
            /\.innerHTML\b/,
            /\binsertAdjacentHTML\b/
        ];

        for (const pattern of forbiddenPatterns) {
            expect(source).not.toMatch(pattern);
        }
        expect(source).toContain("this.host.launchUrl(href)");
    });
});

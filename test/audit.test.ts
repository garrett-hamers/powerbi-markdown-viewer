import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { findForbiddenSinks } from "../scripts/audit-pbiviz.mjs";

interface AuditReport {
    metadata: {
        vulnerabilities: {
            critical: number;
            high: number;
            moderate: number;
            total: number;
        };
    };
}

describe("certification dependency audit", () => {
    it("exits successfully with no moderate, high, or critical vulnerabilities", () => {
        const npmCli = process.env.npm_execpath;
        expect(npmCli).toBeTruthy();

        const result = spawnSync(
            process.execPath,
            [npmCli!, "audit", "--audit-level=moderate", "--json"],
            {
                cwd: process.cwd(),
                encoding: "utf8"
            }
        );

        expect(result.error).toBeUndefined();
        expect(result.status, result.stderr || result.stdout).toBe(0);

        const report = JSON.parse(result.stdout) as AuditReport;
        expect(report.metadata.vulnerabilities).toMatchObject({
            critical: 0,
            high: 0,
            moderate: 0,
            total: 0
        });
    });

    it("distinguishes inert forbidden API strings from executable bundle sinks", () => {
        expect(findForbiddenSinks([
            "const explanation = 'innerHTML, fetch(), WebSocket';",
            "// eval('ignored')"
        ].join("\n"))).toEqual([]);
        expect(findForbiddenSinks("node.innerHTML = value;")).toEqual([
            expect.objectContaining({ name: "innerHTML sink" })
        ]);
        expect(findForbiddenSinks("const value = fetch('/data');")).toEqual([
            expect.objectContaining({ name: "fetch request" })
        ]);
    });
});

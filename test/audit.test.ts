import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

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
        }, 30_000);
    });
});

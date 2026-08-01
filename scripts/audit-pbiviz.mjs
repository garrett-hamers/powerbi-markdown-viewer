import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const executablePatterns = [
    { name: "innerHTML sink", pattern: /(?:\.|\?\.)\s*innerHTML\b|\binnerHTML\s*=/gi },
    { name: "insertAdjacentHTML sink", pattern: /\binsertAdjacentHTML\s*\(/gi },
    { name: "fetch request", pattern: /\bfetch\s*\(/gi },
    { name: "XMLHttpRequest", pattern: /\bXMLHttpRequest\b/gi },
    { name: "WebSocket", pattern: /\bWebSocket\b/gi },
    { name: "eval", pattern: /\beval\s*\(/gi },
    { name: "Function constructor", pattern: /\bnew\s+Function\s*\(/gi },
    { name: "dynamic import", pattern: /\bimport\s*\(/gi }
];

function stripCommentsAndLiterals(source) {
    let output = "";
    let index = 0;

    while (index < source.length) {
        const character = source[index];
        const next = source[index + 1];

        if (character === "/" && next === "/") {
            index += 2;
            while (index < source.length && source[index] !== "\n") {
                index += 1;
            }
            output += "\n";
            continue;
        }

        if (character === "/" && next === "*") {
            index += 2;
            while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
                index += 1;
            }
            index += 2;
            output += " ";
            continue;
        }

        if (character === "'" || character === "\"" || character === "`") {
            const quote = character;
            index += 1;
            while (index < source.length) {
                if (source[index] === "\\") {
                    index += 2;
                    continue;
                }
                if (source[index] === quote) {
                    index += 1;
                    break;
                }
                index += 1;
            }
            output += " ";
            continue;
        }

        output += character;
        index += 1;
    }

    return output;
}

export function findForbiddenSinks(source) {
    const executableSource = stripCommentsAndLiterals(source);
    const findings = [];

    for (const { name, pattern } of executablePatterns) {
        pattern.lastIndex = 0;
        const match = pattern.exec(executableSource);
        if (match) {
            findings.push({
                name,
                evidence: executableSource.slice(Math.max(0, match.index - 40), match.index + 80)
            });
        }
    }

    // Quoted bracket property access is executable even though its property name is a string.
    if (/\[\s*["']innerHTML["']\s*\]/i.test(executableSource)) {
        findings.push({ name: "innerHTML bracket sink", evidence: "[\"innerHTML\"]" });
    }

    return findings;
}

function readJavaScriptEntries(archivePath) {
    const escapedPath = archivePath.replaceAll("'", "''");
    const command = [
        "$ErrorActionPreference='Stop';",
        "Add-Type -AssemblyName System.IO.Compression.FileSystem;",
        `$archive=[System.IO.Compression.ZipFile]::OpenRead('${escapedPath}');`,
        "try {",
        "$entries = foreach ($entry in $archive.Entries) {",
        "if ($entry.FullName -match '\\.(js|mjs)$' -or $entry.FullName -match '\\.pbiviz\\.json$') {",
        "$reader=[IO.StreamReader]::new($entry.Open());",
        "try { [PSCustomObject]@{ name=$entry.FullName; content=$reader.ReadToEnd() } }",
        "finally { $reader.Dispose() }",
        "}",
        "};",
        "$entries | ConvertTo-Json -Compress -Depth 3",
        "} finally { $archive.Dispose() }"
    ].join("");
    let output;
    try {
        output = execFileSync("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        command
        ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
        const details = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to inspect PBIVIZ archive: ${details}`);
    }
    if (!output.trim()) {
        return [];
    }
    const parsed = JSON.parse(output);
    return Array.isArray(parsed) ? parsed : [parsed];
}

export function auditPbiviz(archivePath) {
    if (!existsSync(archivePath)) {
        throw new Error(`PBIVIZ archive does not exist: ${archivePath}`);
    }

    const entries = readJavaScriptEntries(archivePath);
    if (entries.length === 0) {
        throw new Error("PBIVIZ archive contains no JavaScript resource to audit.");
    }

    const bundleEntries = entries.flatMap((entry) => {
        if (!entry.name.toLowerCase().endsWith(".pbiviz.json")) {
            return [entry];
        }
        try {
            const resource = JSON.parse(entry.content);
            return typeof resource.content?.js === "string"
                ? [{ name: `${entry.name}#content.js`, content: resource.content.js }]
                : [];
        } catch {
            return [];
        }
    });
    if (bundleEntries.length === 0) {
        throw new Error("PBIVIZ archive contains no embedded JavaScript resource to audit.");
    }

    const findings = bundleEntries.flatMap((entry) =>
        findForbiddenSinks(entry.content).map((finding) => ({
            ...finding,
            entry: entry.name
        }))
    );
    if (findings.length > 0) {
        const detail = findings.map((finding) =>
            `${finding.entry}: ${finding.name} (${finding.evidence.trim()})`
        ).join("\n");
        throw new Error(`Forbidden executable bundle sinks detected:\n${detail}`);
    }

    return entries.map((entry) => entry.name);
}

function findArchive() {
    const dist = resolve(process.cwd(), "dist");
    const archives = existsSync(dist)
        ? readdirSync(dist).filter((name) => name.toLowerCase().endsWith(".pbiviz"))
        : [];
    if (archives.length !== 1) {
        throw new Error(`Expected exactly one PBIVIZ archive in dist; found ${archives.length}.`);
    }
    return resolve(dist, archives[0]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const archivePath = process.argv[2] ? resolve(process.argv[2]) : findArchive();
    const entries = auditPbiviz(archivePath);
    console.log(`PBIVIZ security audit passed (${entries.length} JavaScript resource${entries.length === 1 ? "" : "s"}).`);
}

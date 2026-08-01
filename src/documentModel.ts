import { createSafeMarkdownFragment } from "./safeMarkdown";
import { decodeHTMLAttribute } from "entities";

export const DOCUMENT_POLICY_VERSION = "1.1.0";

export const DOCUMENT_LIMITS = {
    maxSourceCharacters: 512 * 1024,
    maxNestingDepth: 40,
    maxBlocks: 2000,
    maxEstimatedNodes: 4000,
    maxCodeBlocks: 100,
    maxCodeCharacters: 20_000,
    maxAutoDetectCharacters: 8_000,
    maxStructuredRows: 20000,
    maxLiveStructuredRows: 200
} as const;

export type DocumentCompleteness = "complete" | "partial" | "empty" | "invalid" | "error";

export type DiagnosticCategory =
    | "source-size-limit"
    | "block-limit"
    | "nesting-limit"
    | "node-limit"
    | "unsupported-tag"
    | "unsafe-attribute"
    | "external-resource"
    | "unsafe-link"
    | "code-block-limit"
    | "code-size-limit"
    | "auto-detect-limit"
    | "invalid-heading"
    | "heading-level-gap"
    | "row-limit"
    | "source-order";

export interface DocumentDiagnostic {
    category: DiagnosticCategory;
    count: number;
    message: string;
}

export interface BlockBase {
    key: string;
    text: string;
    sourceRowIndex?: number;
    selectionKey?: string;
    anchorId?: string;
}

export type InlineNode =
    | { type: "text"; text: string }
    | { type: "strong"; children: InlineNode[] }
    | { type: "emphasis"; children: InlineNode[] }
    | { type: "delete"; children: InlineNode[] }
    | { type: "code"; text: string }
    | { type: "break" }
    | { type: "link"; children: InlineNode[]; href?: string; safe: boolean };

export interface HeadingBlock extends BlockBase {
    type: "heading";
    level: number;
    children: InlineNode[];
}

export interface ParagraphBlock extends BlockBase {
    type: "paragraph";
    children: InlineNode[];
}

export interface QuoteBlock extends BlockBase {
    type: "quote";
    children: DocumentBlock[];
}

export interface ListItem {
    key: string;
    children: InlineNode[];
    nested?: ListBlock[];
}

export interface ListBlock extends BlockBase {
    type: "list";
    ordered: boolean;
    start?: number;
    items: ListItem[];
}

export interface CodeBlock extends BlockBase {
    type: "code";
    code: string;
    language?: string;
}

export interface TableBlock extends BlockBase {
    type: "table";
    headers: InlineNode[][];
    rows: InlineNode[][][];
    caption: string;
}

export interface DisclosureBlock extends BlockBase {
    type: "disclosure";
    summary: InlineNode[];
    children: DocumentBlock[];
    open: boolean;
}

export interface StatusBlock extends BlockBase {
    type: "status";
    status: "info" | "warning" | "blocked" | "unknown";
    label: string;
    children: InlineNode[];
}

export interface HorizontalRuleBlock extends BlockBase {
    type: "rule";
}

export type DocumentBlock =
    | HeadingBlock
    | ParagraphBlock
    | QuoteBlock
    | ListBlock
    | CodeBlock
    | TableBlock
    | DisclosureBlock
    | StatusBlock
    | HorizontalRuleBlock;

export interface OutlineEntry {
    key: string;
    id: string;
    level: number;
    text: string;
}

export interface SearchEntry {
    key: string;
    text: string;
    normalizedText: string;
}

export interface DocumentStats {
    blockCount: number;
    headingCount: number;
    tableCount: number;
    linkCount: number;
    codeBlockCount: number;
    rowCount: number;
}

export interface DocumentModel {
    id: string;
    title: string;
    blocks: DocumentBlock[];
    outline: OutlineEntry[];
    searchIndex: SearchEntry[];
    diagnostics: DocumentDiagnostic[];
    completeness: DocumentCompleteness;
    source: {
        mode: "document" | "structured" | "table";
        contentHash: string;
        policyVersion: string;
        loadedRows?: number;
        totalRows?: number;
    };
    stats: DocumentStats;
    summary: string;
}

export interface StructuredDocumentRow {
    index: number;
    sectionKey: string;
    title: string;
    body: string;
    kind: "paragraph" | "callout" | "metric" | "table-row";
    status: "good" | "warning" | "blocked" | "unknown";
    value?: string;
    link?: string;
    order?: number;
    selectionKey?: string;
    tooltip?: string;
}

export interface SearchMatch {
    key: string;
    index: number;
    text: string;
}

const ALLOWED_TAGS = [
    "a", "blockquote", "br", "code", "del", "details", "em",
    "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li", "ol",
    "p", "pre", "strong", "summary", "table", "tbody", "td",
    "th", "thead", "tr", "ul"
];

const ALLOWED_LANGUAGE_PATTERN = /^language-([a-z0-9][a-z0-9_+#.-]{0,63})$/i;
const HIGHLIGHT_LANGUAGES = new Set([
    "javascript", "js", "jsx", "mjs", "cjs",
    "typescript", "ts", "tsx",
    "json", "cjson", "ndjson",
    "xml", "html", "xhtml", "rss", "atom", "xjb", "xsd", "xsl", "plist", "wsf",
    "css",
    "markdown", "md", "mkdown", "mkdn",
    "bash", "sh", "zsh",
    "python", "py", "gyp", "ipython",
    "sql",
    "csharp", "cs",
    "java"
]);
const UNSUPPORTED_LINK_TEXT = " (unsupported link)";
const STATUS_PATTERN = /^\s*\[!(NOTE|INFO|WARNING|BLOCKED)\]\s*/i;
const RESOURCE_ATTRIBUTE_PATTERN =
    /\b(?:src|srcset|poster|background|dynsrc|lowsrc|ping|action|formaction|cite)\s*=/gi;
const EVENT_ATTRIBUTE_PATTERN = /\bon[a-z]+\s*=/gi;
const STYLE_ATTRIBUTE_PATTERN = /\bstyle\s*=/gi;
const TAG_PATTERN = /<\s*\/?\s*([a-z][a-z0-9:-]*)/gi;
const LINK_DESTINATION_PATTERN = /\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^"']*["'])?\s*\)/g;

function hashText(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeSearchText(value: string): string {
    return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

function replaceEmoji(value: string, emojiMap: Readonly<Record<string, string>>): string {
    return value.replace(/:[\w_]+:/g, (match) => emojiMap[match] ?? match);
}

function textFromInline(nodes: InlineNode[]): string {
    return nodes.map((node) => {
        switch (node.type) {
            case "text":
            case "code":
                return node.text;
            case "break":
                return " ";
            default:
                return textFromInline(node.children);
        }
    }).join("");
}

function textFromBlocks(blocks: DocumentBlock[]): string {
    return blocks.map((block) => block.text).join(" ");
}

function safeHttpsUrl(rawUrl: string): string | undefined {
    try {
        const url = new URL(decodeHTMLAttribute(rawUrl.trim()));
        return url.protocol === "https:" ? url.href : undefined;
    } catch {
        return undefined;
    }
}

function diagnosticMap(): Map<DiagnosticCategory, number> {
    return new Map<DiagnosticCategory, number>();
}

function addDiagnostic(
    diagnostics: Map<DiagnosticCategory, number>,
    category: DiagnosticCategory,
    amount = 1
): void {
    diagnostics.set(category, (diagnostics.get(category) ?? 0) + amount);
}

function createDiagnostics(diagnostics: Map<DiagnosticCategory, number>): DocumentDiagnostic[] {
    const messages: Record<DiagnosticCategory, string> = {
        "source-size-limit": "Source content exceeded the 512 KiB document limit.",
        "block-limit": "Only the first 2,000 logical blocks are shown.",
        "nesting-limit": "Content deeper than the supported nesting limit was omitted.",
        "node-limit": "The document reached its bounded rendering-node limit.",
        "unsupported-tag": "Unsupported content was removed.",
        "unsafe-attribute": "Unsafe or unsupported attributes were removed.",
        "external-resource": "External resources were blocked.",
        "unsafe-link": "Unsafe or non-HTTPS links are shown as inert text.",
        "code-block-limit": "Some code blocks were omitted because the code block limit was reached.",
        "code-size-limit": "Some code blocks were omitted because their size exceeded the supported limit.",
        "auto-detect-limit": "Some unlabelled code blocks were omitted; add a language hint for large code.",
        "invalid-heading": "Invalid heading identifiers were normalized.",
        "heading-level-gap": "Heading levels skip one or more document levels.",
        "row-limit": "Some structured rows are not shown because of the row limit.",
        "source-order": "The source did not provide a complete deterministic order."
    };

    return Array.from(diagnostics.entries())
        .filter(([, count]) => count > 0)
        .map(([category, count]) => ({ category, count, message: messages[category] }));
}

function inlineChildren(element: Element, emojiMap: Readonly<Record<string, string>>): InlineNode[] {
    const children: InlineNode[] = [];
    element.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
            children.push({
                type: "text",
                text: replaceEmoji(child.nodeValue ?? "", emojiMap)
            });
            return;
        }

        if (child.nodeType !== Node.ELEMENT_NODE) {
            return;
        }

        const childElement = child as Element;
        const nested = inlineChildren(childElement, emojiMap);
        switch (childElement.tagName.toLowerCase()) {
            case "strong":
                children.push({ type: "strong", children: nested });
                break;
            case "em":
                children.push({ type: "emphasis", children: nested });
                break;
            case "del":
                children.push({ type: "delete", children: nested });
                break;
            case "code":
                children.push({ type: "code", text: childElement.textContent ?? "" });
                break;
            case "br":
                children.push({ type: "break" });
                break;
            case "a": {
                const href = safeHttpsUrl(childElement.getAttribute("href") ?? "");
                children.push({
                    type: "link",
                    children: nested,
                    href,
                    safe: Boolean(href)
                });
                break;
            }
            default:
                children.push(...nested);
                break;
        }
    });
    return children;
}

function inlineText(element: Element, emojiMap: Readonly<Record<string, string>>): string {
    return textFromInline(inlineChildren(element, emojiMap));
}

function normalizedHeadingId(text: string, usedIds: Set<string>): string {
    const base = normalizeSearchText(text)
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || "section";
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) {
        id = `${base}-${suffix}`;
        suffix += 1;
    }
    usedIds.add(id);
    return id;
}

function classLanguage(element: Element): string | undefined {
    for (const className of Array.from(element.classList)) {
        const match = ALLOWED_LANGUAGE_PATTERN.exec(className);
        if (match) {
            return match[1].toLowerCase();
        }
    }
    return undefined;
}

function childElements(element: Element, tagName: string): Element[] {
    return Array.from(element.children).filter(
        (child) => child.tagName.toLowerCase() === tagName
    );
}

function createBase(
    type: string,
    index: number,
    text: string,
    sourceRowIndex?: number,
    selectionKey?: string
): BlockBase {
    return {
        key: `${type}-${index}-${hashText(text)}`,
        text,
        sourceRowIndex,
        selectionKey
    };
}

function buildBlockParser(
    diagnostics: Map<DiagnosticCategory, number>,
    emojiMap: Readonly<Record<string, string>>,
    sourceRowIndex?: number,
    selectionKey?: string
): {
    parse: (elements: Element[], depth: number) => DocumentBlock[];
    stats: DocumentStats;
    outline: OutlineEntry[];
} {
    const stats: DocumentStats = {
        blockCount: 0,
        headingCount: 0,
        tableCount: 0,
        linkCount: 0,
        codeBlockCount: 0,
        rowCount: 0
    };
    const outline: OutlineEntry[] = [];
    const usedIds = new Set<string>();
    let lastHeadingLevel = 0;
    let estimatedNodes = 0;
    let blockIndex = 0;

    const parse = (elements: Element[], depth: number): DocumentBlock[] => {
        if (depth > DOCUMENT_LIMITS.maxNestingDepth) {
            addDiagnostic(diagnostics, "nesting-limit");
            return [];
        }

        const blocks: DocumentBlock[] = [];
        for (const element of elements) {
            estimatedNodes += 1 + element.childElementCount;
            if (estimatedNodes > DOCUMENT_LIMITS.maxEstimatedNodes) {
                addDiagnostic(diagnostics, "node-limit");
                break;
            }
            if (blockIndex >= DOCUMENT_LIMITS.maxBlocks) {
                addDiagnostic(diagnostics, "block-limit");
                break;
            }

            const tagName = element.tagName.toLowerCase();
            const blockText = inlineText(element, emojiMap).trim();
            const base = createBase(tagName, blockIndex, blockText, sourceRowIndex, selectionKey);
            blockIndex += 1;

            if (/^h[1-6]$/.test(tagName)) {
                const level = Number(tagName.slice(1));
                const id = normalizedHeadingId(blockText, usedIds);
                if (element.getAttribute("id") && element.getAttribute("id") !== id) {
                    addDiagnostic(diagnostics, "invalid-heading");
                }
                if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
                    addDiagnostic(diagnostics, "heading-level-gap");
                }
                lastHeadingLevel = level;
                const heading: HeadingBlock = {
                    ...base,
                    type: "heading",
                    level,
                    anchorId: id,
                    children: inlineChildren(element, emojiMap)
                };
                blocks.push(heading);
                outline.push({ key: heading.key, id, level, text: blockText });
                stats.headingCount += 1;
            } else if (tagName === "p") {
                const statusMatch = STATUS_PATTERN.exec(blockText);
                if (statusMatch) {
                    const status = statusMatch[1].toLowerCase();
                    const statusText = blockText.replace(STATUS_PATTERN, "").trim();
                    const statusBlock: StatusBlock = {
                        ...base,
                        type: "status",
                        status: status === "warning"
                            ? "warning"
                            : status === "blocked"
                                ? "blocked"
                                : status === "info"
                                    ? "info"
                                    : "unknown",
                        label: statusMatch[1].toUpperCase(),
                        text: statusText,
                        children: [{
                            type: "text",
                            text: replaceEmoji(statusText, emojiMap)
                        }]
                    };
                    blocks.push(statusBlock);
                } else {
                    blocks.push({
                        ...base,
                        type: "paragraph",
                        children: inlineChildren(element, emojiMap)
                    });
                }
            } else if (tagName === "blockquote") {
                const quoteChildren = parse(Array.from(element.children), depth + 1);
                if (quoteChildren.length === 1 && quoteChildren[0].type === "status") {
                    blocks.push({
                        ...quoteChildren[0],
                        key: base.key,
                        sourceRowIndex,
                        selectionKey
                    });
                } else {
                    const statusText = quoteChildren.length === 1
                        && quoteChildren[0].type === "paragraph"
                        ? quoteChildren[0].text
                        : "";
                    const statusMatch = STATUS_PATTERN.exec(statusText);
                    if (statusMatch && quoteChildren.length === 1) {
                        const cleanText = statusText.replace(STATUS_PATTERN, "").trim();
                        blocks.push({
                            ...base,
                            type: "status",
                            status: statusMatch[1].toLowerCase() === "warning"
                                ? "warning"
                                : statusMatch[1].toLowerCase() === "blocked"
                                    ? "blocked"
                                    : "info",
                            label: statusMatch[1].toUpperCase(),
                            text: cleanText,
                            children: [{
                                type: "text",
                                text: replaceEmoji(cleanText, emojiMap)
                            }]
                        });
                    } else {
                        blocks.push({ ...base, type: "quote", children: quoteChildren });
                    }
                }
            } else if (tagName === "ul" || tagName === "ol") {
                const items: ListItem[] = childElements(element, "li").map((item, itemIndex) => {
                    const nestedLists = Array.from(item.children)
                        .filter((child) => ["ul", "ol"].includes(child.tagName.toLowerCase()))
                        .map((nested) => parse([nested], depth + 1))
                        .flat()
                        .filter((nested): nested is ListBlock => nested.type === "list");
                    const itemInline = Array.from(item.children)
                        .filter((child) => !["ul", "ol"].includes(child.tagName.toLowerCase()))
                        .flatMap((child) => inlineChildren(child, emojiMap));
                    return {
                        key: `${base.key}-item-${itemIndex}`,
                        children: itemInline.length > 0
                            ? itemInline
                            : inlineChildren(item, emojiMap),
                        nested: nestedLists.length > 0 ? nestedLists : undefined
                    };
                });
                blocks.push({
                    ...base,
                    type: "list",
                    ordered: tagName === "ol",
                    start: element.getAttribute("start")
                        ? Number(element.getAttribute("start"))
                        : undefined,
                    items
                });
            } else if (tagName === "pre") {
                const codeElement = element.querySelector("code");
                const code = codeElement?.textContent ?? element.textContent ?? "";
                stats.codeBlockCount += 1;
                if (stats.codeBlockCount > DOCUMENT_LIMITS.maxCodeBlocks) {
                    addDiagnostic(diagnostics, "code-block-limit");
                    continue;
                }
                if (code.length > DOCUMENT_LIMITS.maxCodeCharacters) {
                    addDiagnostic(diagnostics, "code-size-limit");
                    continue;
                }
                const language = codeElement ? classLanguage(codeElement) : undefined;
                if (
                    (!language || !HIGHLIGHT_LANGUAGES.has(language))
                    && code.length > DOCUMENT_LIMITS.maxAutoDetectCharacters
                ) {
                    addDiagnostic(diagnostics, "auto-detect-limit");
                    continue;
                }
                blocks.push({
                    ...base,
                    type: "code",
                    text: code,
                    code,
                    language
                });
            } else if (tagName === "table") {
                const explicitHeaderRow = element.querySelector("thead tr");
                const firstRow = element.querySelector("tr");
                const headerRow = explicitHeaderRow
                    ?? (firstRow && childElements(firstRow, "th").length > 0 ? firstRow : undefined);
                const headers = headerRow
                    ? Array.from(headerRow.children)
                        .filter((cell) => ["td", "th"].includes(cell.tagName.toLowerCase()))
                        .map((cell) => inlineChildren(cell, emojiMap))
                    : [];
                const bodyRows = childElements(element.querySelector("tbody") ?? element, "tr")
                    .filter((row) => row !== headerRow);
                const rows = bodyRows.map((row) =>
                    Array.from(row.children)
                        .filter((cell) => ["td", "th"].includes(cell.tagName.toLowerCase()))
                        .map((cell) => inlineChildren(cell, emojiMap))
                );
                const captionElement = element.querySelector("caption");
                const caption = captionElement?.textContent?.trim()
                    || (headers.length > 0 ? textFromInline(headers[0]) : "Document table");
                blocks.push({
                    ...base,
                    type: "table",
                    headers,
                    rows,
                    caption
                });
                stats.tableCount += 1;
                stats.rowCount += rows.length;
            } else if (tagName === "details") {
                const summaryElement = element.querySelector(":scope > summary");
                const detailElements = Array.from(element.children)
                    .filter((child) => child !== summaryElement);
                const children = parse(detailElements, depth + 1);
                blocks.push({
                    ...base,
                    type: "disclosure",
                    summary: summaryElement
                        ? inlineChildren(summaryElement, emojiMap)
                        : [{ type: "text", text: "Details" }],
                    children,
                    open: element.hasAttribute("open")
                });
            } else if (tagName === "hr") {
                blocks.push({ ...base, type: "rule" });
            } else {
                const childBlocks = parse(Array.from(element.children), depth + 1);
                blocks.push(...childBlocks);
            }

            stats.blockCount = blockIndex;
            stats.linkCount += countLinks(blocks[blocks.length - 1]);
        }
        return blocks;
    };

    return { parse, stats, outline };
}

function countLinks(block: DocumentBlock | undefined): number {
    if (!block) {
        return 0;
    }
    const countInline = (nodes: InlineNode[]): number => nodes.reduce((count, node) => {
        if (node.type === "link") {
            return count + 1 + countInline(node.children);
        }
        if ("children" in node) {
            return count + countInline(node.children);
        }
        return count;
    }, 0);
    switch (block.type) {
        case "heading":
        case "paragraph":
        case "status":
            return countInline(block.children);
        case "quote":
        case "disclosure":
            return block.children.reduce((count, child) => count + countLinks(child), 0);
        case "list":
            return block.items.reduce(
                (count, item) => count + countInline(item.children)
                    + (item.nested?.reduce((nestedCount, nested) =>
                        nestedCount + countLinks(nested), 0) ?? 0),
                0
            );
        case "table":
            return [...block.headers, ...block.rows.flat()].reduce(
                (count, cell) => count + countInline(cell),
                0
            );
        default:
            return 0;
    }
}

function collectSearchEntries(blocks: DocumentBlock[]): SearchEntry[] {
    const entries: SearchEntry[] = [];
    const add = (block: DocumentBlock): void => {
        if (block.text.trim()) {
            entries.push({
                key: block.key,
                text: block.text,
                normalizedText: normalizeSearchText(block.text)
            });
        }
        if (block.type === "quote" || block.type === "disclosure") {
            block.children.forEach(add);
        }
        if (block.type === "list") {
            block.items.forEach((item) => item.nested?.forEach(add));
        }
    };
    blocks.forEach(add);
    return entries;
}

function flattenDiagnostics(
    source: string,
    diagnostics: Map<DiagnosticCategory, number>
): DocumentDiagnostic[] {
    let tagMatch: RegExpExecArray | null;
    const allowedTags = new Set(ALLOWED_TAGS);
    while ((tagMatch = TAG_PATTERN.exec(source)) !== null) {
        if (!allowedTags.has(tagMatch[1].toLowerCase())) {
            addDiagnostic(diagnostics, "unsupported-tag");
        }
    }
    addDiagnostic(diagnostics, "unsafe-attribute", (source.match(EVENT_ATTRIBUTE_PATTERN) ?? []).length);
    addDiagnostic(diagnostics, "unsafe-attribute", (source.match(STYLE_ATTRIBUTE_PATTERN) ?? []).length);
    const resources = source.match(RESOURCE_ATTRIBUTE_PATTERN) ?? [];
    addDiagnostic(diagnostics, "external-resource", resources.length);
    const links = Array.from(source.matchAll(LINK_DESTINATION_PATTERN));
    links.forEach((match) => {
        const destination = match[1] ?? "";
        if (!safeHttpsUrl(destination)) {
            addDiagnostic(diagnostics, "unsafe-link");
        }
    });
    return createDiagnostics(diagnostics);
}

function buildModel(
    source: string,
    mode: "document" | "structured" | "table",
    emojiMap: Readonly<Record<string, string>>,
    sourceRowIndex?: number,
    selectionKey?: string
): DocumentModel {
    const diagnostics = diagnosticMap();
    const contentHash = hashText(source);
    const emptyStats: DocumentStats = {
        blockCount: 0,
        headingCount: 0,
        tableCount: 0,
        linkCount: 0,
        codeBlockCount: 0,
        rowCount: 0
    };
    if (source.length > DOCUMENT_LIMITS.maxSourceCharacters) {
        addDiagnostic(diagnostics, "source-size-limit");
        const sourceDiagnostics = createDiagnostics(diagnostics);
        return {
            id: `document-${contentHash}`,
            title: "Limited document",
            blocks: [],
            outline: [],
            searchIndex: [],
            diagnostics: sourceDiagnostics,
            completeness: "partial",
            source: { mode, contentHash, policyVersion: DOCUMENT_POLICY_VERSION },
            stats: emptyStats,
            summary: "Document content is limited because the source exceeded the supported size."
        };
    }

    const parsedDocument = createSafeMarkdownFragment(source);
    const parser = buildBlockParser(diagnostics, emojiMap, sourceRowIndex, selectionKey);
    const blocks = parser.parse(
        Array.from(parsedDocument.children).filter((child): child is Element =>
            child instanceof Element
        ),
        0
    );
    const diagnosticsList = flattenDiagnostics(source, diagnostics);
    const stats = {
        ...parser.stats,
        blockCount: parser.stats.blockCount,
        linkCount: blocks.reduce((total, block) => total + countLinks(block), 0)
    };
    const outline = parser.outline;
    const searchIndex = collectSearchEntries(blocks);
    const title = outline.find((entry) => entry.level === 1)?.text
        ?? outline[0]?.text
        ?? "Report document";
    const completeness: DocumentCompleteness = diagnosticsList.length > 0 ? "partial" : "complete";
    return {
        id: `document-${contentHash}`,
        title,
        blocks,
        outline,
        searchIndex,
        diagnostics: diagnosticsList,
        completeness,
        source: {
            mode,
            contentHash,
            policyVersion: DOCUMENT_POLICY_VERSION,
            loadedRows: sourceRowIndex === undefined ? undefined : 1,
            totalRows: sourceRowIndex === undefined ? undefined : 1
        },
        stats,
        summary: createSummary(title, stats, completeness, diagnosticsList)
    };
}

function createSummary(
    title: string,
    stats: DocumentStats,
    completeness: DocumentCompleteness,
    diagnostics: DocumentDiagnostic[]
): string {
    const detail = completeness === "complete"
        ? "Content is complete for the current filter context."
        : "Some content is limited or blocked; review document status.";
    const diagnosticCount = diagnostics.reduce((total, diagnostic) => total + diagnostic.count, 0);
    return `${title}. ${stats.headingCount} sections, ${stats.tableCount} tables, `
        + `${stats.linkCount} links${diagnosticCount > 0 ? `, ${diagnosticCount} policy notices` : ""}. ${detail}`;
}

export function createDocumentModel(
    source: string,
    emojiMap: Readonly<Record<string, string>>
): DocumentModel {
    return buildModel(source, "document", emojiMap);
}

export function createEmptyDocumentModel(): DocumentModel {
    return {
        id: "document-empty",
        title: "Empty document",
        blocks: [],
        outline: [],
        searchIndex: [],
        diagnostics: [],
        completeness: "empty",
        source: { mode: "document", contentHash: "empty", policyVersion: DOCUMENT_POLICY_VERSION },
        stats: {
            blockCount: 0,
            headingCount: 0,
            tableCount: 0,
            linkCount: 0,
            codeBlockCount: 0,
            rowCount: 0
        },
        summary: "Empty document."
    };
}

export function createStructuredDocumentModel(
    rows: StructuredDocumentRow[],
    emojiMap: Readonly<Record<string, string>>,
    totalRows: number
): DocumentModel {
    const limitedRows = rows.slice(0, DOCUMENT_LIMITS.maxLiveStructuredRows);
    const diagnostics = diagnosticMap();
    if (totalRows > limitedRows.length) {
        addDiagnostic(diagnostics, "row-limit", totalRows - limitedRows.length);
    }
    if (limitedRows.some((row, index) => row.order === undefined || (index > 0 && row.order === limitedRows[index - 1].order))) {
        addDiagnostic(diagnostics, "source-order");
    }
    const rowModels = limitedRows.map((row) => {
        const title = row.title.trim() || `Section ${row.index + 1}`;
        const value = row.value ? `\n\n**Value:** ${row.value}` : "";
        const status = row.status !== "unknown"
            ? `\n\n> [!${row.status === "warning" ? "WARNING" : row.status === "good" ? "INFO" : "BLOCKED"}] ${row.status}`
            : "";
        const link = row.link ? `\n\n[Open related HTTPS link](${row.link})` : "";
        return `## ${title}\n\n${row.body}${value}${status}${link}`;
    });
    const source = rowModels.join("\n\n");
    const model = buildModel(source, "structured", emojiMap);
    const mergedDiagnostics = [
        ...model.diagnostics,
        ...createDiagnostics(diagnostics)
    ];
    const uniqueDiagnostics = new Map<DiagnosticCategory, DocumentDiagnostic>();
    mergedDiagnostics.forEach((diagnostic) => {
        const current = uniqueDiagnostics.get(diagnostic.category);
        uniqueDiagnostics.set(diagnostic.category, {
            ...diagnostic,
            count: (current?.count ?? 0) + diagnostic.count
        });
    });
    const diagnosticsList = Array.from(uniqueDiagnostics.values());
    const completeness: DocumentCompleteness = diagnosticsList.length > 0 ? "partial" : "complete";
    let rowPosition = -1;
    model.blocks.forEach((block) => {
        if (block.type === "heading") {
            rowPosition += 1;
        }
        const row = limitedRows[rowPosition];
        if (row && rowPosition >= 0) {
            block.sourceRowIndex = row.index;
            block.selectionKey = row.selectionKey;
        }
    });
    return {
        ...model,
        diagnostics: diagnosticsList,
        completeness,
        source: {
            ...model.source,
            loadedRows: limitedRows.length,
            totalRows
        },
        summary: createSummary(model.title, {
            ...model.stats,
            rowCount: limitedRows.length
        }, completeness, diagnosticsList)
    };
}

export function findSearchMatches(model: DocumentModel, query: string): SearchMatch[] {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) {
        return [];
    }
    return model.searchIndex
        .map((entry) => {
            const index = entry.normalizedText.indexOf(normalizedQuery);
            return index >= 0 ? { key: entry.key, index, text: entry.text } : undefined;
        })
        .filter((match): match is SearchMatch => match !== undefined);
}

export function blockText(block: DocumentBlock): string {
    return block.text || (block.type === "table"
        ? [...block.headers, ...block.rows.flat()].map(textFromInline).join(" ")
        : block.type === "code"
            ? block.code
            : "");
}

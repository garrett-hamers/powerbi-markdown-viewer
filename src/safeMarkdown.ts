import { decodeHTML } from "entities";
import { marked } from "marked";

type MarkdownToken = {
    type: string;
    [key: string]: unknown;
};

const ALLOWED_TAGS = new Set([
    "a", "blockquote", "br", "code", "del", "details", "em",
    "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li", "ol",
    "p", "pre", "strong", "summary", "table", "tbody", "td",
    "th", "thead", "tr", "ul"
]);

const ALLOWED_ATTRIBUTES = new Set([
    "align", "colspan", "href", "id", "open", "reversed",
    "rowspan", "scope", "start", "target", "title"
]);

export function createSafeMarkdownFragment(source: string): DocumentFragment {
    const fragment = document.createDocumentFragment();
    renderBlocks(marked.lexer(source, { gfm: true, breaks: true }) as MarkdownToken[], fragment);
    return fragment;
}

function renderBlocks(tokens: MarkdownToken[], parent: Node): void {
    tokens.forEach((token) => {
        if (token.type === "space") {
            return;
        }
        if (token.type === "heading") {
            const level = Math.min(Math.max(Number(token.depth) || 1, 1), 6);
            const heading = document.createElement(`h${level}`);
            renderInline(tokenArray(token.tokens), heading);
            parent.appendChild(heading);
            return;
        }
        if (token.type === "paragraph") {
            const paragraph = document.createElement("p");
            renderInline(tokenArray(token.tokens), paragraph);
            parent.appendChild(paragraph);
            return;
        }
        if (token.type === "text") {
            const paragraph = document.createElement("p");
            const children = tokenArray(token.tokens);
            if (children.length > 0) {
                renderInline(children, paragraph);
            } else {
                paragraph.textContent = decodeHTML(tokenText(token.text));
            }
            parent.appendChild(paragraph);
            return;
        }
        if (token.type === "code") {
            const pre = document.createElement("pre");
            const code = document.createElement("code");
            const language = tokenText(token.lang).trim().split(/\s+/, 1)[0];
            if (language) {
                code.classList.add(`language-${language}`);
            }
            code.textContent = `${tokenText(token.text)}\n`;
            pre.appendChild(code);
            parent.appendChild(pre);
            return;
        }
        if (token.type === "list") {
            const list = document.createElement(token.ordered ? "ol" : "ul");
            if (token.ordered && token.start !== undefined && token.start !== "") {
                list.setAttribute("start", tokenText(token.start));
            }
            tokenArray(token.items).forEach((item) => {
                const listItem = document.createElement("li");
                const children = tokenArray(item.tokens);
                if (children.length > 0) {
                    renderBlockOrInline(children, listItem);
                } else {
                    listItem.textContent = decodeHTML(tokenText(item.text));
                }
                list.appendChild(listItem);
            });
            parent.appendChild(list);
            return;
        }
        if (token.type === "blockquote") {
            const quote = document.createElement("blockquote");
            renderBlocks(tokenArray(token.tokens), quote);
            parent.appendChild(quote);
            return;
        }
        if (token.type === "table") {
            const table = document.createElement("table");
            const head = document.createElement("thead");
            const headerRow = document.createElement("tr");
            tokenArray(token.header).forEach((cell, index) => {
                headerRow.appendChild(createTableCell("th", cell, token.align, index));
            });
            head.appendChild(headerRow);
            table.appendChild(head);
            const body = document.createElement("tbody");
            tokenArray(token.rows).forEach((row) => {
                const tableRow = document.createElement("tr");
                tokenArray(row).forEach((cell, index) => {
                    tableRow.appendChild(createTableCell("td", cell, token.align, index));
                });
                body.appendChild(tableRow);
            });
            table.appendChild(body);
            parent.appendChild(table);
            return;
        }
        if (token.type === "hr" || token.type === "br") {
            parent.appendChild(document.createElement(token.type));
            return;
        }
        if (token.type === "html") {
            renderRawHtml(tokenText(token.text), parent);
            return;
        }
        const text = tokenText(token.text);
        if (text) {
            parent.appendChild(document.createTextNode(decodeHTML(text)));
        }
    });
}

function renderBlockOrInline(tokens: MarkdownToken[], parent: Node): void {
    tokens.forEach((token) => {
        if (["paragraph", "text", "list", "blockquote", "code"].includes(token.type)) {
            renderBlocks([token], parent);
        } else {
            renderInline([token], parent);
        }
    });
}

function renderInline(tokens: MarkdownToken[], parent: Node): void {
    tokens.forEach((token) => {
        const children = tokenArray(token.tokens);
        switch (token.type) {
            case "strong":
                appendInlineElement("strong", children, token.text, parent);
                break;
            case "em":
                appendInlineElement("em", children, token.text, parent);
                break;
            case "del":
                appendInlineElement("del", children, token.text, parent);
                break;
            case "codespan": {
                const code = document.createElement("code");
                code.textContent = decodeHTML(tokenText(token.text));
                parent.appendChild(code);
                break;
            }
            case "link": {
                const link = document.createElement("a");
                const href = tokenText(token.href);
                if (href) {
                    link.setAttribute("href", href);
                }
                renderInline(children, link);
                if (link.childNodes.length === 0) {
                    link.textContent = decodeHTML(tokenText(token.text));
                }
                parent.appendChild(link);
                break;
            }
            case "autolink": {
                const link = document.createElement("a");
                link.setAttribute("href", tokenText(token.href));
                link.textContent = decodeHTML(tokenText(token.text) || tokenText(token.href));
                parent.appendChild(link);
                break;
            }
            case "image":
                parent.appendChild(document.createTextNode(decodeHTML(tokenText(token.text))));
                break;
            case "br":
                parent.appendChild(document.createElement("br"));
                break;
            case "html":
            case "tag":
                renderRawHtml(tokenText(token.text), parent);
                break;
            default:
                if (children.length > 0) {
                    renderInline(children, parent);
                } else {
                    parent.appendChild(document.createTextNode(decodeHTML(tokenText(token.text))));
                }
                break;
        }
    });
}

function appendInlineElement(
    tagName: string,
    children: MarkdownToken[],
    text: unknown,
    parent: Node
): void {
    const element = document.createElement(tagName);
    if (children.length > 0) {
        renderInline(children, element);
    } else {
        element.textContent = decodeHTML(tokenText(text));
    }
    parent.appendChild(element);
}

function renderRawHtml(markup: string, parent: Node): void {
    const stack: Element[] = [];
    const tagPattern = /<\/?([a-z][a-z0-9-]*)\b([^>]*)>/gi;
    let cursor = 0;
    let blockedTag: string | undefined;
    let match: RegExpExecArray | null;
    const appendText = (value: string): void => {
        if (!blockedTag && value) {
            (stack[stack.length - 1] ?? parent).appendChild(
                document.createTextNode(decodeHTML(value))
            );
        }
    };

    while ((match = tagPattern.exec(markup)) !== null) {
        appendText(markup.slice(cursor, match.index));
        const tagName = match[1].toLowerCase();
        const closing = /^<\//.test(match[0]);
        if (!ALLOWED_TAGS.has(tagName)) {
            if (closing && blockedTag === tagName) {
                blockedTag = undefined;
            } else if (!closing && !blockedTag && ["script", "style"].includes(tagName)) {
                blockedTag = tagName;
            }
            cursor = tagPattern.lastIndex;
            continue;
        }
        if (closing) {
            for (let index = stack.length - 1; index >= 0; index -= 1) {
                if (stack[index].tagName.toLowerCase() === tagName) {
                    stack.length = index;
                    break;
                }
            }
            cursor = tagPattern.lastIndex;
            continue;
        }
        const element = document.createElement(tagName);
        copySafeAttributes(element, match[2]);
        (stack[stack.length - 1] ?? parent).appendChild(element);
        if (!["br", "hr"].includes(tagName)) {
            stack.push(element);
        }
        cursor = tagPattern.lastIndex;
    }
    appendText(markup.slice(cursor));
}

function copySafeAttributes(element: Element, rawAttributes: string): void {
    const pattern = /([a-z][a-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
    const booleanPattern = /(?:^|\s)(open|reversed)(?=\s|$)/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(rawAttributes)) !== null) {
        const name = match[1].toLowerCase();
        const codeClass = name === "class" && element.tagName.toLowerCase() === "code";
        if (ALLOWED_ATTRIBUTES.has(name) || codeClass) {
            element.setAttribute(name, match[2] ?? match[3] ?? match[4] ?? "");
        }
    }
    let booleanMatch: RegExpExecArray | null;
    while ((booleanMatch = booleanPattern.exec(rawAttributes)) !== null) {
        const name = booleanMatch[1].toLowerCase();
        if (ALLOWED_ATTRIBUTES.has(name)) {
            element.setAttribute(name, "");
        }
    }
}

function createTableCell(
    tagName: "th" | "td",
    cell: MarkdownToken,
    alignments: unknown,
    index: number
): HTMLTableCellElement {
    const element = document.createElement(tagName);
    const alignment = Array.isArray(alignments) ? alignments[index] : undefined;
    if (alignment === "left" || alignment === "center" || alignment === "right") {
        element.setAttribute("align", alignment);
    }
    renderInline(tokenArray(cell.tokens), element);
    if (element.childNodes.length === 0) {
        element.textContent = decodeHTML(tokenText(cell.text));
    }
    if (tagName === "th") {
        element.setAttribute("scope", "col");
    }
    return element;
}

function tokenArray(value: unknown): MarkdownToken[] {
    return Array.isArray(value) ? value as MarkdownToken[] : [];
}

function tokenText(value: unknown): string {
    return typeof value === "string" ? value : "";
}

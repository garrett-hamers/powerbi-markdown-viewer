/*
*  Power BI Visual CLI - Markdown Viewer with Syntax Highlighting + Emoji
*  MIT License
*/
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { marked } from "marked";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import markdown from "highlight.js/lib/languages/markdown";
import bash from "highlight.js/lib/languages/bash";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import csharp from "highlight.js/lib/languages/csharp";
import java from "highlight.js/lib/languages/java";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import DataView = powerbi.DataView;
import ISelectionId = powerbi.visuals.ISelectionId;
import ILocalizationManager = powerbi.extensibility.ILocalizationManager;

import { VisualFormattingSettingsModel } from "./settings";

const DEFAULT_ACCENT_COLOR = "#118DFF";
const DEFAULT_BACKGROUND_COLOR = "#FFFFFF";
const DEFAULT_BORDER_COLOR = "#E5E7EB";
const DEFAULT_FONT_FAMILY = "Segoe UI, sans-serif";
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_PADDING = 20;
const DEFAULT_TEXT_COLOR = "#111827";
const FOCUSABLE_CONTENT_SELECTOR =
    "a[data-safe-href], summary, pre[tabindex], h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]";
const UNSUPPORTED_LINK_REASON = "Only absolute HTTPS links can be opened.";
const MAX_DOCUMENT_LENGTH = 250_000;
const MAX_CODE_BLOCKS = 100;
const MAX_CODE_LENGTH = 20_000;
const MAX_AUTO_DETECT_LENGTH = 8_000;
const DATA_UPDATE_TYPE = 1 << 1;
const ALL_UPDATE_TYPES = 0x1FE;
const RTL_LANGUAGE_CODES = new Set(["ar", "dv", "fa", "he", "ku", "ps", "sd", "ur", "yi"]);
const HIGHLIGHT_LANGUAGES = [
    "javascript", "typescript", "json", "xml", "css", "markdown",
    "bash", "python", "sql", "csharp", "java"
] as const;

type MarkdownToken = {
    type: string;
    [key: string]: unknown;
};

interface ReadingState {
    scrollTop: number;
    focusKey?: string;
    rootFocused: boolean;
}

let generatedInstanceCount = 0;

const emojiMap: { [key: string]: string } = {
    ':smile:': '😄', ':grinning:': '😀', ':laughing:': '😆', ':joy:': '😂',
    ':heart:': '❤️', ':star:': '⭐', ':fire:': '🔥', ':thumbsup:': '👍',
    ':thumbsdown:': '👎', ':clap:': '👏', ':wave:': '👋', ':pray:': '🙏',
    ':rocket:': '🚀', ':sparkles:': '✨', ':tada:': '🎉', ':confetti_ball:': '🎊',
    ':trophy:': '🏆', ':medal:': '🏅', ':check:': '✅', ':x:': '❌',
    ':warning:': '⚠️', ':info:': 'ℹ️', ':question:': '❓', ':exclamation:': '❗',
    ':bulb:': '💡', ':memo:': '📝', ':book:': '📖', ':bookmark:': '🔖',
    ':link:': '🔗', ':gear:': '⚙️', ':wrench:': '🔧', ':hammer:': '🔨',
    ':chart:': '📊', ':chart_up:': '📈', ':chart_down:': '📉',
    ':clock:': '🕐', ':calendar:': '📅', ':email:': '📧', ':phone:': '📱',
    ':computer:': '💻', ':desktop:': '🖥️', ':folder:': '📁', ':file:': '📄',
    ':lock:': '🔒', ':unlock:': '🔓', ':key:': '🔑', ':shield:': '🛡️',
    ':bug:': '🐛', ':zap:': '⚡', ':cloud:': '☁️', ':sun:': '☀️', ':moon:': '🌙',
    ':earth:': '🌍', ':globe:': '🌐', ':pin:': '📍', ':flag:': '🚩',
    ':arrow_right:': '➡️', ':arrow_left:': '⬅️', ':arrow_up:': '⬆️', ':arrow_down:': '⬇️',
    ':plus:': '➕', ':minus:': '➖', ':heavy_check_mark:': '✔️',
    ':white_check_mark:': '✅', ':eyes:': '👀', ':thinking:': '🤔',
    ':100:': '💯', ':ok:': '👌', ':point_right:': '👉', ':point_left:': '👈'
};

HIGHLIGHT_LANGUAGES.forEach((language) => {
    const definitions: Record<string, unknown> = {
        javascript, typescript, json, xml, css, markdown,
        bash, python, sql, csharp, java
    };
    hljs.registerLanguage(language, definitions[language] as Parameters<typeof hljs.registerLanguage>[1]);
});

export class Visual implements IVisual {
    private target: HTMLElement;
    private container: HTMLElement;
    private host: IVisualHost;
    private selectionManager: ISelectionManager;
    private eventService: IVisualEventService;
    private localizationManager?: ILocalizationManager;
    private readonly locale: string;
    private readonly instancePrefix: string;
    private currentSelectionId?: ISelectionId;
    private readonly emptySelectionId = {} as ISelectionId;
    private renderedKind: "none" | "landing" | "document" | "error" = "none";
    private renderedMarkdown?: string;
    private formattingSettings = new VisualFormattingSettingsModel();
    private formattingSettingsService: FormattingSettingsService;
    private readonly contextMenuHandler = (event: MouseEvent): void => {
        event.preventDefault();

        const eventTarget = event.target;
        const isDataPoint = this.currentSelectionId
            && eventTarget instanceof Node
            && eventTarget !== this.container
            && this.container.contains(eventTarget);
        const selectionId = isDataPoint ? this.currentSelectionId : this.emptySelectionId;

        void this.selectionManager.showContextMenu(selectionId, {
            x: event.clientX,
            y: event.clientY
        });
    };
    private readonly linkClickHandler = (event: MouseEvent): void => {
        if (event.button !== 0) {
            return;
        }
        this.activateSafeLink(event);
    };
    private readonly linkAuxClickHandler = (event: MouseEvent): void => {
        if (event.button !== 1) {
            return;
        }
        this.activateSafeLink(event);
    };
    private readonly linkKeyDownHandler = (event: KeyboardEvent): void => {
        if (event.key !== "Enter" && event.key !== " ") {
            return;
        }
        this.activateSafeLink(event);
    };

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.selectionManager = this.host.createSelectionManager();
        this.eventService = this.host.eventService;
        this.locale = this.host.locale || "en-US";
        this.localizationManager = typeof this.host.createLocalizationManager === "function"
            ? this.host.createLocalizationManager()
            : undefined;
        this.instancePrefix = this.createInstancePrefix(this.host.instanceId);
        this.formattingSettingsService = new FormattingSettingsService();
        
        this.container = document.createElement("div");
        this.container.className = "markdown-container";
        this.container.setAttribute("role", "document");
        this.container.setAttribute("aria-label", this.localized("MarkdownViewer_ContentLabel", "Markdown content"));
        this.container.setAttribute("tabindex", "0");
        this.target.appendChild(this.container);
        this.target.addEventListener("contextmenu", this.contextMenuHandler);
        this.container.addEventListener("click", this.linkClickHandler);
        this.container.addEventListener("auxclick", this.linkAuxClickHandler);
        this.container.addEventListener("keydown", this.linkKeyDownHandler);
        
        marked.setOptions({ gfm: true, breaks: true });
    }

    public update(options: VisualUpdateOptions): void {
        this.eventService.renderingStarted(options);

        try {
            this.render(options);
            this.eventService.renderingFinished(options);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.formattingSettings = new VisualFormattingSettingsModel();
            this.showError(reason);
            this.applyFormatting();
            this.eventService.renderingFailed(options, reason);
        }
    }

    private render(options: VisualUpdateOptions): void {
        const updateType = Number(options.type ?? ALL_UPDATE_TYPES);
        const hasDataUpdate = updateType === 0 || (updateType & DATA_UPDATE_TYPE) !== 0;

        if (!hasDataUpdate && this.renderedKind !== "none") {
            this.applyFormatting();
            return;
        }

        const dataView: DataView = options.dataViews?.[0];

        if (dataView) {
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel, dataView
            );
        }

        if (!dataView) {
            this.currentSelectionId = undefined;
            if (this.renderedKind !== "landing") {
                this.showLandingPage();
            }
            this.applyFormatting();
            return;
        }

        const markdownValue = dataView.single?.value;
        if (markdownValue === undefined || markdownValue === null || String(markdownValue).trim() === "") {
            this.currentSelectionId = undefined;
            if (this.renderedKind !== "landing") {
                this.showLandingPage();
            }
            this.applyFormatting();
            return;
        }

        const markdownContent = String(markdownValue);
        if (this.renderedKind === "document" && this.renderedMarkdown === markdownContent) {
            this.applyFormatting();
            return;
        }

        this.validateDocumentLimits(markdownContent);
        this.currentSelectionId = this.createMeasureSelectionId(dataView);
        const readingState = this.captureReadingState();
        const safeFragment = this.createSafeFragment(markdownContent);

        this.processTextEmojis(safeFragment);
        this.prepareSafeLinks(safeFragment);
        this.applySyntaxHighlighting(safeFragment);
        this.prepareAccessibleTables(safeFragment);
        this.prepareHeadingIds(safeFragment);
        this.prepareAccessibleContent(safeFragment);
        this.container.replaceChildren(safeFragment);
        this.renderedKind = "document";
        this.renderedMarkdown = markdownContent;
        this.applyFormatting();
        this.restoreReadingState(readingState);
    }

    private processTextEmojis(root: ParentNode): void {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const textNodes: Text[] = [];
        let currentNode = walker.nextNode();

        while (currentNode) {
            const parent = currentNode.parentElement;
            if (!parent?.closest("code, pre")) {
                textNodes.push(currentNode as Text);
            }
            currentNode = walker.nextNode();
        }

        textNodes.forEach((textNode) => {
            textNode.data = textNode.data.replace(
                /:[\w_]+:/g,
                (match) => emojiMap[match] || match
            );
        });
    }

    private createSafeFragment(markdownContent: string): DocumentFragment {
        const fragment = document.createDocumentFragment();
        const tokens = marked.lexer(markdownContent) as MarkdownToken[];
        this.renderBlockTokens(tokens, fragment);
        this.restrictInputClasses(fragment);
        return fragment;
    }

    private renderBlockTokens(tokens: MarkdownToken[], parent: Node): void {
        tokens.forEach((token) => {
            const type = token.type;
            if (type === "space") {
                return;
            }

            if (type === "heading") {
                const depth = Math.min(Math.max(Number(token.depth) || 1, 1), 6);
                const heading = document.createElement(`h${depth}`);
                this.renderInlineTokens(this.getTokenArray(token.tokens), heading);
                parent.appendChild(heading);
                return;
            }

            if (type === "paragraph") {
                const paragraph = document.createElement("p");
                this.renderInlineTokens(this.getTokenArray(token.tokens), paragraph);
                parent.appendChild(paragraph);
                return;
            }

            if (type === "text") {
                const paragraph = document.createElement("p");
                const nestedTokens = this.getTokenArray(token.tokens);
                if (nestedTokens.length > 0) {
                    this.renderInlineTokens(nestedTokens, paragraph);
                } else {
                    paragraph.textContent = this.getTokenText(token);
                }
                parent.appendChild(paragraph);
                return;
            }

            if (type === "code") {
                const pre = document.createElement("pre");
                const code = document.createElement("code");
                const language = this.getTokenText(token.lang).trim().split(/\s+/, 1)[0];
                if (language) {
                    code.classList.add(`language-${language}`);
                }
                code.textContent = `${this.getTokenText(token.text)}\n`;
                pre.appendChild(code);
                parent.appendChild(pre);
                return;
            }

            if (type === "list") {
                const list = document.createElement(token.ordered ? "ol" : "ul");
                if (token.ordered && token.start !== undefined && token.start !== "") {
                    list.setAttribute("start", this.getTokenText(token.start));
                }
                this.getTokenArray(token.items).forEach((item) => {
                    const listItem = document.createElement("li");
                    const itemTokens = this.getTokenArray(item.tokens);
                    if (itemTokens.length > 0) {
                        this.renderBlockOrInlineTokens(itemTokens, listItem);
                    } else {
                        listItem.textContent = this.getTokenText(item.text);
                    }
                    list.appendChild(listItem);
                });
                parent.appendChild(list);
                return;
            }

            if (type === "blockquote") {
                const blockquote = document.createElement("blockquote");
                this.renderBlockTokens(this.getTokenArray(token.tokens), blockquote);
                parent.appendChild(blockquote);
                return;
            }

            if (type === "table") {
                const table = document.createElement("table");
                const thead = document.createElement("thead");
                const headerRow = document.createElement("tr");
                this.getTokenArray(token.header).forEach((cell, index) => {
                    headerRow.appendChild(this.createTableCell("th", cell, token.align, index));
                });
                thead.appendChild(headerRow);
                table.appendChild(thead);

                const tbody = document.createElement("tbody");
                this.getTokenArray(token.rows).forEach((row) => {
                    const tableRow = document.createElement("tr");
                    this.getTokenArray(row).forEach((cell, index) => {
                        tableRow.appendChild(this.createTableCell("td", cell, token.align, index));
                    });
                    tbody.appendChild(tableRow);
                });
                table.appendChild(tbody);
                parent.appendChild(table);
                return;
            }

            if (type === "hr") {
                parent.appendChild(document.createElement("hr"));
                return;
            }

            if (type === "br") {
                parent.appendChild(document.createElement("br"));
                return;
            }

            if (type === "html") {
                this.renderSafeHtml(this.getTokenText(token.text), parent);
                return;
            }

            const text = this.getTokenText(token.text);
            if (text) {
                parent.appendChild(document.createTextNode(this.decodeHighlightText(text)));
            }
        });
    }

    private renderBlockOrInlineTokens(tokens: MarkdownToken[], parent: Node): void {
        tokens.forEach((token) => {
            if (["paragraph", "text", "list", "blockquote", "code"].includes(token.type)) {
                this.renderBlockTokens([token], parent);
            } else {
                this.renderInlineTokens([token], parent);
            }
        });
    }

    private renderInlineTokens(tokens: MarkdownToken[], parent: Node): void {
        tokens.forEach((token) => {
            const childTokens = this.getTokenArray(token.tokens);
            switch (token.type) {
                case "strong":
                    this.appendInlineElement("strong", childTokens, token.text, parent);
                    break;
                case "em":
                    this.appendInlineElement("em", childTokens, token.text, parent);
                    break;
                case "del":
                    this.appendInlineElement("del", childTokens, token.text, parent);
                    break;
                case "codespan": {
                    const code = document.createElement("code");
                    code.textContent = this.decodeHighlightText(this.getTokenText(token.text));
                    parent.appendChild(code);
                    break;
                }
                case "link": {
                    const link = document.createElement("a");
                    const href = this.getTokenText(token.href);
                    if (href) {
                        link.setAttribute("href", href);
                    }
                    this.renderInlineTokens(childTokens, link);
                    if (link.childNodes.length === 0) {
                        link.textContent = this.getTokenText(token.text);
                    }
                    parent.appendChild(link);
                    break;
                }
                case "autolink": {
                    const link = document.createElement("a");
                    link.setAttribute("href", this.getTokenText(token.href));
                    link.textContent = this.getTokenText(token.text) || this.getTokenText(token.href);
                    parent.appendChild(link);
                    break;
                }
                case "image":
                    parent.appendChild(document.createTextNode(
                        this.decodeHighlightText(this.getTokenText(token.text))
                    ));
                    break;
                case "br":
                    parent.appendChild(document.createElement("br"));
                    break;
                case "html":
                case "tag":
                    this.renderSafeHtml(this.getTokenText(token.text), parent);
                    break;
                case "escape":
                case "text":
                default:
                    if (childTokens.length > 0) {
                        this.renderInlineTokens(childTokens, parent);
                    } else {
                        parent.appendChild(document.createTextNode(
                            this.decodeHighlightText(this.getTokenText(token.text))
                        ));
                    }
                    break;
            }
        });
    }

    private appendInlineElement(
        tagName: string,
        childTokens: MarkdownToken[],
        text: unknown,
        parent: Node
    ): void {
        const element = document.createElement(tagName);
        if (childTokens.length > 0) {
            this.renderInlineTokens(childTokens, element);
        } else {
            element.textContent = this.getTokenText(text);
        }
        parent.appendChild(element);
    }

    private renderSafeHtml(markup: string, parent: Node): void {
        const allowedTags = new Set([
            "a", "blockquote", "br", "code", "del", "details", "em",
            "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li", "ol",
            "p", "pre", "strong", "summary", "table", "tbody", "td",
            "th", "thead", "tr", "ul"
        ]);
        const stack: Element[] = [];
        const tagPattern = /<\/?([a-z][a-z0-9-]*)\b([^>]*)>/gi;
        let cursor = 0;
        let blockedTag: string | undefined;
        let match: RegExpExecArray | null;

        const appendText = (value: string): void => {
            if (!blockedTag && value) {
                (stack[stack.length - 1] ?? parent).appendChild(
                    document.createTextNode(this.decodeHighlightText(value))
                );
            }
        };

        while ((match = tagPattern.exec(markup)) !== null) {
            appendText(markup.slice(cursor, match.index));
            const tagName = match[1].toLowerCase();
            const isClosing = /^<\//.test(match[0]);

            if (!allowedTags.has(tagName)) {
                if (isClosing && blockedTag === tagName) {
                    blockedTag = undefined;
                } else if (!isClosing && !blockedTag && ["script", "style"].includes(tagName)) {
                    blockedTag = tagName;
                }
                cursor = tagPattern.lastIndex;
                continue;
            }

            if (isClosing) {
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
            this.copySafeHtmlAttributes(element, match[2]);
            (stack[stack.length - 1] ?? parent).appendChild(element);
            if (!["br", "hr"].includes(tagName)) {
                stack.push(element);
            }
            cursor = tagPattern.lastIndex;
        }
        appendText(markup.slice(cursor));
    }

    private copySafeHtmlAttributes(element: Element, rawAttributes: string): void {
        const allowedAttributes = new Set([
            "align", "colspan", "href", "open", "reversed", "rowspan", "scope", "start", "title"
        ]);
        const attributePattern = /([a-z][a-z0-9:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;
        let match: RegExpExecArray | null;
        while ((match = attributePattern.exec(rawAttributes)) !== null) {
            const name = match[1].toLowerCase();
            const isCodeClass = name === "class"
                && element.tagName.toLowerCase() === "code";
            if (allowedAttributes.has(name) || isCodeClass) {
                element.setAttribute(name, match[2] ?? match[3] ?? match[4] ?? "");
            }
        }
    }

    private createTableCell(
        tagName: "th" | "td",
        cell: MarkdownToken,
        alignments: unknown,
        index: number
    ): HTMLTableCellElement {
        const cellElement = document.createElement(tagName);
        const alignment = Array.isArray(alignments) ? alignments[index] : undefined;
        if (alignment === "left" || alignment === "center" || alignment === "right") {
            cellElement.setAttribute("align", alignment);
        }
        this.renderInlineTokens(this.getTokenArray(cell.tokens), cellElement);
        if (cellElement.childNodes.length === 0) {
            cellElement.textContent = this.getTokenText(cell.text);
        }
        if (tagName === "th") {
            cellElement.setAttribute("scope", "col");
        }
        return cellElement;
    }

    private getTokenArray(value: unknown): MarkdownToken[] {
        return Array.isArray(value) ? value as MarkdownToken[] : [];
    }

    private getTokenText(value: unknown): string {
        return typeof value === "string" ? value : "";
    }

    private createHighlightedFragment(source: string, language?: string): DocumentFragment {
        const highlightedHtml = language
            ? hljs.highlight(source, { language, ignoreIllegals: true }).value
            : hljs.highlightAuto(source).value;
        const fragment = this.parseHighlightMarkup(highlightedHtml);
        this.restrictHighlightClasses(fragment);
        return fragment;
    }

    private parseHighlightMarkup(markup: string): DocumentFragment {
        const fragment = document.createDocumentFragment();
        const stack: Element[] = [];
        const tagPattern = /<\/?span\b[^>]*>/gi;
        let cursor = 0;
        let match: RegExpExecArray | null;

        const appendText = (value: string): void => {
            const target = stack[stack.length - 1] ?? fragment;
            target.appendChild(document.createTextNode(this.decodeHighlightText(value)));
        };

        while ((match = tagPattern.exec(markup)) !== null) {
            appendText(markup.slice(cursor, match.index));
            const tag = match[0];
            if (/^<\//.test(tag)) {
                if (stack.length > 0) {
                    stack.pop();
                }
            } else {
                const span = document.createElement("span");
                const classMatch = /\bclass\s*=\s*["']([^"']*)["']/i.exec(tag);
                if (classMatch) {
                    classMatch[1].split(/\s+/).filter(Boolean).forEach((className) => {
                        if (/^hljs-[a-z0-9_-]+$/i.test(className)) {
                            span.classList.add(className);
                        }
                    });
                }
                (stack[stack.length - 1] ?? fragment).appendChild(span);
                stack.push(span);
            }
            cursor = tagPattern.lastIndex;
        }
        appendText(markup.slice(cursor));
        return fragment;
    }

    private decodeHighlightText(value: string): string {
        return value.replace(
            /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
            (entity, value: string) => {
                if (value.toLowerCase() === "amp") {
                    return "&";
                }
                if (value.toLowerCase() === "lt") {
                    return "<";
                }
                if (value.toLowerCase() === "gt") {
                    return ">";
                }
                if (value.toLowerCase() === "quot") {
                    return "\"";
                }
                if (value.toLowerCase() === "apos") {
                    return "'";
                }
                if (value.toLowerCase() === "nbsp") {
                    return "\u00a0";
                }
                const codePoint = value.toLowerCase().startsWith("#x")
                    ? Number.parseInt(value.slice(2), 16)
                    : Number.parseInt(value.slice(1), 10);
                return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10FFFF
                    ? String.fromCodePoint(codePoint)
                    : entity;
            }
        );
    }

    private restrictInputClasses(root: ParentNode): void {
        root.querySelectorAll("[class], [id]").forEach((element) => {
            const language = element.matches("pre > code")
                ? this.getValidatedLanguage(element)
                : undefined;

            element.removeAttribute("class");
            element.removeAttribute("id");
            if (language) {
                element.classList.add(`language-${language}`);
            }
        });
    }

    private restrictHighlightClasses(root: ParentNode): void {
        root.querySelectorAll("span[class]").forEach((span) => {
            const allowedClasses = Array.from(span.classList).filter(
                (className) => /^hljs-[a-z0-9_-]+$/i.test(className)
            );

            span.removeAttribute("class");
            if (allowedClasses.length > 0) {
                span.classList.add(...allowedClasses);
            }
        });
    }

    private getValidatedLanguage(block: Element): string | undefined {
        for (const className of Array.from(block.classList)) {
            const match = /^language-([a-z0-9][a-z0-9_+#.-]{0,63})$/i.exec(className);
            if (!match) {
                continue;
            }

            const language = match[1].toLowerCase();
            if (hljs.getLanguage(language)) {
                return language;
            }
        }

        return undefined;
    }

    private prepareSafeLinks(root: ParentNode): void {
        root.querySelectorAll("a").forEach((link) => {
            const anchor = link as HTMLAnchorElement;
            const href = this.getSafeHttpsUrl(anchor.getAttribute("href") ?? "");

            if (!href) {
                const replacement = document.createElement("span");
                replacement.className = "unsupported-link";
                replacement.title = this.localized(
                    "MarkdownViewer_UnsupportedLinkReason",
                    UNSUPPORTED_LINK_REASON
                );
                replacement.append(...Array.from(anchor.childNodes));

                const reason = document.createElement("span");
                reason.className = "unsupported-link-reason";
                reason.textContent = ` (${this.localized(
                    "MarkdownViewer_UnsupportedLink",
                    "unsupported link"
                )})`;
                replacement.appendChild(reason);
                anchor.replaceWith(replacement);
                return;
            }

            anchor.removeAttribute("href");
            anchor.setAttribute("data-safe-href", href);
            anchor.setAttribute("role", "link");
            anchor.setAttribute("tabindex", "0");
            anchor.setAttribute(
                "title",
                this.localized(
                    "MarkdownViewer_OpenLink",
                    `Open HTTPS link to ${new URL(href).hostname}`
                ).replace("{0}", new URL(href).hostname)
            );
            anchor.removeAttribute("target");
            anchor.removeAttribute("rel");
            anchor.removeAttribute("referrerpolicy");
        });
    }

    private activateSafeLink(event: Event): void {
        const eventTarget = event.target;
        if (!(eventTarget instanceof Element)) {
            return;
        }

        const anchor = eventTarget.closest("a[data-safe-href]");
        if (!(anchor instanceof HTMLAnchorElement) || !this.container.contains(anchor)) {
            return;
        }

        event.preventDefault();
        const href = this.getSafeHttpsUrl(anchor.getAttribute("data-safe-href") ?? "");
        if (href) {
            this.host.launchUrl(href);
        }
    }

    private getSafeHttpsUrl(rawUrl: string): string | undefined {
        try {
            const url = new URL(rawUrl.trim());
            return url.protocol === "https:" ? url.href : undefined;
        } catch {
            return undefined;
        }
    }

    private applySyntaxHighlighting(root: ParentNode): void {
        root.querySelectorAll("pre code").forEach((block) => {
            const language = this.getValidatedLanguage(block);
            const fragment = this.createHighlightedFragment(
                block.textContent ?? "",
                language
            );
            block.replaceChildren(fragment);
            block.classList.add("hljs");
        });
    }

    private prepareAccessibleTables(root: ParentNode): void {
        root.querySelectorAll("table").forEach((table) => {
            const wrapper = document.createElement("div");
            wrapper.className = "table-scroll";
            wrapper.setAttribute(
                "aria-label",
                this.localized("MarkdownViewer_ScrollableTable", "Scrollable table")
            );
            wrapper.setAttribute("tabindex", "0");
            table.replaceWith(wrapper);
            wrapper.appendChild(table);
        });
    }

    private prepareHeadingIds(root: ParentNode): void {
        const usedIds = new Set<string>();
        root.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((heading) => {
            const base = this.slugifyHeading(heading.textContent ?? "") || "heading";
            let id = `${this.instancePrefix}-heading-${base}`;
            let suffix = 2;
            while (usedIds.has(id)) {
                id = `${this.instancePrefix}-heading-${base}-${suffix}`;
                suffix += 1;
            }
            usedIds.add(id);
            heading.setAttribute("id", id);
            heading.setAttribute("tabindex", "-1");
        });
    }

    private slugifyHeading(text: string): string {
        return text
            .normalize("NFKC")
            .toLocaleLowerCase(this.locale)
            .replace(/[^\p{L}\p{M}\p{N}\p{Extended_Pictographic}]+/gu, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 120);
    }

    private prepareAccessibleContent(root: ParentNode): void {
        root.querySelectorAll("pre").forEach((pre) => {
            const language = this.getValidatedLanguage(pre.querySelector("code") ?? pre);
            pre.setAttribute("tabindex", "0");
            pre.setAttribute(
                "aria-label",
                language
                    ? this.localized("MarkdownViewer_LanguageCodeBlock", `${language} code block`)
                        .replace("{0}", language)
                    : this.localized("MarkdownViewer_CodeBlock", "Code block")
            );
        });
    }

    private validateDocumentLimits(markdownContent: string): void {
        if (markdownContent.length > MAX_DOCUMENT_LENGTH) {
            throw new Error(this.localized(
                "MarkdownViewer_DocumentTooLong",
                `Document exceeds the ${MAX_DOCUMENT_LENGTH.toLocaleString(this.locale)} character limit.`
            ).replace("{0}", MAX_DOCUMENT_LENGTH.toLocaleString(this.locale)));
        }

        let codeBlockCount = 0;
        let fenceCharacter = "";
        let fenceLength = 0;
        let codeLength = 0;
        let autoDetect = false;

        for (const line of markdownContent.split(/\r?\n/)) {
            const fence = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
            if (!fenceCharacter && fence) {
                codeBlockCount += 1;
                if (codeBlockCount > MAX_CODE_BLOCKS) {
                    throw new Error(this.localized(
                        "MarkdownViewer_TooManyCodeBlocks",
                        `Document exceeds the ${MAX_CODE_BLOCKS} code block limit.`
                    ).replace("{0}", String(MAX_CODE_BLOCKS)));
                }
                fenceCharacter = fence[1][0];
                fenceLength = fence[1].length;
                codeLength = 0;
                const language = fence[2].trim().split(/\s+/, 1)[0];
                autoDetect = !language;
                continue;
            }

            if (fenceCharacter) {
                if (fence && fence[1][0] === fenceCharacter && fence[1].length >= fenceLength) {
                    fenceCharacter = "";
                    continue;
                }
                codeLength += line.length + 1;
                if (codeLength > MAX_CODE_LENGTH) {
                    throw new Error(this.localized(
                        "MarkdownViewer_CodeBlockTooLong",
                        `A code block exceeds the ${MAX_CODE_LENGTH} character limit.`
                    ).replace("{0}", String(MAX_CODE_LENGTH)));
                }
                if (autoDetect && codeLength > MAX_AUTO_DETECT_LENGTH) {
                    throw new Error(this.localized(
                        "MarkdownViewer_AutoDetectTooLong",
                        `Automatic code detection is limited to ${MAX_AUTO_DETECT_LENGTH} characters; add a language hint.`
                    ).replace("{0}", String(MAX_AUTO_DETECT_LENGTH)));
                }
            }
        }
    }

    private captureReadingState(): ReadingState {
        const activeElement = document.activeElement;

        return {
            scrollTop: this.container.scrollTop,
            focusKey: activeElement instanceof HTMLElement
                && activeElement.matches(FOCUSABLE_CONTENT_SELECTOR)
                ? this.getFocusKey(activeElement)
                : undefined,
            rootFocused: activeElement === this.container
        };
    }

    private restoreReadingState(state: ReadingState): void {
        if (state.rootFocused) {
            this.container.focus({ preventScroll: true });
        } else if (state.focusKey) {
            const focusTarget = Array.from(this.container.querySelectorAll<HTMLElement>(
                FOCUSABLE_CONTENT_SELECTOR
            )).find((candidate) => this.getFocusKey(candidate) === state.focusKey);
            (focusTarget ?? this.container).focus({ preventScroll: true });
        }

        this.container.scrollTop = state.scrollTop;
    }

    private getFocusKey(element: HTMLElement): string {
        if (element.matches("a[data-safe-href]")) {
            return `link:${element.getAttribute("data-safe-href") ?? ""}`;
        }
        if (element.matches("summary")) {
            return `summary:${element.textContent ?? ""}`;
        }
        if (/^h[1-6]$/i.test(element.tagName)) {
            return `heading:${element.getAttribute("id") ?? ""}`;
        }
        return `code:${element.textContent ?? ""}`;
    }

    private createInstancePrefix(hostInstanceId: string | undefined): string {
        if (!hostInstanceId) {
            generatedInstanceCount += 1;
            return `md-v${generatedInstanceCount.toString(36)}`;
        }

        let hash = 2166136261;
        for (const character of hostInstanceId) {
            hash ^= character.codePointAt(0) ?? 0;
            hash = Math.imul(hash, 16777619);
        }
        return `md-${(hash >>> 0).toString(36)}`;
    }

    private localized(key: string, fallback: string): string {
        const localized = this.localizationManager?.getDisplayName(key);
        return localized && localized !== key ? localized : fallback;
    }

    private createMeasureSelectionId(dataView: DataView): ISelectionId | undefined {
        const measureColumn = dataView.metadata?.columns?.find(
            (column) => column.roles?.markdownContent && column.queryName
        );

        if (!measureColumn?.queryName) {
            return undefined;
        }

        return this.host
            .createSelectionIdBuilder()
            .withMeasure(measureColumn.queryName)
            .createSelectionId();
    }

    private showLandingPage(): void {
        const landingPage = document.createElement("div");
        landingPage.className = "landing-page";

        const heading = document.createElement("h2");
        heading.textContent = this.localized("MarkdownViewer_DisplayName", "Atlyn Markdown Viewer");

        const instructions = document.createElement("p");
        instructions.textContent = this.localized(
            "MarkdownViewer_AddMeasure",
            "Add a measure containing markdown text."
        );

        const supportedFeatures = document.createElement("p");
        supportedFeatures.textContent = this.localized(
            "MarkdownViewer_SupportedFeatures",
            "Supports headers, lists, tables, code blocks, and emoji shortcodes."
        );

        landingPage.append(heading, instructions, supportedFeatures);
        this.container.replaceChildren(landingPage);
        this.renderedKind = "landing";
        this.renderedMarkdown = undefined;
    }

    private showError(reason: string): void {
        this.currentSelectionId = undefined;
        this.container.replaceChildren();
        this.renderedKind = "error";
        this.renderedMarkdown = undefined;

        const errorContainer = document.createElement("div");
        errorContainer.className = "error";
        errorContainer.setAttribute("role", "alert");

        const label = document.createElement("strong");
        label.textContent = `${this.localized("MarkdownViewer_Error", "Error")}: `;

        errorContainer.append(label, document.createTextNode(reason));
        this.container.appendChild(errorContainer);
    }

    private applyFormatting(): void {
        const settings = this.formattingSettings?.markdownCard;
        if (!settings) {
            return;
        }

        const colorPalette = this.host.colorPalette;
        const isHighContrast = colorPalette.isHighContrast;
        const configuredFontFamily = settings.fontFamily?.value?.trim();
        const configuredFontColor = settings.fontColor?.value?.value || DEFAULT_TEXT_COLOR;
        const configuredBackgroundColor =
            settings.backgroundColor?.value?.value || DEFAULT_BACKGROUND_COLOR;
        const fontColor = isHighContrast
            ? colorPalette.foreground.value
            : configuredFontColor;
        const backgroundColor = isHighContrast
            ? colorPalette.background.value
            : configuredBackgroundColor;
        const themeAccentColor = colorPalette.getColor("Atlyn Markdown Viewer").value;
        const accentColor = isHighContrast
            ? colorPalette.foreground.value
            : themeAccentColor || DEFAULT_ACCENT_COLOR;
        const linkColor = isHighContrast
            ? colorPalette.hyperlink.value
            : themeAccentColor || DEFAULT_ACCENT_COLOR;
        const borderColor = isHighContrast
            ? colorPalette.foreground.value
            : DEFAULT_BORDER_COLOR;
        const fontSize = this.getSafePixelValue(
            settings.fontSize?.value,
            DEFAULT_FONT_SIZE,
            1
        );
        const padding = this.getSafePixelValue(
            settings.padding?.value,
            DEFAULT_PADDING,
            0
        );

        this.container.classList.toggle("high-contrast", isHighContrast);
        this.container.setAttribute(
            "dir",
            this.isRtlLocale() ? "rtl" : "ltr"
        );
        this.container.style.fontFamily = configuredFontFamily || DEFAULT_FONT_FAMILY;
        this.container.style.fontSize = `${fontSize}px`;
        this.container.style.color = fontColor;
        this.container.style.backgroundColor = backgroundColor;
        this.container.style.padding = `${padding}px`;
        this.container.style.setProperty("--accent-color", accentColor);
        this.container.style.setProperty("--link-color", linkColor);
        this.container.style.setProperty("--text-color", fontColor);
        this.container.style.setProperty("--bg-color", backgroundColor);
        this.container.style.setProperty("--border-color", borderColor);
        this.container.style.setProperty(
            "--code-bg",
            isHighContrast ? backgroundColor : "#F3F4F6"
        );
        this.container.style.setProperty(
            "--pre-bg",
            isHighContrast ? backgroundColor : "#1F2937"
        );
        this.container.style.setProperty(
            "--pre-text",
            isHighContrast ? fontColor : "#F9FAFB"
        );
        this.container.style.setProperty(
            "--table-header-bg",
            isHighContrast ? backgroundColor : "#F8FAFC"
        );
        this.container.style.setProperty(
            "--blockquote-bg",
            isHighContrast ? backgroundColor : "#F8FAFC"
        );

        if (settings.showBorder?.value) {
            const borderWidth = isHighContrast ? 2 : 1;
            this.container.style.border = `${borderWidth}px solid ${borderColor}`;
            this.container.style.borderRadius = "8px";
        } else {
            this.container.style.border = "none";
            this.container.style.borderRadius = "0";
        }
    }

    private isRtlLocale(): boolean {
        return RTL_LANGUAGE_CODES.has(this.locale.toLowerCase().split("-")[0]);
    }

    private getSafePixelValue(value: unknown, fallback: number, minimum: number): number {
        return typeof value === "number" && Number.isFinite(value)
            ? Math.max(value, minimum)
            : fallback;
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public destroy(): void {
        this.target.removeEventListener("contextmenu", this.contextMenuHandler);
        this.container.removeEventListener("click", this.linkClickHandler);
        this.container.removeEventListener("auxclick", this.linkAuxClickHandler);
        this.container.removeEventListener("keydown", this.linkKeyDownHandler);
    }
}

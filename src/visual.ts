/*
 * Power BI Visual CLI - Atlyn Document
 * MIT License
 */
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import hljs from "highlight.js";
import DOMPurify from "dompurify";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import DataView = powerbi.DataView;
import PrimitiveValue = powerbi.PrimitiveValue;
import ISelectionId = powerbi.visuals.ISelectionId;

import {
    createDocumentModel,
    createEmptyDocumentModel,
    createStructuredDocumentModel,
    DocumentBlock,
    DocumentModel,
    findSearchMatches,
    InlineNode,
    StructuredDocumentRow
} from "./documentModel";
import { VisualFormattingSettingsModel } from "./settings";

const DEFAULT_ACCENT_COLOR = "#118DFF";
const DEFAULT_BACKGROUND_COLOR = "#FFFFFF";
const DEFAULT_BORDER_COLOR = "#E5E7EB";
const DEFAULT_FONT_FAMILY = "Segoe UI, sans-serif";
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_PADDING = 20;
const DEFAULT_TEXT_COLOR = "#111827";
const UNSUPPORTED_LINK_REASON = "Only absolute HTTPS links can be opened.";
const UNSUPPORTED_LINK_TEXT = " (unsupported link)";

interface ReadingState {
    scrollTop: number;
    focusKey?: string;
    rootFocused: boolean;
}

export interface ContextMenuCall {
    selectionId: ISelectionId;
    position: { x: number; y: number };
}

const emojiMap: Readonly<Record<string, string>> = {
    ":smile:": "😄", ":grinning:": "😀", ":laughing:": "😆", ":joy:": "😂",
    ":heart:": "❤️", ":star:": "⭐", ":fire:": "🔥", ":thumbsup:": "👍",
    ":thumbsdown:": "👎", ":clap:": "👏", ":wave:": "👋", ":pray:": "🙏",
    ":rocket:": "🚀", ":sparkles:": "✨", ":tada:": "🎉", ":confetti_ball:": "🎊",
    ":trophy:": "🏆", ":medal:": "🏅", ":check:": "✅", ":x:": "❌",
    ":warning:": "⚠️", ":info:": "ℹ️", ":question:": "❓", ":exclamation:": "❗",
    ":bulb:": "💡", ":memo:": "📝", ":book:": "📖", ":bookmark:": "🔖",
    ":link:": "🔗", ":gear:": "⚙️", ":wrench:": "🔧", ":hammer:": "🔨",
    ":chart:": "📊", ":chart_up:": "📈", ":chart_down:": "📉",
    ":clock:": "🕐", ":calendar:": "📅", ":email:": "📧", ":phone:": "📱",
    ":computer:": "💻", ":desktop:": "🖥️", ":folder:": "📁", ":file:": "📄",
    ":lock:": "🔒", ":unlock:": "🔓", ":key:": "🔑", ":shield:": "🛡️",
    ":bug:": "🐛", ":zap:": "⚡", ":cloud:": "☁️", ":sun:": "☀️", ":moon:": "🌙",
    ":earth:": "🌍", ":globe:": "🌐", ":pin:": "📍", ":flag:": "🚩",
    ":arrow_right:": "➡️", ":arrow_left:": "⬅️", ":arrow_up:": "⬆️", ":arrow_down:": "⬇️",
    ":plus:": "➕", ":minus:": "➖", ":heavy_check_mark:": "✔️",
    ":white_check_mark:": "✅", ":eyes:": "👀", ":thinking:": "🤔",
    ":100:": "💯", ":ok:": "👌", ":point_right:": "👉", ":point_left:": "👈"
};

export class Visual implements IVisual {
    private readonly target: HTMLElement;
    private readonly container: HTMLElement;
    private readonly host: IVisualHost;
    private readonly selectionManager: ISelectionManager;
    private readonly eventService: IVisualEventService;
    private currentSelectionId?: ISelectionId;
    private readonly emptySelectionId = {} as ISelectionId;
    private readonly documentCache = new Map<string, DocumentModel>();
    private readonly rowSelectionIds = new Map<string, ISelectionId>();
    private renderedKind: "none" | "landing" | "document" | "error" = "none";
    private renderedMarkdown?: string;
    private renderedModel?: DocumentModel;
    private searchQuery = "";
    private searchMatchIndex = 0;
    private formattingSettings = new VisualFormattingSettingsModel();
    private readonly formattingSettingsService: FormattingSettingsService;
    private readonly contextMenuHandler = (event: MouseEvent): void => {
        event.preventDefault();
        const eventTarget = event.target;
        const row = eventTarget instanceof Element
            ? eventTarget.closest<HTMLElement>("[data-selection-key]")
            : null;
        const isDocumentContent = eventTarget instanceof Node
            && eventTarget !== this.container
            && this.container.contains(eventTarget);
        const selectionId = row
            ? this.rowSelectionIds.get(row.dataset.selectionKey ?? "")
            : isDocumentContent
                ? this.currentSelectionId
                : this.emptySelectionId;
        void this.selectionManager.showContextMenu(selectionId ?? this.emptySelectionId, {
            x: event.clientX,
            y: event.clientY
        });
    };
    private readonly linkClickHandler = (event: MouseEvent): void => {
        if (event.button === 0) {
            this.activateSafeLink(event);
            this.activateInternalLink(event);
        }
        const row = this.getInteractiveRow(event.target);
        if (row) {
            this.selectRow(row, event.ctrlKey || event.metaKey);
        }
    };
    private readonly linkAuxClickHandler = (event: MouseEvent): void => {
        if (event.button === 1) {
            this.activateSafeLink(event);
        }
    };
    private readonly keyDownHandler = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            this.container.focus({ preventScroll: true });
            return;
        }
        if (
            event.key === "Enter"
            && event.target instanceof HTMLInputElement
            && event.target.matches("[data-document-search]")
        ) {
            this.moveSearchMatch(event.shiftKey ? -1 : 1, event.target);
            event.preventDefault();
            return;
        }
        if (event.key === "Enter" && event.target === this.container) {
            const firstControl = this.container.querySelector<HTMLElement>(
                "button, input, a[data-anchor-id], a[data-safe-href], summary, [data-selection-key]"
            );
            (firstControl ?? this.container).focus({ preventScroll: true });
            event.preventDefault();
            return;
        }
        if (event.key === "Enter" || event.key === " ") {
            this.activateSafeLink(event);
            this.activateInternalLink(event);
            const row = this.getInteractiveRow(event.target);
            if (row) {
                this.selectRow(row, event.ctrlKey || event.metaKey);
                event.preventDefault();
            }
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            this.moveSearchMatch(event.key === "ArrowDown" ? 1 : -1, event.target);
        }
    };
    private readonly inputHandler = (event: Event): void => {
        const input = event.target;
        if (input instanceof HTMLInputElement && input.matches("[data-document-search]")) {
            this.searchQuery = input.value;
            this.searchMatchIndex = 0;
            this.refreshSearchPresentation();
        }
    };
    private readonly clickControlHandler = (event: MouseEvent): void => {
        const target = event.target instanceof Element
            ? event.target.closest<HTMLElement>("[data-search-direction], [data-skip-document]")
            : null;
        if (!target) {
            return;
        }
        if (target.hasAttribute("data-skip-document")) {
            this.focusDocument();
            event.preventDefault();
            return;
        }
        const direction = target.getAttribute("data-search-direction");
        if (direction) {
            this.moveSearchMatch(direction === "next" ? 1 : -1, target);
            event.preventDefault();
        }
    };
    private readonly submitHandler = (event: Event): void => {
        const form = event.target;
        if (form instanceof HTMLFormElement && form.matches("[data-document-search-form]")) {
            event.preventDefault();
            this.moveSearchMatch(1, form);
        }
    };
    private readonly scrollHandler = (): void => {
        this.updateActiveOutline();
    };
    private readonly tooltipHandler = (event: MouseEvent): void => {
        const row = this.getInteractiveRow(event.target);
        const key = row?.dataset.selectionKey;
        const selectionId = key ? this.rowSelectionIds.get(key) : undefined;
        const tooltipService = this.host.tooltipService;
        if (!row || !selectionId || !tooltipService?.enabled()) {
            return;
        }
        tooltipService.show({
            coordinates: [event.clientX, event.clientY],
            isTouchEvent: false,
            dataItems: [{
                displayName: "Section",
                value: row.getAttribute("aria-label") ?? ""
            }],
            identities: [selectionId]
        });
    };
    private readonly tooltipMoveHandler = (event: MouseEvent): void => {
        const row = this.getInteractiveRow(event.target);
        const key = row?.dataset.selectionKey;
        const selectionId = key ? this.rowSelectionIds.get(key) : undefined;
        const tooltipService = this.host.tooltipService;
        if (selectionId && tooltipService?.enabled()) {
            tooltipService.move({
                coordinates: [event.clientX, event.clientY],
                isTouchEvent: false,
                identities: [selectionId]
            });
        }
    };
    private readonly tooltipLeaveHandler = (event: MouseEvent): void => {
        if (event.relatedTarget instanceof Node && this.container.contains(event.relatedTarget)) {
            return;
        }
        const tooltipService = this.host.tooltipService;
        if (tooltipService?.enabled()) {
            tooltipService.hide({ isTouchEvent: false, immediately: false });
        }
    };

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.selectionManager = this.host.createSelectionManager();
        this.eventService = this.host.eventService;
        this.formattingSettingsService = new FormattingSettingsService();

        this.container = document.createElement("div");
        this.container.className = "markdown-container";
        this.container.setAttribute("role", "document");
        this.container.setAttribute("aria-label", "Markdown content");
        this.container.setAttribute("tabindex", "0");
        this.target.appendChild(this.container);
        this.target.addEventListener("contextmenu", this.contextMenuHandler);
        this.container.addEventListener("click", this.linkClickHandler);
        this.container.addEventListener("click", this.clickControlHandler);
        this.container.addEventListener("auxclick", this.linkAuxClickHandler);
        this.container.addEventListener("keydown", this.keyDownHandler);
        this.container.addEventListener("input", this.inputHandler);
        this.container.addEventListener("submit", this.submitHandler);
        this.container.addEventListener("scroll", this.scrollHandler);
        this.container.addEventListener("mouseover", this.tooltipHandler);
        this.container.addEventListener("mousemove", this.tooltipMoveHandler);
        this.container.addEventListener("mouseleave", this.tooltipLeaveHandler);
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
        const dataView = options.dataViews?.[0];
        this.currentSelectionId = undefined;
        this.rowSelectionIds.clear();

        if (dataView) {
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel,
                dataView
            );
        } else {
            this.formattingSettings = new VisualFormattingSettingsModel();
        }

        if (!dataView) {
            this.showLandingPage();
            this.applyFormatting();
            return;
        }

        const structuredRows = this.readStructuredRows(dataView);
        if (structuredRows) {
            this.renderStructuredDocument(dataView, structuredRows);
            this.applyFormatting();
            return;
        }

        const markdownValue = dataView.single?.value;
        if (
            markdownValue === undefined
            || markdownValue === null
            || String(markdownValue).trim() === ""
        ) {
            this.showEmptyState();
            this.applyFormatting();
            return;
        }

        const markdownContent = String(markdownValue);
        this.currentSelectionId = this.createMeasureSelectionId(dataView);
        if (this.renderedKind === "document" && this.renderedMarkdown === markdownContent) {
            this.applyFormatting();
            return;
        }

        const model = this.getOrCreateDocumentModel(markdownContent);
        this.renderedMarkdown = markdownContent;
        this.renderedModel = model;
        this.renderDocumentModel(model);
        this.applyFormatting();
    }

    private getOrCreateDocumentModel(markdown: string): DocumentModel {
        const cached = this.documentCache.get(markdown);
        if (cached) {
            return cached;
        }
        const model = createDocumentModel(markdown, emojiMap);
        this.documentCache.set(markdown, model);
        while (this.documentCache.size > 4) {
            const oldest = this.documentCache.keys().next().value;
            if (oldest !== undefined) {
                this.documentCache.delete(oldest);
            }
        }
        return model;
    }

    private readStructuredRows(dataView: DataView): StructuredDocumentRow[] | undefined {
        const table = dataView.table;
        const columns = table?.columns ?? [];
        const rows = table?.rows ?? [];
        const indexFor = (role: string): number => columns.findIndex(
            (column) => column.roles?.[role]
        );
        const sectionIndex = indexFor("section");
        const titleIndex = indexFor("sectionTitle");
        const bodyIndex = indexFor("sectionBody");
        if (!table || sectionIndex < 0 || titleIndex < 0 || bodyIndex < 0) {
            return undefined;
        }

        const orderIndex = indexFor("sectionOrder");
        const kindIndex = indexFor("sectionKind");
        const statusIndex = indexFor("sectionStatus");
        const valueIndex = indexFor("sectionValue");
        const linkIndex = indexFor("sectionLink");
        const tooltipIndex = indexFor("tooltip");
        const structuredRows = rows.map((row, index) => {
            const read = (columnIndex: number): PrimitiveValue | undefined =>
                columnIndex < 0 ? undefined : row[columnIndex];
            const text = (columnIndex: number): string => this.formatValue(read(columnIndex));
            const rawStatus = text(statusIndex).toLowerCase();
            const status: StructuredDocumentRow["status"] =
                rawStatus === "good" || rawStatus === "warning" || rawStatus === "blocked"
                    ? rawStatus
                    : "unknown";
            const selectionId = this.createTableSelectionId(table, index);
            const sectionKey = text(sectionIndex) || `row-${index + 1}`;
            return {
                index,
                sectionKey,
                title: text(titleIndex),
                body: text(bodyIndex),
                kind: this.getRowKind(text(kindIndex)),
                status,
                value: valueIndex >= 0 ? text(valueIndex) : undefined,
                link: linkIndex >= 0 ? text(linkIndex) : undefined,
                order: this.getOrder(read(orderIndex)),
                selectionKey: `${sectionKey}-${index}`,
                tooltip: tooltipIndex >= 0 ? text(tooltipIndex) : undefined,
                selectionId
            };
        });
        structuredRows.sort((left, right) => {
            const leftOrder = left.order;
            const rightOrder = right.order;
            if (leftOrder !== undefined && rightOrder !== undefined && leftOrder !== rightOrder) {
                return leftOrder - rightOrder;
            }
            if (leftOrder === undefined && rightOrder !== undefined) {
                return 1;
            }
            if (leftOrder !== undefined && rightOrder === undefined) {
                return -1;
            }
            return left.sectionKey.localeCompare(right.sectionKey) || left.index - right.index;
        });
        structuredRows.forEach((row) => {
            if (row.selectionId) {
                this.rowSelectionIds.set(row.selectionKey ?? "", row.selectionId);
            }
        });
        return structuredRows.map(({ selectionId: _selectionId, ...row }) => row);
    }

    private createTableSelectionId(
        table: NonNullable<DataView["table"]>,
        rowIndex: number
    ): ISelectionId | undefined {
        return this.host.createSelectionIdBuilder()
            .withTable(table, rowIndex)
            .createSelectionId();
    }

    private getRowKind(value: string): StructuredDocumentRow["kind"] {
        return value === "callout" || value === "metric" || value === "table-row"
            ? value
            : "paragraph";
    }

    private getOrder(value: PrimitiveValue | undefined): number | undefined {
        return typeof value === "number" && Number.isFinite(value) ? value : undefined;
    }

    private formatValue(value: PrimitiveValue | undefined): string {
        if (value === null || value === undefined) {
            return "";
        }
        if (typeof value === "number" && !Number.isFinite(value)) {
            return "";
        }
        return String(value);
    }

    private renderStructuredDocument(
        _dataView: DataView,
        rows: StructuredDocumentRow[]
    ): void {
        const totalRows = rows.length;
        const model = createStructuredDocumentModel(rows, emojiMap, totalRows);
        this.renderedMarkdown = undefined;
        this.renderedModel = model;
        this.renderDocumentModel(model, rows);
    }

    private renderDocumentModel(
        model: DocumentModel,
        structuredRows: StructuredDocumentRow[] = []
    ): void {
        const readingState = this.captureReadingState();
        this.container.replaceChildren();
        this.rowSelectionIds.forEach((selectionId, key) => {
            const row = structuredRows.find((candidate) => candidate.selectionKey === key);
            if (!row) {
                this.rowSelectionIds.delete(key);
            } else {
                this.rowSelectionIds.set(key, selectionId);
            }
        });

        const titleId = `document-title-${model.id}`;
        const title = document.createElement(
            model.outline.some((entry) => entry.level === 1) ? "div" : "h1"
        );
        title.id = titleId;
        title.className = "document-title";
        if (title.tagName === "DIV") {
            title.setAttribute("role", "heading");
            title.setAttribute("aria-level", "1");
        }
        title.textContent = model.title;

        const toolbar = this.createToolbar(model);
        const skipLink = document.createElement("a");
        skipLink.className = "skip-link";
        skipLink.setAttribute("data-skip-document", "true");
        skipLink.setAttribute("role", "link");
        skipLink.setAttribute("tabindex", "0");
        skipLink.textContent = "Skip to document";

        const summary = document.createElement("div");
        summary.id = `${titleId}-summary`;
        summary.className = "document-summary";
        summary.textContent = model.summary;

        const outline = this.createOutline(model, titleId);
        const status = this.createTrustStatus(model);
        const content = document.createElement("main");
        content.id = "document-content";
        content.className = "document-content";
        content.setAttribute("aria-label", "Document content");
        content.setAttribute("tabindex", "-1");
        let activeRowKey: string | undefined;
        let activeRowWrapper: HTMLElement | undefined;
        model.blocks.forEach((block) => {
            const rendered = this.renderBlock(block, structuredRows);
            const row = structuredRows.find((candidate) => candidate.index === block.sourceRowIndex);
            if (rendered && row?.selectionKey) {
                if (row.selectionKey !== activeRowKey) {
                    activeRowKey = row.selectionKey;
                    activeRowWrapper = this.createStructuredRowWrapper(row);
                    content.appendChild(activeRowWrapper);
                }
                this.removeRowInteraction(rendered);
                activeRowWrapper?.appendChild(rendered);
            } else if (rendered) {
                activeRowKey = undefined;
                activeRowWrapper = undefined;
                content.appendChild(rendered);
            }
        });
        if (model.blocks.length === 0 && model.completeness === "partial") {
            const limited = document.createElement("p");
            limited.className = "limited-content";
            limited.textContent = "The document is limited by the certified rendering policy.";
            content.appendChild(limited);
        }

        const article = document.createElement("article");
        article.className = "document-surface";
        article.setAttribute("aria-labelledby", titleId);
        article.append(title, toolbar, skipLink, summary);
        if (outline) {
            article.appendChild(outline);
        }
        article.appendChild(content);
        if (status) {
            article.appendChild(status);
        }
        this.container.appendChild(article);
        this.container.setAttribute("aria-describedby", summary.id);
        this.renderedKind = "document";
        this.updateActiveOutline();
        this.restoreReadingState(readingState);
        this.refreshSearchPresentation(false);
    }

    private createToolbar(model: DocumentModel): HTMLElement {
        const toolbar = document.createElement("div");
        toolbar.className = "document-toolbar";
        toolbar.setAttribute("role", "toolbar");
        toolbar.setAttribute("aria-label", "Document tools");

        if (this.formattingSettings.document?.showSearch?.value !== false) {
            const form = document.createElement("form");
            form.className = "document-search";
            form.setAttribute("role", "search");
            form.setAttribute("aria-label", "Search document");
            form.setAttribute("data-document-search-form", "true");

            const label = document.createElement("label");
            label.setAttribute("for", "document-search-input");
            label.textContent = "Search";
            const input = document.createElement("input");
            input.id = "document-search-input";
            input.type = "search";
            input.setAttribute("data-document-search", "true");
            input.setAttribute("autocomplete", "off");
            input.value = this.searchQuery;
            input.setAttribute("aria-controls", "document-content");
            const previous = this.createButton("Previous match", "previous");
            const next = this.createButton("Next match", "next");
            form.append(label, input, previous, next);
            toolbar.appendChild(form);
        }

        const result = document.createElement("span");
        result.className = "search-result";
        result.setAttribute("data-search-result", "true");
        result.textContent = model.searchIndex.length > 0 ? "Search this document" : "No indexed content";
        toolbar.appendChild(result);
        const live = document.createElement("span");
        live.className = "sr-only";
        live.setAttribute("data-search-live", "true");
        live.setAttribute("aria-live", "polite");
        live.setAttribute("aria-atomic", "true");
        toolbar.appendChild(live);
        return toolbar;
    }

    private createButton(label: string, direction: "previous" | "next"): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "document-tool-button";
        button.setAttribute("data-search-direction", direction);
        button.setAttribute("aria-label", label);
        button.textContent = direction === "next" ? "Next" : "Previous";
        return button;
    }

    private createOutline(model: DocumentModel, titleId: string): HTMLElement | undefined {
        if (model.outline.length === 0 || this.formattingSettings.document?.showOutline?.value === false) {
            return undefined;
        }
        const nav = document.createElement("nav");
        nav.className = "document-outline";
        nav.setAttribute("aria-label", "Document outline");
        const heading = document.createElement("h2");
        heading.textContent = "Outline";
        const list = document.createElement("ol");
        model.outline.forEach((entry) => {
            const item = document.createElement("li");
            item.className = `outline-level-${Math.min(entry.level, 6)}`;
            const link = document.createElement("a");
            link.setAttribute("data-anchor-id", entry.id);
            link.setAttribute("data-focus-key", `outline:${entry.key}`);
            link.setAttribute("role", "link");
            link.setAttribute("tabindex", "0");
            link.setAttribute("aria-describedby", titleId);
            link.textContent = entry.text;
            item.appendChild(link);
            list.appendChild(item);
        });
        nav.append(heading, list);
        return nav;
    }

    private createTrustStatus(model: DocumentModel): HTMLElement | undefined {
        if (this.formattingSettings.document?.showTrustStatus?.value === false) {
            return undefined;
        }
        const aside = document.createElement("aside");
        aside.className = `trust-status trust-${model.completeness}`;
        aside.setAttribute("aria-label", "Document status");
        const details = document.createElement("details");
        details.open = true;
        const summary = document.createElement("summary");
        summary.textContent = model.completeness === "complete"
            ? "Local document - complete"
            : "Document status - limited or blocked";
        details.appendChild(summary);
        const statusText = document.createElement("p");
        statusText.textContent = model.completeness === "complete"
            ? "All accepted content is available for the current filter context."
            : "Some content was limited or blocked by the certified local policy.";
        details.appendChild(statusText);
        if (model.source.loadedRows !== undefined && model.source.totalRows !== undefined) {
            const rowCount = document.createElement("p");
            rowCount.textContent = `Showing ${model.source.loadedRows} of ${model.source.totalRows} structured rows.`;
            details.appendChild(rowCount);
        }
        const exportNotice = document.createElement("p");
        exportNotice.textContent =
            "Report export captures the visible visual viewport; scrolling does not create additional PDF pages.";
        details.appendChild(exportNotice);
        if (model.diagnostics.length > 0) {
            const list = document.createElement("ul");
            model.diagnostics.forEach((diagnostic) => {
                const item = document.createElement("li");
                item.textContent = `${diagnostic.count} ${diagnostic.message}`;
                list.appendChild(item);
            });
            details.appendChild(list);
        }
        aside.appendChild(details);
        return aside;
    }

    private createStructuredRowWrapper(row: StructuredDocumentRow): HTMLElement {
        const wrapper = document.createElement("article");
        wrapper.className = `structured-row structured-${row.kind}`;
        wrapper.setAttribute("data-selection-key", row.selectionKey ?? "");
        wrapper.setAttribute("tabindex", "0");
        wrapper.setAttribute("role", "article");
        wrapper.setAttribute("aria-label", row.title || `Section ${row.index + 1}`);
        if (row.tooltip) {
            wrapper.title = row.tooltip;
        }
        return wrapper;
    }

    private removeRowInteraction(element: HTMLElement): void {
        element.classList.remove(
            "structured-row",
            "structured-paragraph",
            "structured-callout",
            "structured-metric",
            "structured-table-row"
        );
        element.removeAttribute("data-selection-key");
        element.removeAttribute("tabindex");
        element.removeAttribute("role");
        element.removeAttribute("title");
    }

    private renderBlock(
        block: DocumentBlock,
        structuredRows: StructuredDocumentRow[]
    ): HTMLElement | undefined {
        let element: HTMLElement;
        switch (block.type) {
            case "heading":
                element = document.createElement(`h${block.level}`);
                element.id = block.anchorId ?? block.key;
                element.setAttribute("tabindex", "-1");
                this.appendInline(element, block.children, block.key);
                break;
            case "paragraph":
                element = document.createElement("p");
                this.appendInline(element, block.children, block.key);
                break;
            case "quote":
                element = document.createElement("blockquote");
                block.children.forEach((child) => {
                    const childElement = this.renderBlock(child, structuredRows);
                    if (childElement) {
                        element.appendChild(childElement);
                    }
                });
                break;
            case "list":
                element = document.createElement(block.ordered ? "ol" : "ul");
                if (block.start !== undefined && Number.isFinite(block.start)) {
                    element.setAttribute("start", String(block.start));
                }
                block.items.forEach((item) => {
                    const listItem = document.createElement("li");
                    listItem.setAttribute("data-block-key", item.key);
                    this.appendInline(listItem, item.children, item.key);
                    item.nested?.forEach((nested) => {
                        const nestedElement = this.renderBlock(nested, structuredRows);
                        if (nestedElement) {
                            listItem.appendChild(nestedElement);
                        }
                    });
                    element.appendChild(listItem);
                });
                break;
            case "code": {
                element = document.createElement("pre");
                element.setAttribute("tabindex", "0");
                element.setAttribute("data-focus-key", `code:${block.key}`);
                element.setAttribute("data-block-key", block.key);
                const language = block.language && hljs.getLanguage(block.language)
                    ? block.language
                    : undefined;
                element.setAttribute("aria-label", language
                    ? `${language} code block`
                    : "Code block");
                const codeElement = document.createElement("code");
                if (language) {
                    codeElement.classList.add(`language-${language}`);
                }
                const highlighted = this.createHighlightedFragment(block.code, language);
                codeElement.appendChild(highlighted);
                codeElement.classList.add("hljs");
                element.appendChild(codeElement);
                break;
            }
            case "table": {
                const wrapper = document.createElement("div");
                wrapper.className = "table-scroll";
                element = document.createElement("table");
                element.setAttribute("data-block-key", block.key);
                const caption = document.createElement("caption");
                caption.textContent = block.caption;
                element.appendChild(caption);
                const thead = document.createElement("thead");
                const headerRow = document.createElement("tr");
                block.headers.forEach((header) => {
                    const th = document.createElement("th");
                    th.setAttribute("scope", "col");
                    this.appendInline(th, header, block.key);
                    headerRow.appendChild(th);
                });
                if (block.headers.length > 0) {
                    thead.appendChild(headerRow);
                    element.appendChild(thead);
                }
                const tbody = document.createElement("tbody");
                block.rows.forEach((row, rowIndex) => {
                    const tr = document.createElement("tr");
                    tr.setAttribute("data-block-key", `${block.key}-row-${rowIndex}`);
                    row.forEach((cell) => {
                        const td = document.createElement("td");
                        this.appendInline(td, cell, `${block.key}-row-${rowIndex}`);
                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                });
                element.appendChild(tbody);
                wrapper.appendChild(element);
                return wrapper;
            }
            case "disclosure":
                const details = document.createElement("details");
                details.open = block.open;
                element = details;
                element.setAttribute("data-block-key", block.key);
                const summary = document.createElement("summary");
                summary.setAttribute("data-focus-key", `summary:${block.key}`);
                this.appendInline(summary, block.summary, block.key);
                element.appendChild(summary);
                block.children.forEach((child) => {
                    const childElement = this.renderBlock(child, structuredRows);
                    if (childElement) {
                        element.appendChild(childElement);
                    }
                });
                break;
            case "status":
                element = document.createElement("aside");
                element.className = `status-block status-${block.status}`;
                element.setAttribute("aria-label", `${block.label} status`);
                const statusLabel = document.createElement("strong");
                statusLabel.textContent = block.label;
                const statusText = document.createElement("p");
                this.appendInline(statusText, block.children, block.key);
                element.append(statusLabel, statusText);
                break;
            case "rule":
                element = document.createElement("hr");
                break;
            default:
                return undefined;
        }
        element.setAttribute("data-block-key", block.key);
        const row = structuredRows.find((candidate) => candidate.index === block.sourceRowIndex);
        if (row?.selectionKey) {
            element.classList.add("structured-row");
            element.setAttribute("data-selection-key", row.selectionKey);
            element.setAttribute("tabindex", "0");
            element.setAttribute("role", "article");
            if (row.tooltip) {
                element.title = row.tooltip;
            }
        }
        return element;
    }

    private appendInline(parent: HTMLElement, nodes: InlineNode[], blockKey: string): void {
        nodes.forEach((node) => {
            switch (node.type) {
                case "text":
                    this.appendSearchableText(parent, node.text, blockKey);
                    break;
                case "strong": {
                    const element = document.createElement("strong");
                    this.appendInline(element, node.children, blockKey);
                    parent.appendChild(element);
                    break;
                }
                case "emphasis": {
                    const element = document.createElement("em");
                    this.appendInline(element, node.children, blockKey);
                    parent.appendChild(element);
                    break;
                }
                case "delete": {
                    const element = document.createElement("del");
                    this.appendInline(element, node.children, blockKey);
                    parent.appendChild(element);
                    break;
                }
                case "code": {
                    const element = document.createElement("code");
                    element.textContent = node.text;
                    parent.appendChild(element);
                    break;
                }
                case "break":
                    parent.appendChild(document.createElement("br"));
                    break;
                case "link":
                    this.appendLink(parent, node, blockKey);
                    break;
            }
        });
    }

    private appendSearchableText(parent: HTMLElement, text: string, blockKey: string): void {
        const query = this.searchQuery.trim().toLocaleLowerCase();
        if (!query || !text.toLocaleLowerCase().includes(query)) {
            parent.appendChild(document.createTextNode(text));
            return;
        }
        let remaining = text;
        while (remaining.length > 0) {
            const index = remaining.toLocaleLowerCase().indexOf(query);
            if (index < 0) {
                parent.appendChild(document.createTextNode(remaining));
                break;
            }
            if (index > 0) {
                parent.appendChild(document.createTextNode(remaining.slice(0, index)));
            }
            const mark = document.createElement("mark");
            mark.setAttribute("data-search-block", blockKey);
            mark.textContent = remaining.slice(index, index + query.length);
            parent.appendChild(mark);
            remaining = remaining.slice(index + query.length);
        }
    }

    private appendLink(parent: HTMLElement, node: Extract<InlineNode, { type: "link" }>, blockKey: string): void {
        if (!node.safe || !node.href) {
            const unsupported = document.createElement("span");
            unsupported.className = "unsupported-link";
            unsupported.title = UNSUPPORTED_LINK_REASON;
            this.appendInline(unsupported, node.children, blockKey);
            const reason = document.createElement("span");
            reason.className = "unsupported-link-reason";
            reason.textContent = UNSUPPORTED_LINK_TEXT;
            unsupported.appendChild(reason);
            parent.appendChild(unsupported);
            return;
        }
        const anchor = document.createElement("a");
        anchor.setAttribute("data-safe-href", node.href);
        anchor.setAttribute("data-focus-key", `link:${node.href}`);
        anchor.setAttribute("role", "link");
        anchor.setAttribute("tabindex", "0");
        anchor.setAttribute("title", `Open HTTPS link to ${new URL(node.href).hostname}`);
        this.appendInline(anchor, node.children, blockKey);
        parent.appendChild(anchor);
    }

    private createHighlightedFragment(source: string, language?: string): DocumentFragment {
        const highlightedHtml = language
            ? hljs.highlight(source, { language, ignoreIllegals: true }).value
            : hljs.highlightAuto(source).value;
        const sanitizedHtml = DOMPurify.sanitize(highlightedHtml, {
            ALLOWED_TAGS: ["span"],
            ALLOWED_ATTR: ["class"],
            ALLOW_DATA_ATTR: false
        });
        const parsedDocument = new DOMParser().parseFromString(sanitizedHtml, "text/html");
        const fragment = document.createDocumentFragment();
        parsedDocument.body.childNodes.forEach((node) => {
            const imported = document.importNode(node, true);
            if (imported instanceof Element && imported.matches("[class]")) {
                this.restrictHighlightClasses(imported);
            }
            fragment.appendChild(imported);
        });
        this.restrictHighlightClasses(fragment);
        return fragment;
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

    private activateInternalLink(event: Event): void {
        const eventTarget = event.target;
        if (!(eventTarget instanceof Element)) {
            return;
        }
        const link = eventTarget.closest<HTMLElement>("a[data-anchor-id]");
        if (!link || !this.container.contains(link)) {
            return;
        }
        event.preventDefault();
        const id = link.getAttribute("data-anchor-id");
        const destination = id ? this.container.querySelector<HTMLElement>(`#${id}`) : null;
        if (destination) {
            this.scrollIntoView(destination, "start");
            this.updateActiveOutline(id);
            destination.focus?.({ preventScroll: true });
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

    private getInteractiveRow(target: EventTarget | null): HTMLElement | null {
        return target instanceof Element
            ? target.closest<HTMLElement>("[data-selection-key]")
            : null;
    }

    private selectRow(row: HTMLElement, multiSelect: boolean): void {
        const key = row.dataset.selectionKey;
        const selectionId = key ? this.rowSelectionIds.get(key) : undefined;
        if (!selectionId) {
            return;
        }
        const manager = this.selectionManager as ISelectionManager & {
            select?: (id: ISelectionId, multiSelect?: boolean) => Promise<unknown>;
        };
        if (typeof manager.select === "function") {
            void manager.select(selectionId, multiSelect);
        }
        this.container.querySelectorAll("[data-selection-key]").forEach((candidate) => {
            candidate.classList.toggle("selected", candidate === row);
            if (candidate === row) {
                candidate.setAttribute("aria-selected", "true");
            } else {
                candidate.removeAttribute("aria-selected");
            }
        });
    }

    private refreshSearchPresentation(restoreFocus = true): void {
        const model = this.renderedModel;
        if (!model || this.renderedKind !== "document") {
            return;
        }
        const matches = findSearchMatches(model, this.searchQuery);
        if (matches.length > 0) {
            this.searchMatchIndex = Math.min(this.searchMatchIndex, matches.length - 1);
        } else {
            this.searchMatchIndex = 0;
        }
        const result = this.container.querySelector<HTMLElement>("[data-search-result]");
        if (result) {
            result.textContent = this.searchQuery.trim()
                ? matches.length === 0
                    ? "No matches"
                    : `${this.searchMatchIndex + 1} of ${matches.length} matches`
                : "Search this document";
        }
        const live = this.container.querySelector<HTMLElement>("[data-search-live]");
        if (live) {
            live.textContent = this.searchQuery.trim()
                ? matches.length === 0
                    ? "No matches found."
                    : `${this.searchMatchIndex + 1} of ${matches.length} matches.`
                : "";
        }
        this.clearSearchMarks();
        this.applySearchMarks();
        const current = matches[this.searchMatchIndex];
        this.container.querySelectorAll<HTMLElement>("mark[data-search-block]").forEach((mark) => {
            mark.classList.toggle("current-match", mark.getAttribute("data-search-block") === current?.key);
        });
        this.container.querySelectorAll<HTMLElement>("[data-anchor-id]").forEach((entry) => {
            entry.removeAttribute("aria-current");
        });
        if (restoreFocus && this.searchQuery.trim()) {
            const input = this.container.querySelector<HTMLInputElement>("[data-document-search]");
            if (input) {
                input.focus({ preventScroll: true });
            }
        }
        if (current) {
            const target = this.container.querySelector<HTMLElement>(
                `[data-block-key="${current.key}"]`
            );
            if (target) {
                this.scrollIntoView(target, "nearest");
            }
        }
    }

    private scrollIntoView(element: HTMLElement, block: ScrollLogicalPosition): void {
        if (typeof element.scrollIntoView === "function") {
            element.scrollIntoView({ block });
        }
    }

    private clearSearchMarks(): void {
        this.container.querySelectorAll<HTMLElement>("mark[data-search-block]").forEach((mark) => {
            mark.replaceWith(document.createTextNode(mark.textContent ?? ""));
        });
    }

    private applySearchMarks(): void {
        const query = this.searchQuery.trim();
        if (!query) {
            return;
        }
        const content = this.container.querySelector("#document-content");
        if (!content) {
            return;
        }
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        const textNodes: Text[] = [];
        let current = walker.nextNode();
        while (current) {
            const parent = current.parentElement;
            if (parent && !parent.closest("code, pre, script, style")) {
                textNodes.push(current as Text);
            }
            current = walker.nextNode();
        }
        const normalizedQuery = query.toLocaleLowerCase();
        textNodes.forEach((textNode) => {
            const text = textNode.data;
            const normalized = text.toLocaleLowerCase();
            if (!normalized.includes(normalizedQuery)) {
                return;
            }
            const block = textNode.parentElement?.closest<HTMLElement>("[data-block-key]");
            const blockKey = block?.getAttribute("data-block-key") ?? "";
            const fragment = document.createDocumentFragment();
            let offset = 0;
            while (offset < text.length) {
                const index = normalized.indexOf(normalizedQuery, offset);
                if (index < 0) {
                    fragment.appendChild(document.createTextNode(text.slice(offset)));
                    break;
                }
                if (index > offset) {
                    fragment.appendChild(document.createTextNode(text.slice(offset, index)));
                }
                const mark = document.createElement("mark");
                mark.setAttribute("data-search-block", blockKey);
                mark.textContent = text.slice(index, index + query.length);
                fragment.appendChild(mark);
                offset = index + query.length;
            }
            textNode.replaceWith(fragment);
        });
    }

    private moveSearchMatch(direction: number, target: EventTarget | null): void {
        if (!(target instanceof Element) || !target.closest("[data-document-search-form]")) {
            return;
        }
        const model = this.renderedModel;
        if (!model) {
            return;
        }
        const matches = findSearchMatches(model, this.searchQuery);
        if (matches.length === 0) {
            this.refreshSearchPresentation();
            return;
        }
        this.searchMatchIndex = (this.searchMatchIndex + direction + matches.length) % matches.length;
        this.refreshSearchPresentation();
    }

    private focusDocument(): void {
        const content = this.container.querySelector<HTMLElement>("#document-content");
        (content ?? this.container).focus({ preventScroll: true });
    }

    private updateActiveOutline(activeId?: string): void {
        const links = this.container.querySelectorAll<HTMLElement>("[data-anchor-id]");
        if (links.length === 0) {
            return;
        }
        const id = activeId ?? this.container.querySelector<HTMLElement>(
            "#document-content h1, #document-content h2, #document-content h3"
        )?.id;
        links.forEach((link) => {
            if (link.getAttribute("data-anchor-id") === id) {
                link.setAttribute("aria-current", "location");
            } else {
                link.removeAttribute("aria-current");
            }
        });
    }

    private captureReadingState(): ReadingState {
        const activeElement = document.activeElement;
        return {
            scrollTop: this.container.scrollTop,
            focusKey: activeElement instanceof HTMLElement
                && activeElement !== this.container
                && this.container.contains(activeElement)
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
                "[data-focus-key], [data-selection-key]"
            )).find((candidate) => this.getFocusKey(candidate) === state.focusKey);
            (focusTarget ?? this.container).focus({ preventScroll: true });
        }
        this.container.scrollTop = state.scrollTop;
    }

    private getFocusKey(element: HTMLElement): string {
        const focusKey = element.getAttribute("data-focus-key");
        if (focusKey) {
            return focusKey;
        }
        return element.dataset.selectionKey ? `row:${element.dataset.selectionKey}` : element.id;
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
        heading.textContent = "Atlyn Document";
        const instructions = document.createElement("p");
        instructions.textContent = "Add a measure containing markdown text.";
        const supportedFeatures = document.createElement("p");
        supportedFeatures.textContent =
            "Supports semantic headings, outline navigation, local search, tables, code, and safe HTTPS links.";
        landingPage.append(heading, instructions, supportedFeatures);
        this.container.replaceChildren(landingPage);
        this.container.removeAttribute("aria-describedby");
        this.renderedKind = "landing";
        this.renderedMarkdown = undefined;
        this.renderedModel = createEmptyDocumentModel();
    }

    private showEmptyState(): void {
        this.showLandingPage();
        const instructions = this.container.querySelector(".landing-page p");
        if (instructions) {
            instructions.textContent = "No document content is available for the current filter context.";
        }
    }

    private showError(reason: string): void {
        this.currentSelectionId = undefined;
        this.renderedModel = undefined;
        this.container.replaceChildren();
        this.renderedKind = "error";
        this.renderedMarkdown = undefined;
        const errorContainer = document.createElement("div");
        errorContainer.className = "error";
        errorContainer.setAttribute("role", "alert");
        const label = document.createElement("strong");
        label.textContent = "Error: ";
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
        const fontColor = isHighContrast ? colorPalette.foreground.value : configuredFontColor;
        const backgroundColor = isHighContrast
            ? colorPalette.background.value
            : configuredBackgroundColor;
        const themeAccentColor = colorPalette.getColor("Atlyn Document").value;
        const accentColor = isHighContrast
            ? colorPalette.foreground.value
            : themeAccentColor || DEFAULT_ACCENT_COLOR;
        const linkColor = isHighContrast
            ? colorPalette.hyperlink.value
            : themeAccentColor || DEFAULT_ACCENT_COLOR;
        const borderColor = isHighContrast
            ? colorPalette.foreground.value
            : DEFAULT_BORDER_COLOR;
        const fontSize = this.getSafePixelValue(settings.fontSize?.value, DEFAULT_FONT_SIZE, 1);
        const padding = this.getSafePixelValue(settings.padding?.value, DEFAULT_PADDING, 0);

        this.container.classList.toggle("high-contrast", isHighContrast);
        this.container.classList.toggle(
            "reduced-motion",
            this.formattingSettings.document?.reducedMotion?.value === true
        );
        this.container.classList.toggle(
            "compact-mode",
            this.formattingSettings.document?.compactMode?.value === true
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
        this.container.style.setProperty("--code-bg", isHighContrast ? backgroundColor : "#F3F4F6");
        this.container.style.setProperty("--pre-bg", isHighContrast ? backgroundColor : "#1F2937");
        this.container.style.setProperty("--pre-text", isHighContrast ? fontColor : "#F9FAFB");
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
        this.container.removeEventListener("click", this.clickControlHandler);
        this.container.removeEventListener("auxclick", this.linkAuxClickHandler);
        this.container.removeEventListener("keydown", this.keyDownHandler);
        this.container.removeEventListener("input", this.inputHandler);
        this.container.removeEventListener("submit", this.submitHandler);
        this.container.removeEventListener("scroll", this.scrollHandler);
        this.container.removeEventListener("mouseover", this.tooltipHandler);
        this.container.removeEventListener("mousemove", this.tooltipMoveHandler);
        this.container.removeEventListener("mouseleave", this.tooltipLeaveHandler);
        this.documentCache.clear();
        this.rowSelectionIds.clear();
    }
}

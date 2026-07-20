/*
*  Power BI Visual CLI - Markdown Viewer with Syntax Highlighting + Emoji
*  MIT License
*/
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import DataView = powerbi.DataView;
import ISelectionId = powerbi.visuals.ISelectionId;

import { VisualFormattingSettingsModel } from "./settings";

const DEFAULT_ACCENT_COLOR = "#118DFF";
const DEFAULT_BACKGROUND_COLOR = "#FFFFFF";
const DEFAULT_BORDER_COLOR = "#E5E7EB";
const DEFAULT_FONT_FAMILY = "Segoe UI, sans-serif";
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_PADDING = 20;
const DEFAULT_TEXT_COLOR = "#111827";

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

export class Visual implements IVisual {
    private target: HTMLElement;
    private container: HTMLElement;
    private host: IVisualHost;
    private selectionManager: ISelectionManager;
    private eventService: IVisualEventService;
    private currentSelectionId?: ISelectionId;
    private readonly emptySelectionId = {} as ISelectionId;
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
        this.formattingSettingsService = new FormattingSettingsService();
        
        this.container = document.createElement("div");
        this.container.className = "markdown-container";
        this.container.setAttribute("role", "document");
        this.container.setAttribute("aria-label", "Markdown content");
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
        const dataView: DataView = options.dataViews?.[0];
        this.currentSelectionId = undefined;

        if (dataView) {
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                VisualFormattingSettingsModel, dataView
            );
        }

        this.container.replaceChildren();

        if (!dataView) {
            this.showLandingPage();
            this.applyFormatting();
            return;
        }

        const markdownValue = dataView.single?.value;
        if (markdownValue === undefined || markdownValue === null || String(markdownValue).trim() === "") {
            this.showLandingPage();
            this.applyFormatting();
            return;
        }

        const markdownContent = this.processEmojis(String(markdownValue));
        const rawHtml = marked.parse(markdownContent) as string;
        const safeFragment = this.createSafeFragment(rawHtml);

        this.prepareSafeLinks(safeFragment);
        this.applySyntaxHighlighting(safeFragment);
        this.container.replaceChildren(safeFragment);
        this.currentSelectionId = this.createMeasureSelectionId(dataView);
        this.applyFormatting();
    }

    private processEmojis(text: string): string {
        return text.replace(/:[\w_]+:/g, (match) => emojiMap[match] || match);
    }

    private createSafeFragment(rawHtml: string): DocumentFragment {
        const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
            ALLOWED_TAGS: [
                "a", "blockquote", "br", "code", "del", "details", "em",
                "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li", "ol",
                "p", "pre", "strong", "summary", "table", "tbody", "td",
                "th", "thead", "tr", "ul"
            ],
            ALLOWED_ATTR: [
                "align", "class", "colspan", "href", "id", "open", "rel",
                "reversed", "rowspan", "scope", "start", "target", "title"
            ],
            ALLOW_DATA_ATTR: false,
            FORBID_ATTR: ["background"]
        });
        const fragment = this.parseHtmlFragment(sanitizedHtml);
        this.restrictInputClasses(fragment);
        return fragment;
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
        const fragment = this.parseHtmlFragment(sanitizedHtml);
        this.restrictHighlightClasses(fragment);
        return fragment;
    }

    private restrictInputClasses(root: ParentNode): void {
        root.querySelectorAll("[class]").forEach((element) => {
            const language = element.matches("pre > code")
                ? this.getValidatedLanguage(element)
                : undefined;

            element.removeAttribute("class");
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

    private parseHtmlFragment(sanitizedHtml: string): DocumentFragment {
        const parsedDocument = new DOMParser().parseFromString(sanitizedHtml, "text/html");
        const fragment = document.createDocumentFragment();

        parsedDocument.body.childNodes.forEach((node) => {
            fragment.appendChild(document.importNode(node, true));
        });

        return fragment;
    }

    private prepareSafeLinks(root: ParentNode): void {
        root.querySelectorAll("a[href]").forEach((link) => {
            const anchor = link as HTMLAnchorElement;
            const href = this.getSafeHttpsUrl(anchor.getAttribute("href") ?? "");

            if (!href) {
                anchor.removeAttribute("href");
                anchor.removeAttribute("data-safe-href");
                anchor.removeAttribute("role");
                anchor.removeAttribute("tabindex");
                anchor.removeAttribute("target");
                anchor.removeAttribute("rel");
                anchor.removeAttribute("referrerpolicy");
                return;
            }

            anchor.removeAttribute("href");
            anchor.setAttribute("data-safe-href", href);
            anchor.setAttribute("role", "link");
            anchor.setAttribute("tabindex", "0");
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
        heading.textContent = "Atlyn Markdown Viewer";

        const instructions = document.createElement("p");
        instructions.textContent = "Add a measure containing markdown text.";

        const supportedFeatures = document.createElement("p");
        supportedFeatures.textContent = "Supports headers, lists, tables, code blocks, and emoji shortcodes.";

        landingPage.append(heading, instructions, supportedFeatures);
        this.container.replaceChildren(landingPage);
    }

    private showError(reason: string): void {
        this.currentSelectionId = undefined;
        this.container.replaceChildren();

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
        const fontColor = isHighContrast
            ? colorPalette.foreground.value
            : configuredFontColor;
        const backgroundColor = isHighContrast
            ? colorPalette.background.value
            : configuredBackgroundColor;
        const accentColor = isHighContrast
            ? colorPalette.foreground.value
            : DEFAULT_ACCENT_COLOR;
        const linkColor = isHighContrast
            ? colorPalette.hyperlink.value
            : DEFAULT_ACCENT_COLOR;
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

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
    private formattingSettings: VisualFormattingSettingsModel;
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
        this.target.appendChild(this.container);
        this.target.addEventListener("contextmenu", this.contextMenuHandler);
        
        marked.setOptions({ gfm: true, breaks: true });
    }

    public update(options: VisualUpdateOptions): void {
        this.eventService.renderingStarted(options);

        try {
            this.render(options);
            this.eventService.renderingFinished(options);
        } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            this.showError(reason);
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
            USE_PROFILES: { html: true },
            FORBID_TAGS: [
                "audio", "base", "button", "embed", "form", "iframe", "img",
                "input", "link", "meta", "object", "option", "select", "source",
                "style", "textarea", "track", "video"
            ],
            FORBID_ATTR: ["formaction", "poster", "src", "srcset", "style"]
        });
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
            const href = anchor.getAttribute("href")?.trim() ?? "";

            if (!/^https:\/\//i.test(href)) {
                anchor.removeAttribute("href");
                anchor.removeAttribute("target");
                anchor.removeAttribute("rel");
                anchor.removeAttribute("referrerpolicy");
                return;
            }

            anchor.target = "_blank";
            anchor.rel = "noopener noreferrer";
            anchor.setAttribute("referrerpolicy", "no-referrer");
        });
    }

    private applySyntaxHighlighting(root: ParentNode): void {
        root.querySelectorAll("pre code").forEach((block) => {
            hljs.highlightElement(block as HTMLElement);
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

        const label = document.createElement("strong");
        label.textContent = "Error: ";

        errorContainer.append(label, document.createTextNode(reason));
        this.container.appendChild(errorContainer);
    }

    private applyFormatting() {
        if (!this.formattingSettings?.markdownCard) return;
        const s = this.formattingSettings.markdownCard;
        if (s.fontFamily?.value) this.container.style.fontFamily = s.fontFamily.value;
        if (s.fontSize?.value) this.container.style.fontSize = s.fontSize.value + "px";
        if (s.fontColor?.value?.value) this.container.style.color = s.fontColor.value.value;
        if (s.backgroundColor?.value?.value) this.container.style.backgroundColor = s.backgroundColor.value.value;
        if (s.padding?.value !== undefined) this.container.style.padding = s.padding.value + "px";
        if (s.showBorder?.value) {
            this.container.style.border = "1px solid #E5E7EB";
            this.container.style.borderRadius = "8px";
        } else {
            this.container.style.border = "none";
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public destroy(): void {
        this.target.removeEventListener("contextmenu", this.contextMenuHandler);
    }
}

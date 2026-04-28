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
import DataView = powerbi.DataView;

import { VisualFormattingSettingsModel } from "./settings";

type PaletteFill = { value?: string; solid?: { color?: string } } | string | undefined | null;

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
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.formattingSettingsService = new FormattingSettingsService();
        
        this.container = document.createElement("div");
        this.container.className = "markdown-container";
        this.container.setAttribute("role", "document");
        this.container.setAttribute("aria-label", "Markdown content");
        this.target.appendChild(this.container);
        
        marked.setOptions({ gfm: true, breaks: true });
    }

    public update(options: VisualUpdateOptions) {
        try {
            const dataView: DataView = options.dataViews?.[0];
            if (dataView) {
                this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(
                    VisualFormattingSettingsModel, dataView
                );
            }

            this.applyTheme(dataView);
            this.container.replaceChildren();

            if (!dataView) {
                this.showLandingPage();
                this.applyFormatting();
                return;
            }

            let markdownContent = "";
            if (dataView.single?.value !== undefined && dataView.single?.value !== null) {
                markdownContent = String(dataView.single.value);
            }

            if (!markdownContent || markdownContent.trim() === "") {
                this.showLandingPage();
                this.applyFormatting();
                return;
            }

            // Process emojis first
            markdownContent = this.processEmojis(markdownContent);

            // Parse markdown, then sanitize BEFORE syntax highlighting / DOM insertion.
            // DOMPurify defaults remove <script>, inline event handlers (onerror/onclick/...),
            // javascript: URLs, and other XSS vectors, while preserving expected markdown
            // output (headers, lists, tables, code blocks, inline formatting).
            const rawHtml = marked.parse(markdownContent) as string;
            const safeFragment = DOMPurify.sanitize(rawHtml, {
                ADD_ATTR: ["target", "rel"],
                RETURN_DOM_FRAGMENT: true
            }) as unknown as DocumentFragment;

            this.prepareSafeLinks(safeFragment);
            this.applySyntaxHighlighting(safeFragment);

            this.container.replaceChildren(safeFragment);
            this.applyFormatting();
        } catch (error) {
            this.container.replaceChildren();
            const errDiv = document.createElement("div");
            errDiv.className = "error";
            const strong = document.createElement("strong");
            strong.textContent = "Error: ";
            errDiv.appendChild(strong);
            errDiv.appendChild(document.createTextNode(String(error)));
            this.container.appendChild(errDiv);
        }
    }

    private processEmojis(text: string): string {
        return text.replace(/:[\w_]+:/g, (match) => emojiMap[match] || match);
    }

    private applySyntaxHighlighting(root: ParentNode): void {
        try {
            root.querySelectorAll("pre code").forEach((block) => {
                hljs.highlightElement(block as HTMLElement);
            });
        } catch (e) {
            // Sanitized markdown remains readable even if highlighting fails.
        }
    }

    private prepareSafeLinks(root: ParentNode): void {
        root.querySelectorAll("a[href]").forEach((link) => {
            const anchor = link as HTMLAnchorElement;
            const href = anchor.getAttribute("href") || "";
            if (/^https?:\/\//i.test(href)) {
                anchor.target = "_blank";
                anchor.rel = "noopener noreferrer";
                anchor.referrerPolicy = "no-referrer";
            }
        });
    }

    private showLandingPage() {
        const wrapper = document.createElement("div");
        wrapper.className = "landing-page";

        const heading = document.createElement("h2");
        heading.textContent = "Atlyn Markdown";

        const intro = document.createElement("p");
        intro.textContent = "Add a text measure to the Markdown Content field well to render governed report notes, instructions, or definitions.";

        const list = document.createElement("ul");
        [
            "Supports GitHub Flavored Markdown: headings, lists, tables, links, blockquotes, and code blocks.",
            "Sanitizes markdown locally before display; no external services are called.",
            "Uses Power BI theme and high-contrast colors by default, with optional Format pane overrides."
        ].forEach((text) => {
            const item = document.createElement("li");
            item.textContent = text;
            list.appendChild(item);
        });

        wrapper.append(heading, intro, list);
        this.container.replaceChildren(wrapper);
    }

    private applyFormatting(): void {
        if (!this.formattingSettings?.markdownCard) return;
        const s = this.formattingSettings.markdownCard;
        if (s.fontFamily?.value) this.container.style.fontFamily = s.fontFamily.value;
        if (s.fontSize?.value) this.container.style.fontSize = s.fontSize.value + "px";
        if (s.padding?.value !== undefined) this.container.style.padding = s.padding.value + "px";
        if (s.showBorder?.value) {
            this.container.style.border = "1px solid var(--markdown-border-color)";
            this.container.style.borderRadius = "8px";
        } else {
            this.container.style.border = "none";
        }
    }

    private applyTheme(dataView?: DataView): void {
        const palette = this.host?.colorPalette as any;
        const isHighContrast = !!palette?.isHighContrast;
        const paletteText = this.getColor(palette?.foreground, "#111827");
        const paletteBackground = this.getColor(palette?.background, "#FFFFFF");
        const paletteLink = this.getColor(palette?.hyperlink, paletteText);
        const paletteFocus = this.getColor(palette?.foregroundSelected, paletteLink);

        const explicitText = this.getObjectFillColor(dataView, "markdown", "fontColor");
        const explicitBackground = this.getObjectFillColor(dataView, "markdown", "backgroundColor");

        const text = isHighContrast ? paletteText : (explicitText || paletteText);
        const background = isHighContrast ? paletteBackground : (explicitBackground || paletteBackground);
        const link = isHighContrast ? (paletteLink || paletteFocus || paletteText) : (paletteLink || "#0078D4");
        const focus = isHighContrast ? (paletteFocus || link || paletteText) : (paletteFocus || link);

        const border = isHighContrast ? text : this.mixColors(text, background, 0.28);
        const surface = isHighContrast ? background : this.mixColors(text, background, 0.08);
        const strongerSurface = isHighContrast ? background : this.mixColors(text, background, 0.12);
        const darkBackground = this.isDark(background);
        const preBackground = isHighContrast
            ? background
            : (darkBackground ? this.mixColors(text, background, 0.10) : "#1F2937");
        const preText = isHighContrast ? text : (darkBackground ? text : "#F9FAFB");

        this.container.classList.toggle("high-contrast", isHighContrast);
        this.container.classList.toggle("dark-mode", !isHighContrast && darkBackground);
        this.setCssVariables({
            "--markdown-text-color": text,
            "--markdown-bg-color": background,
            "--markdown-link-color": link,
            "--markdown-border-color": border,
            "--markdown-focus-color": focus,
            "--markdown-code-bg": surface,
            "--markdown-code-text": text,
            "--markdown-pre-bg": preBackground,
            "--markdown-pre-text": preText,
            "--markdown-table-header-bg": strongerSurface,
            "--markdown-blockquote-bg": surface,
            "--markdown-blockquote-border-color": link,
            "--markdown-muted-text": text
        });
    }

    private setCssVariables(values: Record<string, string>): void {
        Object.entries(values).forEach(([name, value]) => {
            this.container.style.setProperty(name, value);
        });
    }

    private getObjectFillColor(dataView: DataView | undefined, objectName: string, propertyName: string): string | undefined {
        const value = (dataView?.metadata?.objects as any)?.[objectName]?.[propertyName] as PaletteFill;
        return this.getColor(value);
    }

    private getColor(fill: PaletteFill, fallback?: string): string {
        if (typeof fill === "string" && fill.trim()) return fill;
        const value = fill && typeof fill === "object"
            ? (fill.value || fill.solid?.color)
            : undefined;
        return value || fallback || "";
    }

    private mixColors(foreground: string, background: string, foregroundWeight: number): string {
        const fg = this.hexToRgb(foreground);
        const bg = this.hexToRgb(background);
        if (!fg || !bg) return foregroundWeight >= 0.2 ? foreground : background;
        const mix = (a: number, b: number) => Math.round(a * foregroundWeight + b * (1 - foregroundWeight));
        return this.rgbToHex(mix(fg.r, bg.r), mix(fg.g, bg.g), mix(fg.b, bg.b));
    }

    private isDark(color: string): boolean {
        const rgb = this.hexToRgb(color);
        if (!rgb) return false;
        const toLinear = (v: number) => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        };
        const luminance = 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
        return luminance < 0.35;
    }

    private hexToRgb(color: string): { r: number; g: number; b: number } | undefined {
        const trimmed = color.trim();
        const match = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
        if (!match) return undefined;
        const hex = match[1].length === 3
            ? match[1].split("").map((char) => char + char).join("")
            : match[1];
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16)
        };
    }

    private rgbToHex(r: number, g: number, b: number): string {
        return "#" + [r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase();
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}

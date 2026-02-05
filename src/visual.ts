/*
*  Power BI Visual CLI - Markdown Viewer with Syntax Highlighting + Emoji
*  MIT License
*/
"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { marked } from "marked";
import hljs from "highlight.js";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataView = powerbi.DataView;

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
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService: FormattingSettingsService;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.target = options.element;
        this.formattingSettingsService = new FormattingSettingsService();
        
        this.container = document.createElement("div");
        this.container.className = "markdown-container";
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

            this.container.innerHTML = "";

            if (!dataView) {
                this.showLandingPage();
                return;
            }

            let markdownContent = "";
            if (dataView.single?.value !== undefined && dataView.single?.value !== null) {
                markdownContent = String(dataView.single.value);
            }

            if (!markdownContent || markdownContent.trim() === "") {
                this.showLandingPage();
                return;
            }

            // Process emojis first
            markdownContent = this.processEmojis(markdownContent);

            // Parse markdown
            let htmlContent = marked.parse(markdownContent) as string;
            
            // Apply syntax highlighting
            htmlContent = this.applySyntaxHighlighting(htmlContent);
            
            this.container.innerHTML = htmlContent;
            this.applyFormatting();
        } catch (error) {
            this.container.innerHTML = "<div class='error'><strong>Error:</strong> " + error + "</div>";
        }
    }

    private processEmojis(text: string): string {
        return text.replace(/:[\w_]+:/g, (match) => emojiMap[match] || match);
    }

    private applySyntaxHighlighting(html: string): string {
        try {
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = html;
            tempDiv.querySelectorAll("pre code").forEach((block) => {
                hljs.highlightElement(block as HTMLElement);
            });
            return tempDiv.innerHTML;
        } catch (e) {
            return html;
        }
    }

    private showLandingPage() {
        this.container.innerHTML = "<div class='landing-page'><h2>Markdown Viewer</h2><p>Add a measure containing markdown text.</p><p>Supports: headers, lists, tables, code blocks, <strong>emoji</strong> :rocket:</p></div>";
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
}

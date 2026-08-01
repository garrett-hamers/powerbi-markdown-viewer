/*
 *  Power BI Visualizations - Markdown Viewer Settings
 *  MIT License
 */

"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

/**
 * Markdown Formatting Card
 */
export class MarkdownSettingsCard extends FormattingSettingsCard {
    fontFamily = new formattingSettings.TextInput({
        name: "fontFamily",
        displayNameKey: "MarkdownViewer_FontFamily",
        placeholder: "Segoe UI",
        value: "Segoe UI, sans-serif"
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayNameKey: "MarkdownViewer_FontSize",
        value: 14
    });

    fontColor = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayNameKey: "MarkdownViewer_FontColor",
        value: { value: "#111827" }
    });

    backgroundColor = new formattingSettings.ColorPicker({
        name: "backgroundColor",
        displayNameKey: "MarkdownViewer_BackgroundColor",
        value: { value: "#FFFFFF" }
    });

    padding = new formattingSettings.NumUpDown({
        name: "padding",
        displayNameKey: "MarkdownViewer_Padding",
        value: 20
    });

    showBorder = new formattingSettings.ToggleSwitch({
        name: "showBorder",
        displayNameKey: "MarkdownViewer_ShowBorder",
        value: false
    });

    name: string = "markdown";
    displayNameKey: string = "MarkdownViewer_Settings";
    slices: Array<FormattingSettingsSlice> = [
        this.fontFamily,
        this.fontSize,
        this.fontColor,
        this.backgroundColor,
        this.padding,
        this.showBorder
    ];
}

/**
 * Visual settings model class
 */
export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    markdownCard = new MarkdownSettingsCard();
    cards = [this.markdownCard];
}

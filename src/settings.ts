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
        displayName: "Font Family",
        placeholder: "Segoe UI",
        value: "Segoe UI, sans-serif"
    });

    fontSize = new formattingSettings.NumUpDown({
        name: "fontSize",
        displayName: "Font Size",
        value: 14
    });

    fontColor = new formattingSettings.ColorPicker({
        name: "fontColor",
        displayName: "Font Color",
        value: { value: "#111827" }
    });

    backgroundColor = new formattingSettings.ColorPicker({
        name: "backgroundColor",
        displayName: "Background Color",
        value: { value: "#FFFFFF" }
    });

    padding = new formattingSettings.NumUpDown({
        name: "padding",
        displayName: "Padding",
        value: 20
    });

    showBorder = new formattingSettings.ToggleSwitch({
        name: "showBorder",
        displayName: "Show Border",
        value: false
    });

    name: string = "markdown";
    displayName: string = "Markdown Settings";
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

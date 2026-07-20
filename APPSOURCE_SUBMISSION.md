# AppSource Submission Checklist

## Certification Evidence (2026-07-19)

### Evidence Boundary

- The exact July reviewer rationale is unknown because the private certification report was not available in this session. Do not present any repository finding as the July rejection reason without that report.
- The July 4 automation record says it uploaded `E:\code\PowerBI\powerbi-markdown-viewer\dist\atlynMarkdownViewer.pbiviz` as version `1.0.1.0` with a context-menu correction.
- A stale April package in the separate registration folder was discovered later. There is no evidence that Partner Center received that package on July 4.

### Confirmed Source and Package State

- Source: the exact committed HEAD reported with the final artifact; promote that commit unchanged to the lowercase `certification` branch.
- Artifact: `dist\atlynMarkdownViewer.pbiviz`
- Display name: `Atlyn Markdown Viewer`
- Version: `1.0.3.0`
- GUID: `markdownViewer7897821586924C6F9CD657CB549A6967` (unchanged)
- Power BI API: `5.11.0`; exact packaging tools `7.1.2` are installed from `package-lock.json`.
- The archive contains both context-menu modes and the complete rendering-event lifecycle.
- The Markdown sanitizer uses narrow tag/attribute allowlists; regression coverage proves legacy `background` URLs on tables/cells and other automatic resource attributes cannot survive.
- Syntax highlighting operates on text content, sanitizes the generated spans, and imports them as a `DocumentFragment` rather than assigning application-controlled `innerHTML`.
- Validated HTTPS URLs are stored in a controlled `data-safe-href` attribute with no native `href`; anchors retain `role="link"` and keyboard focus, while primary click, middle-click/auxclick, Enter, and Space route through `host.launchUrl`. Unsafe or non-HTTPS links remain inert.
- The visual declares enhanced keyboard focus and honors the Power BI foreground, background, and hyperlink palette in high-contrast mode.
- Empty-data updates initialize a valid formatting model before `getFormattingModel` is called.
- The certification audit reports no external requests; application source contains no `innerHTML`, `fetch`, `XMLHttpRequest`, or `eval`.
- All direct and transitive packages resolve from the public npm registry; there are no git, local, private, or submodule dependencies.
- Clean validation: `npm install`, the required ESLint command, TypeScript, 23 focused tests, `npm audit --audit-level=moderate`, and certification-audit packaging complete with zero vulnerabilities or external requests.
- Stable embedded PBIVIZ metadata/content SHA-256: `90206A2A49CD42E026BB454A009D858104CFDF5CAE67FDED9643FDB7FC893B13`

`pbiviz package` writes ZIP entry timestamps, so the outer archive SHA-256 changes on each rebuild even when the embedded payload is identical. Recompute and record the outer hash immediately before upload; use the stable embedded payload hash above to verify source/package content reproducibility.

### Remaining Required or Manual Evidence

- Download the failed submission's certification report when access is available and preserve its exact policy IDs.
- The tracked `sample\SampleReport.pbix` is Microsoft Information Protection/RMS-protected and contains visual version `1.0.0.0`. Do not rewrite this binary with repository automation. Replace it manually in Power BI Desktop with an unprotected PBIX that works offline and contains exact visual version `1.0.3.0`; verify incoming filters, both context-menu modes, safe-link launching, every formatting property, keyboard focus, high contrast, resize/scroll behavior, save/reopen, and publish/export before upload.
- Capture at least one real 1366x768 PNG screenshot (maximum 1024 KB) from the validated Power BI Desktop report; do not fabricate submission assets.
- Push the exact source commit to a lowercase `certification` branch before requesting the certified badge.
- The current single-measure visual does not expose tooltip or outbound cross-filter interactions. Incoming filters should recompute `dataView.single` and require Desktop validation. Document tooltip/outbound-selection cases as not applicable for this visual contract unless the certification report or Desktop test requires a separately approved interaction design.

References:

- [Partner Center Power BI technical configuration](https://learn.microsoft.com/en-us/partner-center/marketplace-offers/power-bi-visual-technical-configuration)
- [Power BI visual certification requirements](https://learn.microsoft.com/en-us/power-bi/developer/visuals/power-bi-custom-visuals-certified)
- [Rendering events](https://learn.microsoft.com/en-us/power-bi/developer/visuals/event-service)
- [Context menus](https://learn.microsoft.com/en-us/power-bi/developer/visuals/context-menu)
- [Submission testing](https://learn.microsoft.com/en-us/power-bi/developer/visuals/submission-testing)

## Prerequisites
- [ ] Microsoft Partner Center account (https://partner.microsoft.com)
- [ ] Business email verified
- [ ] Payment of registration fee (~$19 USD)

## Required Files

### Visual Package
- [x] `.pbiviz` file - Located in `/dist/` folder
- [x] Version: 1.0.3.0

### Icons & Images
- [x] 20x20 icon (`/assets/icon.png`) - Used in visual
- [x] 300x300 icon (`/assets/icon-300x300.png`) - For AppSource listing
- [ ] Screenshots (exactly 1366x768 PNG, maximum 1024 KB) - **You need to capture these from Power BI Desktop**

### Documentation
- [x] Privacy Policy - https://www.atlynco.com/legal/privacy
- [x] Support URL - https://www.atlynco.com/docs/faq
- [x] Terms/EULA - https://www.atlynco.com/legal/terms
- [x] README with usage instructions

### Sample Report
- [x] Sample PBIP project (`/sample/SampleReport.pbip`)
- [ ] Replace the protected stale `sample\SampleReport.pbix` with an unprotected offline PBIX saved using exact visual version 1.0.3.0

## Submission Steps

1. **Open Partner Center**
   - Go to https://partner.microsoft.com
   - Navigate to Marketplace offers → Power BI visuals

2. **Create New Offer**
   - Click "+ New offer" → Power BI visual
   - Enter offer ID (e.g., "markdown-viewer")

3. **Offer Setup**
   - Offer alias: Atlyn Markdown Viewer
   - Type: Power BI visual

4. **Properties**
   - Categories: Utility, Text
   - Industries: (select applicable)
   - App version: 1.0.3.0

5. **Offer Listing**
   - Name: Atlyn Markdown Viewer
   - Summary: Render Markdown content with syntax highlighting and emoji in Power BI
   - Description: (use README content)
   - Search keywords: markdown, documentation, readme, text, syntax
   - Support link: https://www.atlynco.com/docs/faq
   - Privacy policy: https://www.atlynco.com/legal/privacy
   - Terms/EULA: https://www.atlynco.com/legal/terms

6. **Technical Configuration**
   - Upload `.pbiviz` file
   - Upload sample `.pbix` file

7. **Submit for Review**
   - Microsoft reviews (typically 2-3 weeks)
   - Address any feedback

## Screenshots to Capture

1. **Main view** - Visual showing rendered markdown
2. **Code highlighting** - Show syntax highlighting feature  
3. **Emoji support** - Show emoji rendering
4. **Format pane** - Show customization options
5. **Landing page** - Show what appears when no data bound

## Tips
- Ensure visual works in Power BI Service (not just Desktop)
- Test in different browsers
- Test with various markdown content lengths

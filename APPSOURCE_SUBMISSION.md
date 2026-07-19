# AppSource Submission Checklist

## Certification Evidence (2026-07-19)

### Evidence Boundary

- The exact July reviewer rationale is unknown because the private certification report was not available in this session. Do not present any repository finding as the July rejection reason without that report.
- The July 4 automation record says it uploaded `E:\code\PowerBI\powerbi-markdown-viewer\dist\atlynMarkdownViewer.pbiviz` as version `1.0.1.0` with a context-menu correction.
- A stale April package in the separate registration folder was discovered later. There is no evidence that Partner Center received that package on July 4.

### Confirmed Source and Package State

- Package implementation history: base commit `ed7f47f86698b7d2e2734be99a1340c38bdfa315` plus this follow-up commit.
- Artifact: `dist\atlynMarkdownViewer.pbiviz`
- Display name: `Atlyn Markdown Viewer`
- Version: `1.0.2.0`
- GUID: `markdownViewer7897821586924C6F9CD657CB549A6967` (unchanged)
- Power BI API: `5.11.0`; exact packaging tools `7.1.2` are installed from `package-lock.json`.
- The archive contains both context-menu modes and the complete rendering-event lifecycle.
- The Markdown sanitizer uses narrow tag/attribute allowlists; regression coverage proves legacy `background` URLs on tables/cells and other automatic resource attributes cannot survive.
- Validated HTTPS link clicks are intercepted and routed through `host.launchUrl`; unsafe or non-HTTPS links remain inert.
- Empty-data updates initialize a valid formatting model before `getFormattingModel` is called.
- The certification audit reports no external requests; application source contains no `innerHTML`, `fetch`, `XMLHttpRequest`, or `eval`.
- Clean validation: `npm ci`, lint, TypeScript, 11 focused tests, and `npm audit --audit-level=moderate` (including locked Power BI tools) with zero vulnerabilities.
- Embedded PBIVIZ metadata/content SHA-256: `AF5821A76F3FFD4809EAB13CD804F67FD04E954225DDF45382FF6AB254A88741`
- Current archive SHA-256: `F0767838CCAB4D6CC80CF35CED25C5D33DF5F7C461D2052D596CDD45E0FEC7BA`

`pbiviz package` writes ZIP entry timestamps, so the outer archive SHA-256 changes on each rebuild even when the embedded payload is identical. Recompute and record the outer hash immediately before upload; use the embedded payload hash above to verify source/package content stability.

### Remaining Required or Manual Evidence

- Download the failed submission's certification report when access is available and preserve its exact policy IDs.
- The tracked `sample\SampleReport.pbix` is Microsoft Information Protection/RMS-protected and contains visual version `1.0.0.0`. Do not rewrite this binary with repository automation. Replace it manually in Power BI Desktop with an unprotected PBIX that works offline and contains exact visual version `1.0.2.0`; verify incoming filters, both context-menu modes, save/reopen, and safe-link launching before upload.
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
- [x] Version: 1.0.2.0

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
- [ ] Replace the protected stale `sample\SampleReport.pbix` with an unprotected offline PBIX saved using exact visual version 1.0.2.0

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
   - App version: 1.0.2.0

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

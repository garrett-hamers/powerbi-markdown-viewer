# AppSource Submission Checklist

## Prerequisites
- [ ] Microsoft Partner Center account (https://partner.microsoft.com)
- [ ] Business email verified
- [ ] Payment of registration fee (~$19 USD)

## Required Files

### Visual Package
- [x] `.pbiviz` file - Located in `/dist/` folder
- [x] Version: 1.0.0.0

### Icons & Images
- [x] 20x20 icon (`/assets/icon.png`) - Used in visual
- [x] 300x300 icon (`/assets/icon-300x300.png`) - For AppSource listing
- [ ] Screenshots (1366x768 or 1280x720 PNG) - **You need to capture these from Power BI Desktop**

### Documentation
- [x] Privacy Policy - https://github.com/garrett-hamers/powerbi-markdown-viewer/blob/main/PRIVACY.md
- [x] Support URL - https://github.com/garrett-hamers/powerbi-markdown-viewer
- [x] README with usage instructions

### Sample Report
- [x] Sample PBIP project (`/sample/SampleReport.pbip`)
- [ ] Export as .pbix from Power BI Desktop for submission

## Submission Steps

1. **Open Partner Center**
   - Go to https://partner.microsoft.com
   - Navigate to Marketplace offers → Power BI visuals

2. **Create New Offer**
   - Click "+ New offer" → Power BI visual
   - Enter offer ID (e.g., "markdown-viewer")

3. **Offer Setup**
   - Offer alias: Markdown Viewer
   - Type: Power BI visual

4. **Properties**
   - Categories: Utility, Text
   - Industries: (select applicable)
   - App version: 1.0.0.0

5. **Offer Listing**
   - Name: Markdown Viewer
   - Summary: Render Markdown content with syntax highlighting and emoji in Power BI
   - Description: (use README content)
   - Search keywords: markdown, documentation, readme, text, syntax
   - Support link: https://github.com/garrett-hamers/powerbi-markdown-viewer
   - Privacy policy: https://github.com/garrett-hamers/powerbi-markdown-viewer/blob/main/PRIVACY.md

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

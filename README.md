# Atlyn Document

A certified-first Power BI document visual that renders safe Markdown and explicitly typed Power BI narratives with semantic structure, local search, outline navigation, and visible completeness diagnostics.

![Full Feature Preview](assets/FullFeature.png)

## Features

### 📝 Markdown Rendering
GitHub Flavored Markdown (GFM) patterns including headers, bold, italic, lists, HTTPS links, blockquotes, and more. Raw HTML is sanitized, and remote images or media are not loaded automatically.

### 💻 Syntax Highlighting
Automatic language detection and syntax highlighting for code blocks powered by [highlight.js](https://highlightjs.org/).

![Code Highlighting](assets/CodeHighlighting.png)

### 📊 Table Support
Render clean, formatted tables directly from Markdown syntax.

![Table Support](assets/TableSupport.png)

### 😄 Emoji Support
Convert emoji shortcodes like `:rocket:` to 🚀 — over 60 shortcodes supported. Shortcodes inside inline code, fenced code blocks, and link destinations remain literal.

![Emoji Support](assets/EmojiSupport.png)

### 🧭 Document navigation and trust
Every document is normalized into a bounded semantic model. Headings receive deterministic IDs and a keyboard-accessible outline; search indexes logical content rather than only visible DOM nodes. A status disclosure reports blocked content, unsafe links, size limits, and partial structured data by category and count without echoing source payloads.

### 📋 Typed Power BI sections
For row-aware narratives, bind `Section`, `Section Title`, and `Section Body`, then optionally provide `Section Order`, `Section Kind`, `Section Value`, `Section Status`, `Section Link`, and `Tooltip`. Ordering is explicit and deterministic. Rows have host selection identities, keyboard selection, context menus, formatted text values, and a bounded visible window. The visual never infers business meaning from colors or numbers.

### 🎨 Customizable Formatting
Adjust the visual appearance through the Power BI Format pane:

| Setting | Description | Default |
|---------|-------------|---------|
| Font Family | Set the typeface | Segoe UI, sans-serif |
| Font Size | Adjust text size (px) | 14 |
| Font Color | Change text color | #111827 |
| Background Color | Set background fill | #FFFFFF |
| Padding | Inner spacing (px) | 20 |
| Show Border | Toggle a rounded border | Off |
| Show Outline | Display the document outline | On |
| Show Search | Display local document search | On |
| Show Trust Status | Display completeness diagnostics | On |
| Compact / Export Presentation | Reduce authoring chrome | Off |
| Reduce Motion | Disable document motion | Off |

The visual also honors Power BI's foreground, background, and hyperlink colors in Windows high-contrast mode.

## Installation

The historical `v1.0.0` package predates the visual's current sanitization and certification hardening and should not be installed. Until a current package is published, build from the current source:

1. Run `npm ci`
2. Run `npm run certification:validate`
3. In Power BI Desktop, go to the **Visualizations** pane → **…** → **Import a visual from a file**
4. Select `dist/atlynMarkdownViewer.pbiviz`

## Usage

1. Add the **Atlyn Document** visual to your report canvas
2. Create a DAX measure that returns markdown text
3. Drag the measure to the **Markdown Content** field well

![Report Documentation](assets/ReportDocumentation.png)

### Example DAX Measure

```dax
Report Info = 
VAR NL = UNICHAR(10)
RETURN
"# Sales Report :rocket:" & NL & NL &
"## Overview" & NL &
"This report shows **key metrics** for the quarter." & NL & NL &
"| Metric | Value |" & NL &
"|--------|-------|" & NL &
"| Revenue | $1.2M |" & NL &
"| Growth | 15% |" & NL & NL &
"## Notes" & NL &
"- Data refreshed daily :clock:" & NL &
"- Contact the analytics team for questions :email:"
```

For a structured narrative, add the typed fields to the corresponding wells. `Section`, `Section Title`, and `Section Body` are required; `Section Order` is recommended because Power BI table rows must not be assumed to be ordered. Use explicit status values such as `good`, `warning`, or `blocked` rather than encoding status in a color or number.

## Supported Emoji

<details>
<summary>Click to expand full emoji list (60+ shortcodes)</summary>

| Shortcode | Emoji | Shortcode | Emoji |
|-----------|-------|-----------|-------|
| `:smile:` | 😄 | `:grinning:` | 😀 |
| `:laughing:` | 😆 | `:joy:` | 😂 |
| `:heart:` | ❤️ | `:star:` | ⭐ |
| `:fire:` | 🔥 | `:thumbsup:` | 👍 |
| `:thumbsdown:` | 👎 | `:clap:` | 👏 |
| `:wave:` | 👋 | `:pray:` | 🙏 |
| `:rocket:` | 🚀 | `:sparkles:` | ✨ |
| `:tada:` | 🎉 | `:confetti_ball:` | 🎊 |
| `:trophy:` | 🏆 | `:medal:` | 🏅 |
| `:check:` | ✅ | `:x:` | ❌ |
| `:warning:` | ⚠️ | `:info:` | ℹ️ |
| `:question:` | ❓ | `:exclamation:` | ❗ |
| `:bulb:` | 💡 | `:memo:` | 📝 |
| `:book:` | 📖 | `:bookmark:` | 🔖 |
| `:link:` | 🔗 | `:gear:` | ⚙️ |
| `:wrench:` | 🔧 | `:hammer:` | 🔨 |
| `:chart:` | 📊 | `:chart_up:` | 📈 |
| `:chart_down:` | 📉 | `:clock:` | 🕐 |
| `:calendar:` | 📅 | `:email:` | 📧 |
| `:phone:` | 📱 | `:computer:` | 💻 |
| `:desktop:` | 🖥️ | `:folder:` | 📁 |
| `:file:` | 📄 | `:lock:` | 🔒 |
| `:unlock:` | 🔓 | `:key:` | 🔑 |
| `:shield:` | 🛡️ | `:bug:` | 🐛 |
| `:zap:` | ⚡ | `:cloud:` | ☁️ |
| `:sun:` | ☀️ | `:moon:` | 🌙 |
| `:earth:` | 🌍 | `:globe:` | 🌐 |
| `:pin:` | 📍 | `:flag:` | 🚩 |
| `:arrow_right:` | ➡️ | `:arrow_left:` | ⬅️ |
| `:arrow_up:` | ⬆️ | `:arrow_down:` | ⬇️ |
| `:plus:` | ➕ | `:minus:` | ➖ |
| `:heavy_check_mark:` | ✔️ | `:white_check_mark:` | ✅ |
| `:eyes:` | 👀 | `:thinking:` | 🤔 |
| `:100:` | 💯 | `:ok:` | 👌 |
| `:point_right:` | 👉 | `:point_left:` | 👈 |

</details>

## Privacy Policy

This visual does **not** collect, store, or automatically transmit user data. Markdown processing, parsing, search indexing, and diagnostics happen entirely within the Power BI environment. Choosing an HTTPS link opens that destination through the Power BI host. See [PRIVACY.md](PRIVACY.md) for full details.

## Supported Content and Export

The visual supports semantic headings, paragraphs, emphasis, lists, blockquotes, tables with captions and headers, native disclosures, status callouts, code, emoji, and absolute HTTPS links. Raw HTML is limited to the same safe document elements. Images, media, SVG, scripts, styles, forms, embedded content, relative links, and non-HTTPS links are removed or shown as unsupported text.

The certified rendering policy bounds source content at 512 KiB, logical blocks at 2,000, nesting at 40 levels, code at 100 blocks and 20,000 characters per block, unlabelled automatic code detection at 8,000 characters, and structured rows at a bounded visible window. When a limit or Power BI data reduction applies, the visual shows a limited state and a category-level diagnostic. Removed payloads, URLs, and script text are never copied into diagnostics.

Power BI PDF and PowerPoint export captures the visible visual viewport after rendering completes. Compact presentation reduces authoring chrome, but the visual does not claim that a scrollable document automatically becomes a complete multi-page PDF. For long documents, size the visual to the content intended for export or split documentation across report pages.

## Accessibility and keyboard use

Press **Enter** when Power BI moves focus into the visual. Use the toolbar search field, outline links, native disclosure controls, safe links, and structured row controls with the keyboard. **Escape** returns focus to the visual container. Focus and reading position are restored by stable document identity after equivalent updates. High contrast uses the host palette, status is not conveyed by color alone, and prose reflows while only table regions scroll horizontally.

## Local validation

Run `npm ci` followed by `npm run certification:validate`. The local gate runs ESLint, TypeScript, unit/security tests, `npm audit --audit-level=moderate`, and the certification-audited package command. Generated `dist/` and `.tmp/` output is intentionally ignored and must not be committed.

## Support

- **Issues**: [GitHub Issues](https://github.com/garrett-hamers/powerbi-document-visual/issues)
- **Email**: atlyn.help@gmail.com

## License

MIT License — see [LICENSE](LICENSE) file.

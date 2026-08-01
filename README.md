# Atlyn Markdown Viewer

A custom Power BI visual that renders Markdown content directly in your reports with GitHub Flavored Markdown support, syntax highlighting, and emoji shortcodes.

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

The visual also honors Power BI's foreground, background, and hyperlink colors in Windows high-contrast mode.

## Installation

The historical `v1.0.0` package predates the visual's current sanitization and certification hardening and should not be installed. Until a current package is published, build from the current source:

1. Run `npm ci`
2. Run `npm run certification:validate`
3. In Power BI Desktop, go to the **Visualizations** pane → **…** → **Import a visual from a file**
4. Select `dist/atlynMarkdownViewer.pbiviz`

## Usage

1. Add the **Atlyn Markdown Viewer** visual to your report canvas
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

This visual does **not** collect, store, or automatically transmit user data. Markdown processing happens entirely within the Power BI environment. Choosing an HTTPS link opens that destination through the Power BI host. See [PRIVACY.md](PRIVACY.md) for full details.

## Supported Content and Export

The visual supports headings, paragraphs, emphasis, lists, blockquotes, tables, details, code, and absolute HTTPS links. Raw HTML is limited to the same safe document elements. Images, media, SVG, scripts, styles, forms, embedded content, relative links, and non-HTTPS links are removed or shown as unsupported text.

Power BI PDF and PowerPoint export captures the visible visual viewport. For long documents, size the visual to the content intended for export or split documentation across report pages.

## Support

- **Issues**: [GitHub Issues](../../issues)
- **Email**: atlyn.help@gmail.com

## License

MIT License — see [LICENSE](LICENSE) file.

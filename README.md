# Power BI Markdown Viewer

A custom Power BI visual that renders Markdown content with syntax highlighting and emoji support.

## Features

- **Markdown Rendering** - Full GitHub Flavored Markdown support
- **Syntax Highlighting** - Code blocks with automatic language detection
- **Emoji Support** - Convert shortcodes like `:rocket:` to 🚀
- **Customizable** - Font, colors, padding via Format pane

## Installation

1. Download the `.pbiviz` file from [Releases](../../releases)
2. In Power BI Desktop: Visualizations pane → ... → Import a visual from a file
3. Select the downloaded `.pbiviz` file

## Usage

1. Add the Markdown Viewer visual to your report
2. Create a DAX measure that returns markdown text
3. Drag the measure to the **Markdown Content** field

### Example DAX Measure

```dax
Report Info = 
"# My Report :rocket:

## Overview
This report shows **important metrics**.

| Metric | Value |
|--------|-------|
| Sales |  |
| Growth | 15% |

```python
# Sample code
print('Hello World')
```
"
```

## Supported Emoji

| Shortcode | Emoji | Shortcode | Emoji |
|-----------|-------|-----------|-------|
| `:smile:` | 😄 | `:rocket:` | 🚀 |
| `:fire:` | 🔥 | `:star:` | ⭐ |
| `:check:` | ✅ | `:warning:` | ⚠️ |
| `:bulb:` | 💡 | `:heart:` | ❤️ |
| `:thumbsup:` | 👍 | `:chart:` | 📊 |

## Privacy Policy

This visual does not collect, store, or transmit any user data. All markdown processing happens locally within the Power BI environment.

## Support

- **Issues**: [GitHub Issues](../../issues)
- **Email**: atlyn.help@gmail.com

## License

MIT License - see [LICENSE](LICENSE) file.

# Signboard

A local-first kanban-style app built with a web stack. Signboard stores your boards as Markdown files on disk, so you own your data. With as few dependencies as possible, it’s lightweight, transparent, and open source.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/cdevroe/signboard)](../../issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/cdevroe/signboard)](../../pulls)

---

## ✨ Features
- 📂 Boards saved as Markdown files (portable & future-proof)
- 🖥 Runs as a desktop app (Windows, macOS, Linux)
- 🪶 Minimal dependencies, just straight JavaScript + Electron
- 🔒 Local-first

---

## 🚀 Installation

1. Go to the [Releases page](../../releases).
2. On the latest releae, download the installer for your operating system:  
   - **Windows**: `.exe`
   - **macOS**: `.dmg`
   - **Linux**: `.AppImage`

---

## 🛠 Development

```bash
# Clone the repo
git clone https://github.com/YOURUSERNAME/signboard.git
cd signboard

# Install dependencies
npm install

# Concatenate JavaScript files
./buildjs.sh

# Run the app in dev mode
npm start
```

---

## 🤝 Contributing

Contributions in all forms are welcome!  

- **Report bugs**: Open an [Issue](../../issues).  
- **Suggest features**: Open an [Issue](../../issues) with the `enhancement` label.  
- **Submit fixes or features**: Fork the repo, make your changes, and open a [Pull Request](../../pulls).  

### Contribution Guidelines
- Keep PRs focused: one change per PR makes reviews faster.
- Follow existing code style where possible (or, please, suggest new code styles)
- Be respectful and constructive in discussions.

---

## 💖 Support the Project

If you find Signboard useful and want to support development, you can donate here:  

👉 [https://cdevroe.com/donate](https://cdevroe.com/donate)  

Thank you!

---

## 📜 License

[MIT](./LICENSE) © 2025 Colin Devroe - cdevroe.com

# Third-Party Notices

My thanks to [John Gruber](https://daringfireball.net/) for creating [Markdown](https://daringfireball.net/projects/markdown/) and to [Steph Ango](https://stephango.com/), CEO of [Obsidian](https://obsidian.md/), for his [File over app philosophy](https://stephango.com/file-over-app).

Signboard includes static versions the following open source libraries:

- [Marked](https://github.com/markedjs/marked) – [MIT License](https://github.com/markedjs/marked/blob/master/LICENSE.md)
- [Turndown](https://github.com/mixmark-io/turndown) – [MIT License](https://github.com/mixmark-io/turndown/blob/master/LICENSE)
- [SortableJS](https://github.com/SortableJS/Sortable) – [MIT License](https://github.com/SortableJS/Sortable/blob/master/LICENSE)
- [Feather Icons](https://github.com/feathericons/feather) – [MIT License](https://github.com/feathericons/feather/blob/master/LICENSE)

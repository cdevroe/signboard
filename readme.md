# Signboard

A local-first kanban desktop app built with HTML, CSS, and plain JavaScript. Signboard stores your lists as directories and cards as Markdown files on disk, so you own your data.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![GitHub issues](https://img.shields.io/github/issues/cdevroe/signboard)](../../issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/cdevroe/signboard)](../../pulls)
[![Donate](https://img.shields.io/badge/Donate-388307)](https://cdevroe.com/donate)

---

## ✨ Highlights
- 📂 Cards saved as Markdown files (portable & future-proof)
- 🖥 Runs as a desktop app
- 🪶 Minimal dependencies 😅, just plain JavaScript + Electron

---

## 🚀 Installation

1. Go to the [Releases page](../../releases).
2. On the latest release, download the installer for your operating system:  
   - **Windows**: `.exe`
   - **macOS**: `.dmg`
   - **Linux**: `.AppImage`

---

## 🛠 Development

```bash
# Clone the repo
git clone https://github.com/cdevroe/signboard.git
cd signboard

# Install dependencies
npm install

# Concatenate JavaScript files
./buildjs.sh

# Run the app in dev mode
npm start
```

---

## 📦 Distribution Builds

Install dependencies first:

```bash
npm install
```

All distribution commands run `./buildjs.sh` automatically before packaging.

### macOS

```bash
# Current host architecture
npm run dist

# Specific macOS architectures
npm run dist:mac:arm64
npm run dist:mac:x64
npm run dist:mac:universal

# Build all macOS variants
npm run dist:mac:all
```

### Windows (NSIS installer)

```bash
# Both Windows architectures
npm run dist:win

# Specific Windows architecture
npm run dist:win:x64
npm run dist:win:arm64

# Build both Windows architectures
npm run dist:win:all
```

### Linux (AppImage, deb, rpm)

```bash
# Both Linux architectures
npm run dist:linux

# Specific Linux architecture
npm run dist:linux:x64
npm run dist:linux:arm64

# Build both Linux architectures
npm run dist:linux:all
```

### Build everything (lunch mode)

```bash
npm run dist:all
```

Notes:
- Legacy command names still work (`dist:macarm64`, `dist:macx64`, etc.) and now map to the newer names.
- `--publish never` is used for local builds so these commands package artifacts without attempting to publish releases.
- macOS signing/notarization uses environment variables from `.env` (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`).
- For the most reliable results, build each target on its native OS (or in CI runners for that OS/architecture).

---

## 🤝 Contributing

Contributions in all forms are welcome!  

- **Report bugs**: Open an [Issue](../../issues).  
- **Suggest features**: Open an [Issue](../../issues) with the `enhancement` label.  
- **Submit fixes or features**: Fork the repo, make your changes, and open a [Pull Request](../../pulls).  

### Contribution Guidelines
- Keep PRs focused: one change per PR makes reviews faster.
- Follow existing code style where possible (or, please, suggest new code styles!)
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

Signboard includes static versions of the following open source libraries:

- [Marked](https://github.com/markedjs/marked) – [MIT License](https://github.com/markedjs/marked/blob/master/LICENSE.md)
- [Turndown](https://github.com/mixmark-io/turndown) – [MIT License](https://github.com/mixmark-io/turndown/blob/master/LICENSE)
- [OverType](https://github.com/panphora/overtype) - [MIT License](https://github.com/panphora/overtype/blob/main/LICENSE)
- [SortableJS](https://github.com/SortableJS/Sortable) – [MIT License](https://github.com/SortableJS/Sortable/blob/master/LICENSE)
- [Feather Icons](https://github.com/feathericons/feather) – [MIT License](https://github.com/feathericons/feather/blob/master/LICENSE)
- [fDatepicker](https://github.com/liedekef/fdatepicker) – [MIT License](https://github.com/liedekef/fdatepicker/blob/master/LICENSE.md)

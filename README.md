
# AL Page Navigator

A lightweight VS Code helper for AL (Business Central) developers that inserts a ready-to-use
Page Navigator page into your project and automatically assigns a free Page ID from your
project's configured ranges.

## Features

- Adds the command **"AL: Insert Page Navigator Page"** (also available from the Explorer
  folder context menu).
- Reads `idRanges` or `idRange` from `app.json` and scans your project for already-used page IDs.
- Chooses the first free Page ID inside your range (no hardcoded ID like 50100).
- Prompts for the target folder (defaults to `src`) and opens the new file automatically.

## Installation

- Install the extension from the VS Code Marketplace or load it from source in your development
  environment.

## Usage

1. Open the Command Palette and run `AL: Insert Page Navigator Page`.
2. Or right-click a folder in Explorer and choose the command to insert the page into that
   folder.
3. The extension will:
   - Read `idRanges` / `idRange` from your project's `app.json`.
   - Scan `.al` files for existing `page NNNNN` declarations.
   - Pick the first free ID and write `PageNavigator.al` into the chosen folder.
   - Open the newly created file.

## app.json configuration

The extension looks for either `idRanges` or a single `idRange` entry in your `app.json`.
Example:

```json
"idRanges": [
  { "from": 50100, "to": 50149 }
]
```

or

```json
"idRange": 50100
```

The extension will find the first unused page ID within the configured range and use it
when generating the navigator page.

## Contributing

- Bug reports and PRs welcome. Keep changes focused and follow the repository style.

## License

See the repository license. If none is present, contact the author for license details.

---

If you'd like a different tone, extra examples, or a short GIF showing the command, tell me
what to include and I will update this README.

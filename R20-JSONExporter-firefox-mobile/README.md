# R20-JSONExporter Firefox Mobile

Firefox for Android target for Roll20 chat JSON export.

## Source and Release

- Source lives in this folder.
- Release artifacts are staged into `R20-JSONExporter/release/firefox-mobile` from the repository root.
- Shared parsing logic comes from the sibling `roll20-json-core` package and is bundled into the staged release as `js/vendor/roll20-json-core.js`.

## Runtime Flow

1. Open a Roll20 page in Firefox for Android.
2. Tap the extension popup and choose `JSON 내보내기`.
3. The content script walks the currently loaded chat DOM and builds schema v1 JSON.
4. The popup asks the background script to start a JSON download with the Downloads API.
5. If downloads are unavailable, the popup falls back to share and then copy.

## Distribution

- Target: self-distributed signed `xpi`
- Manifest: MV2 for Firefox Android compatibility
- Install path: signed file install in Firefox for Android

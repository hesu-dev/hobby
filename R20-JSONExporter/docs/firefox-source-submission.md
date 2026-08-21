# Firefox Source Submission

This document explains the separate AMO source package for the self-distributed Firefox Android add-on.

## What This Is

AMO requires two different uploads for this project:

- Extension package upload: `release/firefox-mobile.zip`
- Source code upload: `release/firefox-mobile-source.zip`

The source package is for Mozilla reviewers. It is not the installable add-on file.

## Why the Source Package Is Separate

The release package contains generated release output, including the staged shared-core bundle at `js/vendor/roll20-json-core.js`.
Because of that generated output, AMO requires a readable source archive with build instructions.

## How to Generate It

From the `R20-JSONExporter/` project directory, run:

```bash
npm run source:zip
```

This command:

1. Stages a clean source submission bundle under `release/firefox-source-submission`
2. Places the Firefox mobile add-on source at the zip root so `manifest.json` is top-level for AMO validation
3. Adds the AMO reviewer guide as `AMO-README.md`
4. Copies the additional required source folders under `supporting-sources/`:
   - `R20-JSONExporter`
   - `R20-JSONExporter-safari-app`
   - `roll20-json-core`
5. Excludes generated `release/` folders, `node_modules`, `.git`, `.DS_Store`, and existing `.zip` files
6. Creates `release/firefox-mobile-source.zip`

## Upload Mapping

- Upload `release/firefox-mobile.zip` as the add-on package
- Upload `release/firefox-mobile-source.zip` as the AMO source code package

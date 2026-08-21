# CoC Type-Prefix And Roll-Value Parsing 0.8.5 Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve existing CoC template handling, recognize equivalent `type-coc*` names, keep targets separate from rendered rolls, and produce Chrome and Firefox `0.8.5` release artifacts.

**Architecture:** Preserve the exact Roll20 roll-template suffix in the shared extractor, then remove a leading `type-` only for the `coc`/`coc-*` namespace at the CoC rule boundary; existing unprefixed names follow the same paths unchanged, while unrelated `type-*` names remain untouched. Canonicalize both `coc-attack-bonus` and `type-coc-attack-bonus` to the existing `coc-attack-bonus-penalty` payload instead of relying on a browser-specific wrapper alias. Make the single-roll attack parser consume its rendered roll and make the normal bonus/penalty parser read `target` from the threshold row instead of copying the first roll. The existing release builder will bundle the shared core into Chrome, Firefox Web, and Firefox Mobile packages.

**Tech Stack:** CommonJS JavaScript, Node.js `node:test`, WebExtension manifests, Node-based release staging and zip scripts.

---

### Task 1: Add exact regression coverage

**Files:**
- Modify: `roll20-json-core/tests/parser_utils.test.js`
- Modify: `roll20-json-core/tests/chat_json_export.test.js`

**Step 1: Lock the template extraction boundary**

Assert that:

```js
extractTemplateName('<div class="sheet-rolltemplate-type-coc-attack-1"></div>')
```

returns the exact name `type-coc-attack-1`. Also assert that an unrelated `type-default` template is not reinterpreted as the built-in `default` table template.

**Step 2: Write failing end-to-end parser tests**

Pass representative versions of the supplied message HTML to `parseRoll20DicePayload({ role: "dice", html })` and assert these canonical payloads:

```js
{
  source: "roll20",
  rule: "coc7",
  template: "coc-attack",
  inputs: { skill: "검격", target: 80, rolls: [25], damage: 12 },
}
```

Also cover existing and prefixed `coc-1`, `coc`, `coc-bonus`, `coc-bonus-penalty`, and the legacy `coc-attack-bonus` alias with distinct threshold and roll values. Invalid present roll/threshold rows must not silently fall back, while legacy markup with no such row keeps its documented fallback.

```js
{
  source: "roll20",
  rule: "coc7",
  template: "coc-attack-bonus-penalty",
  inputs: { skill: "타신편", target: 55, rolls: [79, 16, 15], damage: 8 },
}
```

**Step 3: Verify RED**

Run:

```bash
node --test roll20-json-core/tests/parser_utils.test.js roll20-json-core/tests/chat_json_export.test.js
```

Expected: prefixed CoC names are not recognized, the single attack exposes its target-as-roll fallback, and normal bonus/penalty inputs expose the first-roll-as-target error.

### Task 2: Implement the minimal shared-core fix

**Files:**
- Modify: `roll20-json-core/src/parsers/coc_rule_parser.js`

**Step 1: Add CoC-scoped aliases without replacing existing names**

Inside `parseCocRulePayload`, remove `type-` only when followed by the exact `coc` namespace boundary. This makes every supported `type-coc*` equivalent reuse the existing allowlists while leaving every unrelated `type-*` template name untouched. Map the historical `coc-attack-bonus` spelling to `coc-attack-bonus-penalty` in this shared boundary so both its original and prefixed forms behave identically on every browser target.

**Step 2: Verify the isolated hypothesis**

Re-run the targeted tests. Expected: prefixed single-roll CoC parsing and the unrelated-template guard pass; roll/target separation failures remain.

**Step 3: Read rendered rolls separately from thresholds**

In `parseCocAttackOnePayload`, find the `굴림`/`rolled` row and use its first integer. In `parseCocPayload`, find the `기준치`/`value` row and use it for `target` while keeping the roll row in `rolls`. Fall back only when legacy markup omits the relevant row; return `null` when a present row has no integer.

**Step 4: Verify GREEN**

Re-run the targeted tests and then all shared-core tests.

### Task 3: Prepare version 0.8.5

**Files:**
- Modify: `R20-JSONExporter/package.json`
- Modify: `R20-JSONExporter/manifest.json`
- Modify: `R20-JSONExporter-firefox-mobile/manifest.json`
- Modify: `R20-JSONExporter-safari-app/ios/Roll20SafariExtension/Resources/manifest.json`
- Modify: `R20-JSONExporter-safari-app/ios/Roll20SafariExtension/Info.plist`
- Modify: `R20-JSONExporter-safari-app/ios/Runner/Info.plist`
- Modify: version-locked tests and Firefox release documentation

**Step 1: Make version tests fail for 0.8.5**

Update the version assertions to `0.8.5` and run them before changing metadata.

**Step 2: Update synchronized source metadata**

Change the shipped target versions and release documentation from `0.8.4` to `0.8.5`.

**Step 3: Verify GREEN**

Run the version contract tests and confirm every source target reports `0.8.5`.

### Task 4: Build and verify releases

**Files:**
- Regenerate: `R20-JSONExporter/release/chrome.zip`
- Regenerate: `R20-JSONExporter/release/firefox-web.zip`
- Regenerate: `R20-JSONExporter/release/firefox-mobile.zip`
- Regenerate: `R20-JSONExporter/release/firefox-mobile-source.zip`
- Modify: `R20-JSONExporter/scripts/lib/source_submission_layout.js`
- Modify: Firefox source-submission tests and reviewer documentation

**Step 1: Run all Node tests**

Run the complete shared-core, Chrome, and Firefox Mobile test suites. Expected: zero failures.

**Step 2: Build the release packages**

Run:

```bash
cd R20-JSONExporter && ./deploy.sh
```

Expected: self-contained Chrome, Firefox Web, and Firefox Mobile stages and zip files containing the updated shared-core bundle.

**Step 3: Inspect packaged contents**

Validate zip integrity, `0.8.5` manifest versions, absence of unwanted files, and the bundled parser behavior against both regression messages. Ensure the Firefox reviewer source ZIP includes every input required by the multi-target build, including `R20-JSONExporter-safari-app`, and reproduce its documented build from a clean temporary extraction.

**Step 4: Request code review and re-run verification**

Review only the task-owned diff, address Critical/Important findings, and rerun the full test and release verification commands before reporting completion.

# Chrome Tabless 0.8.5 Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce the not-yet-uploaded Chrome `0.8.5` package without popup tab buttons, then leave the working source with all three popup tabs enabled for continued development.

**Architecture:** Treat the hidden tab navigation as a one-off Chrome packaging state rather than the final source state. First make the source and its tests represent the post-release development UI with ReadingLog, sheet, and macro tabs enabled. Build and verify the normal sources, temporarily comment the complete tab navigation only while staging the Chrome package, then restore the source without rebuilding that Chrome ZIP.

**Tech Stack:** Static HTML, CommonJS JavaScript, Node.js `node:test`, WebExtension release staging and ZIP scripts.

---

### Task 1: Lock the post-release source state

**Files:**
- Modify: `R20-JSONExporter/tests/popup_labels_contract.test.js`
- Modify: `R20-JSONExporter/popup.html`

**Step 1: Write the failing contract test**

Require the live popup DOM to contain `readingLogTab`, `sheetTab`, and `macroTab`, with matching live tab panels.

**Step 2: Verify RED**

Run `node --test tests/popup_labels_contract.test.js`. Expected: the macro tab and panel are still commented, so the new contract fails.

**Step 3: Enable all three source tabs**

Remove the existing comments around the macro tab button and macro panel. Keep ReadingLog as the initial active panel and preserve the existing three-column tab CSS.

**Step 4: Verify GREEN**

Re-run the popup contract test and then the complete test suite.

### Task 2: Produce the one-off Chrome 0.8.5 package

**Files:**
- Temporarily modify and restore: `R20-JSONExporter/popup.html`
- Regenerate: `R20-JSONExporter/release/chrome/`
- Regenerate: `R20-JSONExporter/release/chrome.zip`

**Step 1: Build the normal 0.8.5 release set**

Run `./deploy.sh` with the final three-tab source and verify the normal multi-platform artifacts first.

**Step 2: Temporarily hide the complete navigation**

Wrap the entire `<nav class="tabs">...</nav>` in an HTML comment. Leave `readingLogTabPanel` visible so the Chrome popup still presents its primary export controls without an orphaned single tab button.

**Step 3: Stage and zip Chrome only**

Call the existing Chrome staging and ZIP helpers directly so Firefox and Safari artifacts stay based on the normal source state. Verify the packaged popup has zero live `role="tab"` buttons and still contains the visible ReadingLog panel.

**Step 4: Restore the development source**

Remove the temporary navigation comment so all three source tabs are live again. Do not rebuild `release/chrome.zip` afterward.

**Step 5: Verify both intentional states**

Confirm source `popup.html` has three live tabs, packaged Chrome `popup.html` has none, both manifests remain `0.8.5`, ZIP integrity passes, and `git diff --check` is clean.

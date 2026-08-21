# Export And CoC Regression Remediation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Preserve desc line breaks, accept the first valid CoC avatar alias, and report avatar-only imports with the actual target and result.

**Architecture:** Keep desc-specific line handling at the normalized-text boundary and use HTML serialization only for messages whose layout does not carry semantic line breaks. Normalize every avatar alias independently, then propagate avatar request/application counts and the page importer's resolved character name through the existing result formatter.

**Tech Stack:** CommonJS JavaScript, Node.js `node:test`, WebExtension popup/content scripts.

---

### Task 1: Preserve desc line breaks in shared snapshots

**Files:**
- Modify: `roll20-json-core/tests/message_snapshot_builder.test.js`
- Modify: `roll20-json-core/src/exporter/message_snapshot_builder.js:55-65`

**Step 1: Write the failing test**

Add a test that builds a `hasDescStyle: true` snapshot with `text: "첫 줄\n둘째 줄"` and `html: "<a>첫 줄</a><a>둘째 줄</a>"`, then asserts that the snapshot text remains two lines.

**Step 2: Run test to verify it fails**

Run: `node --test roll20-json-core/tests/message_snapshot_builder.test.js`

Expected: FAIL because the HTML serializer returns `첫 줄둘째 줄`.

**Step 3: Write minimal implementation**

In `resolveSnapshotText`, return the existing text for desc messages before attempting generic HTML serialization.

**Step 4: Run test to verify it passes**

Run: `node --test roll20-json-core/tests/message_snapshot_builder.test.js`

Expected: PASS.

**Step 5: Commit**

```bash
git add roll20-json-core/src/exporter/message_snapshot_builder.js roll20-json-core/tests/message_snapshot_builder.test.js
git commit -m "fix(export): desc 메시지 줄바꿈을 보존"
```

### Task 2: Select the first valid avatar alias

**Files:**
- Modify: `R20-JSONExporter/tests/coc7_import_payload.test.js`
- Modify: `R20-JSONExporter/js/content/import/coc7_import.js:143-154`

**Step 1: Write the failing tests**

Add separate cases for an empty `avatarUrl`, an invalid `avatarUrl`, and an invalid top-level alias with a valid nested alias. Each must resolve to the first later valid HTTP(S) or data-image URL.

**Step 2: Run tests to verify they fail**

Run: `node --test R20-JSONExporter/tests/coc7_import_payload.test.js`

Expected: FAIL with the existing no-applicable-fields error.

**Step 3: Write minimal implementation**

Build the ordered alias candidate list, normalize each candidate, and return the first non-empty normalized value.

**Step 4: Run tests to verify they pass**

Run: `node --test R20-JSONExporter/tests/coc7_import_payload.test.js`

Expected: PASS.

### Task 3: Report avatar-only imports accurately

**Files:**
- Modify: `R20-JSONExporter/tests/coc7_import_payload.test.js`
- Modify: `R20-JSONExporter/tests/popup_labels_contract.test.js`
- Modify: `R20-JSONExporter/js/content/import/coc7_import.js:437-460`
- Modify: `R20-JSONExporter/js/popup/popup.js:694-716`

**Step 1: Write failing tests**

Expose the existing result formatter through the test harness if necessary. Assert that an avatar-only page result uses the page importer's `characterName`, reports one requested and one applied avatar, and formats `Avatar 1/1`. Add a failure case that formats `Avatar 0/1`.

**Step 2: Run tests to verify they fail**

Run: `node --test R20-JSONExporter/tests/coc7_import_payload.test.js R20-JSONExporter/tests/popup_labels_contract.test.js`

Expected: FAIL because avatar counts are absent and the payload name is used.

**Step 3: Write minimal implementation**

Extend `summarizeApplyResult` with `requested.avatar`, `applied.pageAvatar`, and the resolved page character name. Extend `formatCocImportResult` to append the avatar count only when requested.

**Step 4: Run tests to verify they pass**

Run: `node --test R20-JSONExporter/tests/coc7_import_payload.test.js R20-JSONExporter/tests/popup_labels_contract.test.js`

Expected: PASS.

**Step 5: Commit CoC fixes**

```bash
git add R20-JSONExporter/js/content/import/coc7_import.js R20-JSONExporter/js/popup/popup.js R20-JSONExporter/tests/coc7_import_payload.test.js R20-JSONExporter/tests/popup_labels_contract.test.js
git commit -m "fix(coc-import): 아바타 별칭과 적용 결과를 정확히 처리"
```

### Task 4: Verify and publish

**Files:**
- Verify only: `R20-JSONExporter/release/*.zip`

**Step 1: Run all tests**

Run: `node --test roll20-json-core/tests/*.test.js R20-JSONExporter/tests/*.test.js R20-JSONExporter-firefox-mobile/tests/*.test.js`

Expected: zero failures.

**Step 2: Verify tracked changes and release artifacts**

Run `git diff --check`, verify all four ZIPs with `unzip -tqq`, and confirm the existing Chrome ZIP contains zero live tab buttons while keeping the ReadingLog panel visible.

**Step 3: Request code review**

Review the regression-fix commit range. Address all Critical and Important findings, then rerun the full verification.

**Step 4: Fast-forward and push**

Fast-forward local `main` to the reviewed branch, verify the original untracked files remain untouched, and push `main` to `origin/main` without force.

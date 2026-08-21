const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  SOURCE_SUBMISSION_STAGE_ROOT,
  SOURCE_SUBMISSION_ITEMS,
  SOURCE_SUBMISSION_README_TEMPLATE_PATH,
  SOURCE_SUBMISSION_ZIP_PATH,
  stageSourceSubmissionBundle,
} = require("../scripts/lib/source_submission_layout.js");

test("source submission bundle targets the firefox source set", () => {
  assert.deepEqual(SOURCE_SUBMISSION_ITEMS, [
    "R20-JSONExporter",
    "R20-JSONExporter-firefox-mobile",
    "R20-JSONExporter-safari-app",
    "roll20-json-core",
  ]);
  assert.equal(
    path.basename(SOURCE_SUBMISSION_README_TEMPLATE_PATH),
    "firefox-source-submission-README.md"
  );
  assert.equal(path.basename(SOURCE_SUBMISSION_ZIP_PATH), "firefox-mobile-source.zip");
});

test("source submission stage keeps the firefox mobile manifest at the zip root", () => {
  const result = stageSourceSubmissionBundle();

  assert.equal(result.stageRoot, SOURCE_SUBMISSION_STAGE_ROOT);
  assert.equal(
    fs.existsSync(path.join(SOURCE_SUBMISSION_STAGE_ROOT, "manifest.json")),
    true
  );
  assert.equal(
    fs.existsSync(path.join(SOURCE_SUBMISSION_STAGE_ROOT, "js", "background", "background.js")),
    true
  );
  assert.equal(
    fs.existsSync(
      path.join(SOURCE_SUBMISSION_STAGE_ROOT, "supporting-sources", "R20-JSONExporter", "package.json")
    ),
    true
  );
  assert.equal(
    fs.existsSync(
      path.join(
        SOURCE_SUBMISSION_STAGE_ROOT,
        "supporting-sources",
        "R20-JSONExporter-safari-app",
        "app.json"
      )
    ),
    true
  );
  assert.equal(
    fs.existsSync(
      path.join(
        SOURCE_SUBMISSION_STAGE_ROOT,
        "supporting-sources",
        "roll20-json-core",
        "package.json"
      )
    ),
    true
  );
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  SOURCE_SUBMISSION_README_TEMPLATE_PATH,
} = require("../scripts/lib/source_submission_layout.js");

test("source submission readme documents the exact build inputs and commands", () => {
  const readme = fs.readFileSync(SOURCE_SUBMISSION_README_TEMPLATE_PATH, "utf8");

  assert.match(readme, /R20-JSONExporter-firefox-mobile/);
  assert.match(readme, /R20-JSONExporter-safari-app/);
  assert.match(readme, /roll20-json-core/);
  assert.match(readme, /npm run build/);
  assert.match(readme, /npm run zip/);
  assert.match(readme, /Node\.js/);
  assert.match(readme, /npm/);
  assert.match(readme, /\bzip\b/);
});

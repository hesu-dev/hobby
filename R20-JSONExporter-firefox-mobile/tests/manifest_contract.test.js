const test = require("node:test");
const assert = require("node:assert/strict");

const manifest = require("../manifest.json");

test("firefox manifest targets Android self-distribution", () => {
  assert.equal(manifest.manifest_version, 2);
  assert.equal(manifest.version, "0.8.5");
  assert.equal(manifest.name, "R20-JSONExporter Mobile");
  assert.equal(manifest.browser_action?.default_title, "R20-JSONExporter");
  assert.equal("default_popup" in (manifest.browser_action || {}), false);
  assert.doesNotMatch(manifest.name, /firefox|mozilla/i);
  assert.doesNotMatch(manifest.description, /firefox|mozilla/i);
  assert.equal(
    manifest.browser_specific_settings?.gecko?.id,
    "r20-json-exporter-firefox@reha.dev"
  );
  assert.deepEqual(
    manifest.browser_specific_settings?.gecko?.data_collection_permissions,
    { required: ["none"] }
  );
  assert.equal(
    manifest.browser_specific_settings?.gecko_android?.strict_min_version,
    "142.0"
  );
  assert.ok(manifest.permissions.includes("clipboardWrite"));
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { buildSharedCoreBundle } = require("../scripts/lib/release_layout.js");

const manifestPath = path.join(
  __dirname,
  "..",
  "..",
  "R20-JSONExporter-safari-app",
  "ios",
  "Roll20SafariExtension",
  "Resources",
  "manifest.json"
);
const safariResourcesRoot = path.dirname(manifestPath);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readShortVersion(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  return content.match(
    /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/
  )?.[1];
}

test("safari source manifest declares popup messaging and native save permissions", () => {
  const manifest = readJson(manifestPath);

  assert.equal(manifest.version, "0.8.5");
  assert.equal(manifest.name, "리딩로그: 파일 가져오기");
  assert.equal(
    manifest.description,
    "Safiri 확장을 통해, Roll20 채팅 로그를 리딩로그로 복사합니다."
  );
  assert.ok(Array.isArray(manifest.permissions));
  assert.ok(manifest.permissions.includes("tabs"));
  assert.ok(manifest.permissions.includes("nativeMessaging"));
  assert.deepEqual(manifest.background?.scripts, ["js/background/background.js"]);
  assert.equal(manifest.background?.persistent, false);
  assert.equal(manifest.background?.service_worker, undefined);
  assert.ok(Array.isArray(manifest.host_permissions));
  assert.ok(manifest.host_permissions.includes("https://*.roll20.net/*"));
  assert.ok(manifest.host_permissions.includes("https://*.gravatar.com/*"));
  assert.deepEqual(manifest.content_scripts?.[0]?.js?.[0], "js/vendor/roll20-json-core.js");
  assert.ok(
    manifest.web_accessible_resources?.[0]?.resources?.includes?.("js/page_avatar_resolver.js")
  );
  assert.ok(
    fs.existsSync(path.join(safariResourcesRoot, "js", "background", "background.js"))
  );
  assert.ok(
    fs.existsSync(path.join(safariResourcesRoot, "js", "page_avatar_resolver.js"))
  );
  assert.ok(
    fs.existsSync(path.join(safariResourcesRoot, "js", "vendor", "roll20-json-core.js"))
  );
  assert.equal(
    fs.readFileSync(path.join(safariResourcesRoot, "js", "vendor", "roll20-json-core.js"), "utf8"),
    `${buildSharedCoreBundle()}\n`
  );
});

test("release version metadata stays synchronized at 0.8.5", () => {
  const projectRoot = path.join(__dirname, "..");
  const repoRoot = path.join(projectRoot, "..");
  const expectedVersion = "0.8.5";

  assert.equal(readJson(path.join(projectRoot, "package.json")).version, expectedVersion);
  assert.equal(readJson(path.join(projectRoot, "manifest.json")).version, expectedVersion);
  assert.equal(
    readJson(path.join(repoRoot, "R20-JSONExporter-firefox-mobile", "manifest.json")).version,
    expectedVersion
  );
  assert.equal(readJson(manifestPath).version, expectedVersion);
  assert.equal(
    readShortVersion(path.join(safariResourcesRoot, "..", "Info.plist")),
    expectedVersion
  );
  assert.equal(
    readShortVersion(path.join(safariResourcesRoot, "..", "..", "Runner", "Info.plist")),
    expectedVersion
  );
});

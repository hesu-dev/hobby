const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const core = require("../../roll20-json-core/src/index.js");

test("browser contract groups parser and chat modules", () => {
  assert.equal(typeof core.browserContract, "object");
  assert.equal(typeof core.browserContract.chatJson.parseRoll20DicePayload, "function");
  assert.equal(typeof core.browserContract.parserUtils.normalizeText, "function");
  assert.equal(
    typeof core.browserContract.parserUtils.serializeInlineFormattingHtmlToMarkdown,
    "function"
  );
  assert.equal(typeof core.browserContract.cocRuleParser.parseCocRulePayload, "function");
  assert.equal(typeof core.browserContract.insaneRuleParser.parseInsaneRulePayload, "function");
});

test("desktop and mobile content pass cleaned message html to the shared snapshot builder", () => {
  const desktopContent = fs.readFileSync(
    path.join(__dirname, "..", "js", "content", "core", "content.js"),
    "utf8"
  );
  const mobileContent = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "..",
      "R20-JSONExporter-firefox-mobile",
      "js",
      "content",
      "core",
      "content.js"
    ),
    "utf8"
  );

  assert.match(desktopContent, /html:\s*extractMessageHtml\(messageEl\)/);
  assert.match(mobileContent, /html:\s*extractMessageHtml\(messageEl\)/);
});

const test = require("node:test");
const assert = require("node:assert/strict");

const parserUtils = require("../src/parsers/parser_utils.js");

test("toSafeText strips unsupported punctuation but keeps spacing", () => {
  assert.equal(parserUtils.toSafeText("  [홍길동] !!!  "), "홍길동 !!!");
});

test("normalizeText converts smart double quotes to ascii double quotes", () => {
  assert.equal(
    parserUtils.normalizeText(" “비밀”  ”단서”  〝기억〞  ＂기록＂ "),
    '"비밀" "단서" "기억" "기록"'
  );
});

test("extractTemplateName reads rolltemplate names", () => {
  assert.equal(
    parserUtils.extractTemplateName('<div class="sheet-rolltemplate-coc-bonus-penalty"></div>'),
    "coc-bonus-penalty"
  );
});

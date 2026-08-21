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

test("extractTemplateName preserves type-prefixed rolltemplate names", () => {
  assert.equal(
    parserUtils.extractTemplateName(
      '<div class="sheet-rolltemplate-type-coc-attack-1"></div>'
    ),
    "type-coc-attack-1"
  );
});

test("serializeInlineFormattingHtmlToMarkdown preserves em and strong as markdown markers", () => {
  assert.equal(
    parserUtils.serializeInlineFormattingHtmlToMarkdown("<em>안녕하세요</em>"),
    "*안녕하세요*"
  );
  assert.equal(
    parserUtils.serializeInlineFormattingHtmlToMarkdown("<strong>안녕하세요</strong>"),
    "**안녕하세요**"
  );
  assert.equal(
    parserUtils.serializeInlineFormattingHtmlToMarkdown(
      "<strong><em>안녕하세요</em></strong>"
    ),
    "***안녕하세요***"
  );
  assert.equal(
    parserUtils.serializeInlineFormattingHtmlToMarkdown(
      "<em><strong>안녕하세요</strong></em>"
    ),
    "***안녕하세요***"
  );
});

test("serializeInlineFormattingHtmlToMarkdown decodes basic entities while stripping non-formatting tags", () => {
  assert.equal(
    parserUtils.serializeInlineFormattingHtmlToMarkdown(
      '<span><em>&lt;단서&gt;</em></span> <span><strong>A&amp;B</strong></span>'
    ),
    "*<단서>* **A&B**"
  );
});

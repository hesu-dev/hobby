const test = require("node:test");
const assert = require("node:assert/strict");

const importer = require("../js/content/import/macro_import.js");

test("macro import parser accepts wrapped JSON and normalizes macro entries", () => {
  const payload = importer.parseMacroImportText(`
[R20JE:MACRO_IMPORT:1]
{
  "macros": {
    "관찰력": "/roll 1d100",
    "SAN 체크": {
      "action": "/roll 1d100",
      "visibleto": "all",
      "istokenaction": true
    }
  }
}
[/R20JE]
`);

  assert.deepEqual(payload, {
    schema: "R20JE_MACRO_IMPORT",
    version: 1,
    macros: [
      {
        name: "관찰력",
        action: "/roll 1d100",
        visibleto: "",
        istokenaction: false,
      },
      {
        name: "SAN 체크",
        action: "/roll 1d100",
        visibleto: "all",
        istokenaction: true,
      },
    ],
  });
});

test("macro import parser accepts a top-level macro array", () => {
  const payload = importer.parseMacroImportText(`
[
  { "name": "비밀문", "command": "/w gm 열쇠 확인" },
  { "name": "비밀문", "command": "/w gm 덮어쓰기" }
]
`);

  assert.deepEqual(payload.macros, [
    {
      name: "비밀문",
      action: "/w gm 덮어쓰기",
      visibleto: "",
      istokenaction: false,
    },
  ]);
});

test("macro import parser rejects payloads without any macro actions", () => {
  assert.throws(
    () => importer.parseMacroImportText('{ "macros": { "빈 매크로": "" } }'),
    /적용할 macros가 없습니다/
  );
});

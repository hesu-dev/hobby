const test = require("node:test");
const assert = require("node:assert/strict");

const importer = require("../js/content/import/coc7_import.js");

test("coc7 import parser accepts wrapped JSON and normalizes attributes and abilities", () => {
  const payload = importer.parseCoc7ImportText(`
[R20JE:COC7_IMPORT:1]
{
  "character": "로즈",
  "fields": [
    { "name": "attr_str", "value": 65 }
  ],
  "attributes": {
    "san": { "current": 50, "max": 99 }
  },
  "abilities": {
    "R20JE-테스트": "/em R20JE 테스트 [[1d100]]"
  }
}
[/R20JE]
`);

  assert.equal(payload.characterName, "로즈");
  assert.deepEqual(payload.attributes, [
    {
      inputName: "attr_str",
      roll20Name: "str",
      current: "65",
      max: "",
    },
    {
      inputName: "attr_san",
      roll20Name: "san",
      current: "50",
      max: "99",
    },
  ]);
  assert.deepEqual(payload.abilities, [
    {
      name: "R20JE-테스트",
      action: "/em R20JE 테스트 [[1d100]]",
      istokenaction: false,
    },
  ]);
});

test("coc7 sample import targets Rose and creates a visible test attribute and ability", () => {
  const sample = importer.buildCoc7ImportSampleText("로즈");
  const payload = importer.parseCoc7ImportText(sample);

  assert.equal(payload.characterName, "로즈");
  assert.ok(payload.attributes.some((attribute) => attribute.roll20Name === "r20je_import_test"));
  assert.ok(payload.abilities.some((ability) => ability.name === "R20JE-테스트"));
});

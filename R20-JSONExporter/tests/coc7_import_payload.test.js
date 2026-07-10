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

test("coc7 importer does not expose a built-in Rose sample generator", () => {
  assert.equal(importer.buildCoc7ImportSampleText, undefined);
});

test("coc7 import parser allows missing character names for active sheet targeting", () => {
  const payload = importer.parseCoc7ImportText(`
{
  "attributes": {
    "str": { "current": 65 }
  }
}
`);

  assert.equal(payload.characterName, "");
  assert.deepEqual(payload.attributes, [
    {
      inputName: "attr_str",
      roll20Name: "str",
      current: "65",
      max: "",
    },
  ]);
});

test("open sheet DOM import applies attributes to the active sheet before a name match", () => {
  const originalGlobals = {
    document: global.document,
    Event: global.Event,
    HTMLInputElement: global.HTMLInputElement,
    HTMLSelectElement: global.HTMLSelectElement,
    HTMLTextAreaElement: global.HTMLTextAreaElement,
  };

  class FakeInput {
    constructor(name, value = "") {
      this.name = name;
      this.value = value;
      this.textContent = "";
      this.parent = null;
      this.events = [];
    }

    closest(selector) {
      return this.parent?.matches?.(selector) ? this.parent : null;
    }

    dispatchEvent(event) {
      this.events.push(event.type);
    }
  }

  class FakeRoot {
    constructor(nameValue, strValue) {
      this.className = "charsheet";
      this.nameInput = new FakeInput("attr_character_name", nameValue);
      this.strInput = new FakeInput("attr_str", strValue);
      this.nameInput.parent = this;
      this.strInput.parent = this;
      this.inputs = [this.nameInput, this.strInput];
    }

    matches(selector) {
      return selector === ".charsheet";
    }

    contains(node) {
      return this.inputs.includes(node);
    }

    querySelector(selector) {
      if (selector === '[name^="attr_"]') return this.inputs.find((input) => input.name.startsWith("attr_"));
      const nameMatch = selector.match(/^\[name="(.+)"\]$/);
      if (!nameMatch) return null;
      return this.inputs.find((input) => input.name === nameMatch[1]) || null;
    }
  }

  const activeSheet = new FakeRoot("앨리스", "");
  const roseSheet = new FakeRoot("로즈", "");

  try {
    global.Event = class {
      constructor(type) {
        this.type = type;
      }
    };
    global.HTMLInputElement = FakeInput;
    global.HTMLSelectElement = class {};
    global.HTMLTextAreaElement = class {};
    global.document = {
      activeElement: activeSheet.strInput,
      querySelectorAll(selector) {
        if (selector === ".charsheet") return [roseSheet, activeSheet];
        if (selector.includes('[name="attr_character_name"]')) {
          return [roseSheet.nameInput, activeSheet.nameInput];
        }
        return [];
      },
    };

    const result = importer.applyAttributesToOpenSheet({
      characterName: "로즈",
      attributes: [
        {
          inputName: "attr_str",
          roll20Name: "str",
          current: "65",
          max: "",
        },
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(activeSheet.strInput.value, "65");
    assert.equal(roseSheet.strInput.value, "");
  } finally {
    Object.assign(global, originalGlobals);
  }
});
